const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { JSDOM } = require("jsdom");
const M = require("../src/model.js")();
const C = require("../extension/core.js");
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");
const pause = (ms = 190) => new Promise((r) => setTimeout(r, ms));
function storage(seed = {}) {
  const data = { ...seed },
    listeners = [];
  return {
    data,
    listeners,
    api: {
      get: async (keys) =>
        keys === null
          ? { ...data }
          : Object.fromEntries(
              Object.keys(keys || {}).map((k) => [k, data[k] ?? keys[k]]),
            ),
      set: async (entries) => {
        const changes = {};
        for (const [k, v] of Object.entries(entries)) {
          changes[k] = { oldValue: data[k], newValue: v };
          data[k] = v;
        }
        listeners.forEach((l) => l(changes, "local"));
      },
      remove: async (key) => {
        const old = data[key];
        delete data[key];
        listeners.forEach((l) => l({ [key]: { oldValue: old } }, "local"));
      },
    },
  };
}
function background(store) {
  let listener;
  const chrome = {
    runtime: {
      id: "test",
      getURL: (p) => "chrome-extension://test/" + p,
      onMessage: { addListener: (f) => (listener = f) },
    },
    storage: { local: store.api },
    tabs: { create: async () => {} },
  };
  vm.runInNewContext(read("background.js"), {
    chrome,
    URL,
    TextEncoder,
    console,
  });
  return (message) =>
    new Promise((resolve) => listener(message, { id: "test" }, resolve));
}
const post = {
  url: "https://x.com/alice/status/123",
  author: "Alice",
  handle: "alice",
  text: "AI 产品案例",
  tags: ["AI"],
  category: "案例",
  note: "值得复用",
};
test("all 64 feature combinations preserve independent choices; legacy enabled migrates", () => {
  for (let mask = 0; mask < 64; mask++) {
    const raw = Object.fromEntries(
      M.features.map(([k], i) => [k, !!(mask & (1 << i))]),
    );
    const p = M.prefs(raw);
    for (const [k] of M.features) assert.equal(p[k], raw[k]);
  }
  assert.equal(M.prefs({ enabled: false }).enabled, false);
  assert.equal(M.prefs({ enabled: false }).filterEnabled, true);
});
test("local store serializes concurrent saves, keeps notes, gates disabled modules, and supports a backup round trip", async () => {
  const store = storage(),
    send = background(store);
  const result = await Promise.all([
    send({ type: "xkit-save-post", post }),
    send({
      type: "xkit-save-post",
      post: { ...post, url: "https://x.com/alice/status/456" },
    }),
    send({
      type: "xkit-save-note",
      note: { handle: "Alice", text: "AI 产品研究者" },
    }),
  ]);
  assert.ok(result.every((r) => r.ok));
  assert.equal(Object.keys(store.data).length, 3);
  await store.api.set({ libraryEnabled: false, notesEnabled: false });
  assert.equal((await send({ type: "xkit-save-post", post })).ok, false);
  assert.equal(
    (
      await send({
        type: "xkit-save-note",
        note: { handle: "alice", text: "overwrite" },
      })
    ).ok,
    false,
  );
  assert.equal(store.data["note:alice"].text, "AI 产品研究者");
  const backup = {
    app: "x-kit",
    schema: 1,
    posts: Object.values(store.data).filter((v) => v?.id),
    notes: [store.data["note:alice"]],
  };
  const restored = storage(),
    restore = background(restored);
  const imported = await restore({ type: "xkit-import", backup });
  assert.equal(imported.added, 3);
  assert.equal((await restore({ type: "xkit-import", backup })).skipped, 3);
  const bad = await restore({
    type: "xkit-import",
    backup: { ...backup, posts: [post, { url: "javascript:bad" }] },
  });
  assert.equal(bad.ok, false);
  assert.equal(Object.keys(restored.data).length, 3);
});
test("search matches notes and tags; export retains source, Unicode, quotes and scope", () => {
  const p = M.normalizePost({
    ...post,
    text: "中文正文\n第二段",
    quoted: "引用内容",
    images: ["https://pbs.twimg.com/media/test.jpg", "javascript:bad"],
    tags: "AI，产品",
  });
  assert.equal(M.searchPosts([p], "复用 产品").length, 1);
  assert.equal(M.searchPosts([p], "无关").length, 0);
  assert.equal(p.images.length, 1);
  const md = M.markdown([p]);
  for (const term of [
    "https://x.com/alice/status/123",
    "中文正文",
    "引用内容",
    "不保证线程或文章完整",
    "值得复用",
  ])
    assert.ok(md.includes(term));
  assert.throws(() =>
    M.normalizePost({ url: "https://evil.test/alice/status/123" }),
  );
  assert.throws(() => M.validateBackup({ app: "other" }));
});
test("noise rules are literal, reversible and allowlist wins", () => {
  assert.equal(M.noiseMatch(post, { noiseKeywords: "产品" }), "关键词：产品");
  assert.equal(M.noiseMatch(post, { noiseKeywords: ".*" }), "");
  assert.equal(
    M.noiseMatch(post, {
      noiseKeywords: "产品",
      noiseAccounts: "alice",
      noiseAllow: "@Alice",
    }),
    "",
  );
});
function setupContent() {
  const store = storage();
  const send = background(store);
  const html = `<main><article data-testid="tweet"><div data-testid="User-Name"><a href="/alice"><span>Alice</span></a><a href="/alice"><span>@alice</span></a></div><a href="/alice/status/123"><time datetime="2026-10-09T00:00:00Z">今天</time></a><div data-testid="tweetText">AI 产品案例</div></article></main>`;
  const dom = new JSDOM(html, {
    url: "https://x.com/home",
    runScripts: "outside-only",
  });
  dom.window.chrome = {
    storage: {
      local: store.api,
      onChanged: { addListener: (fn) => store.listeners.push(fn) },
    },
    runtime: { onMessage: { addListener: () => {} }, sendMessage: send },
  };
  dom.window.eval(read("content.js"));
  return { dom, doc: dom.window.document, store, send };
}
test("content modules turn off independently, no duplicate controls, and noise restores on disable", async () => {
  const s = setupContent();
  try {
    s.dom.window.dispatchEvent(
      new s.dom.window.MessageEvent("message", {
        source: s.dom.window,
        origin: "https://x.com",
        data: {
          channel: C.CHANNEL,
          type: "records",
          records: [{ handle: "alice", count: 12000, at: Date.now() }],
        },
      }),
    );
    await pause();
    assert.equal(s.doc.querySelectorAll(".xfb-badge").length, 1);
    assert.equal(s.doc.querySelectorAll(".xkit-note-button").length, 1);
    assert.equal(s.doc.querySelectorAll(".xkit-post-actions button").length, 2);
    await s.store.api.set({ enabled: false, notesEnabled: false });
    await pause();
    assert.equal(
      s.doc.querySelectorAll(".xfb-badge,.xkit-note-button").length,
      0,
    );
    assert.equal(s.doc.querySelectorAll(".xkit-post-actions button").length, 2);
    await s.store.api.set({ libraryEnabled: false });
    await pause();
    assert.equal(s.doc.querySelectorAll(".xkit-post-actions button").length, 1);
    assert.equal(
      s.doc.querySelector(".xkit-post-actions button").textContent,
      "导出",
    );
    await s.store.api.set({ noiseKeywords: "产品" });
    await pause();
    assert.equal(s.doc.querySelectorAll(".xkit-folded").length, 1);
    s.doc.querySelector(".xkit-noise-notice button").click();
    await pause();
    assert.equal(s.doc.querySelectorAll(".xkit-folded").length, 0);
    await s.store.api.set({ noiseKeywords: "AI" });
    await pause();
    assert.equal(s.doc.querySelectorAll(".xkit-folded").length, 1);
    await s.store.api.set(
      Object.fromEntries(M.features.map(([k]) => [k, false])),
    );
    await pause();
    assert.equal(
      s.doc.querySelectorAll(
        ".xkit-pagebar,.xkit-post-actions,.xkit-note-button,.xkit-folded,.xfb-badge,.xfb-filter",
      ).length,
      0,
    );
  } finally {
    s.dom.window.close();
  }
});
test("save dialog writes user labels and notes to storage; account note reflects after save", async () => {
  const s = setupContent();
  try {
    await pause();
    [...s.doc.querySelectorAll(".xkit-post-actions button")]
      .find((b) => b.textContent === "存入素材库")
      .click();
    const fields = s.doc.querySelectorAll(
      ".xkit-dialog input,.xkit-dialog textarea",
    );
    fields[0].value = "选题";
    fields[1].value = "AI,商业";
    fields[2].value = "以后写成本案例";
    [...s.doc.querySelectorAll(".xkit-dialog button")]
      .find((b) => b.textContent === "保存")
      .click();
    await pause();
    assert.equal(s.store.data["post:123"].note, "以后写成本案例");
    assert.deepEqual([...s.store.data["post:123"].tags], ["AI", "商业"]);
    s.doc.querySelector(".xkit-close").click();
    s.doc.querySelector(".xkit-note-button").click();
    s.doc.querySelector(".xkit-dialog textarea").value = "长期关注";
    [...s.doc.querySelectorAll(".xkit-dialog button")]
      .find((b) => b.textContent === "保存备注")
      .click();
    await pause();
    assert.equal(s.store.data["note:alice"].text, "长期关注");
    assert.match(
      s.doc.querySelector(".xkit-note-button").textContent,
      /长期关注/,
    );
  } finally {
    s.dom.window.close();
  }
});
