const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};
http
  .createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const assetPath =
      pathname === "/demo/following" ? "/preview/following.html" : pathname;
    const filename = path.resolve(
      root,
      "." +
        decodeURIComponent(
          assetPath.endsWith("/") ? assetPath + "index.html" : assetPath,
        ),
    );
    if (
      !filename.startsWith(root + path.sep) ||
      !/^\/(preview|extension)\//.test(assetPath)
    ) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(filename, (error, data) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      if (
        ["/extension/popup.html", "/extension/library.html"].includes(pathname)
      ) {
        data = data
          .toString()
          .replace(
            "<script src=",
            '<script src="/preview/dev-runtime.js"></script><script src="/extension/background.js"></script><script src=',
          );
      }
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(filename)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(data);
    });
  })
  .listen(8791, "127.0.0.1", () =>
    console.log("http://127.0.0.1:8791/preview/"),
  );
