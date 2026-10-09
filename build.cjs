const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
// Chrome must not need to share a global helper between separately registered worlds.
// Inline the pure core in each entry point so either script runs completely alone.
const core = fs.readFileSync(path.join(root, "extension/core.js"), "utf8");
const factory = core.replace(
  /  if \(typeof module[^\n]*\n  else Object\.defineProperty[^\n]*\n/,
  "  return api;\n",
);
if (!factory.includes("return api;"))
  throw new Error("Core factory export not found");
for (const name of [
  "content.js",
  "page-hook.js",
  "background.js",
  "popup.js",
  "library.js",
]) {
  let template = fs.readFileSync(path.join(root, "src", name), "utf8");
  template = template.replace("/* LIST_FILTER_FACTORY */", () =>
    fs.readFileSync(path.join(root, "src/list-filter.js"), "utf8"),
  );
  template = template.replace("/* MODEL_FACTORY */", () =>
    fs
      .readFileSync(path.join(root, "src/model.js"), "utf8")
      .split("// MODEL_EXPORT")[0],
  );
  template = template.replace("/* POST_TOOLS_FACTORY */", () =>
    fs.readFileSync(path.join(root, "src/post-tools.js"), "utf8"),
  );
  const result = template.replace(
    "const C = globalThis.__XFB_CORE_V1__;",
    () => "const C = " + factory,
  );
  if (result === template && ["content.js", "page-hook.js"].includes(name))
    throw new Error("Entry point core marker not found: " + name);
  fs.writeFileSync(path.join(root, "extension", name), result);
}
let html = fs.readFileSync(path.join(root, "preview/index.html"), "utf8");
html = html.replace(
  '<link rel="stylesheet" href="/extension/badges.css">',
  "<style>" +
    fs.readFileSync(path.join(root, "extension/badges.css"), "utf8") +
    "</style>",
);
for (const [url, filename] of [
  ["harness.js", "preview/harness.js"],
  ["/extension/core.js", "extension/core.js"],
  ["/extension/content.js", "extension/content.js"],
  ["demo.js", "preview/demo.js"],
]) {
  let content = fs.readFileSync(path.join(root, filename), "utf8");
  // file:// previews have a null origin, so use * only in the separate demo bundle.
  content = content
    .replaceAll("},location.origin)", "},'*')")
    .replaceAll("}, location.origin)", "}, '*')");
  html = html.replace(
    '<script src="' + url + '"></script>',
    "<script>" + content.replaceAll("</script", "<\\/script") + "</script>",
  );
}
fs.writeFileSync(path.join(root, "效果预览.html"), html);
fs.copyFileSync(
  path.join(root, "README.md"),
  path.join(root, "extension/安装说明.md"),
);
for (const name of ["LICENSE", "PRIVACY.md"])
  fs.copyFileSync(path.join(root, name), path.join(root, "extension", name));
console.log(
  "Built independent extension scripts, standalone preview and installation guide.",
);
