const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const dir = path.join(__dirname, "../extension");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
test("popup loads preferences, reports page status and writes preference changes", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(dir, "popup.html"), "utf8"), {
    runScripts: "outside-only",
  });
  const writes = [];
  dom.window.chrome = {
    storage: {
      local: {
        get: async () => ({ enabled: true, format: "compact" }),
        set: async (v) => writes.push(v),
      },
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async () => ({
        version: "2.0.0",
        enabled: true,
        users: 4,
        badges: 2,
      }),
    },
  };
  try {
    dom.window.eval(fs.readFileSync(path.join(dir, "popup.js"), "utf8"));
    await pause(20);
    assert.match(
      dom.window.document.querySelector("#detail").textContent,
      /4 个账号.*2 个粉丝标签/,
    );
    assert.equal(
      dom.window.document.querySelectorAll('[role="switch"]').length,
      6,
    );
    const select = dom.window.document.querySelector("#format");
    select.value = "exact";
    select.dispatchEvent(new dom.window.Event("change"));
    await pause(20);
    assert.equal(writes[0].format, "exact");
    const toggle = dom.window.document.querySelector("#enabled");
    toggle.checked = false;
    toggle.dispatchEvent(new dom.window.Event("change"));
    await pause(20);
    assert.equal(writes[1].enabled, false);
  } finally {
    dom.window.close();
  }
});
test("manifest loads all scripts and limits permissions and origins", () => {
  const m = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ["storage"]);
  assert.equal(m.content_scripts[0].world, "MAIN");
  for (const script of m.content_scripts) {
    assert.equal(script.run_at, "document_start");
    for (const file of [...(script.js || []), ...(script.css || [])])
      assert.ok(fs.existsSync(path.join(dir, file)), file);
    assert.ok(
      script.matches.every((match) =>
        /^https:\/\/(www\.)?(x|twitter)\.com\/\*$/.test(match),
      ),
    );
  }
  assert.ok(fs.existsSync(path.join(dir, m.action.default_popup)));
});
