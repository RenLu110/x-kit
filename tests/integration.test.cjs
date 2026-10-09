const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const C = require("../extension/core.js");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const user = (name, followers) => ({
  core: { screen_name: name },
  relationship_counts: { followers },
});

test("fetch hook preserves response, rejection, and only relays sanitized user counts; ready replays early data", async () => {
  const emitted = [];
  const listeners = {};
  let response = new Response(
    JSON.stringify({ data: user("Alice", 12345), private: "not-forwarded" }),
  );
  let expected = Promise.resolve(response);
  class XHR {
    open() {}
    addEventListener() {}
  }
  const scope = {
    fetch: () => expected,
    XMLHttpRequest: XHR,
    location: { href: "https://x.com/home", origin: "https://x.com" },
    setTimeout,
    Map,
    WeakMap,
    WeakSet,
    URL,
    postMessage: (m) => emitted.push(m),
    addEventListener: (type, cb) => {
      listeners[type] = cb;
    },
  };
  scope.window = scope;
  const context = vm.createContext(scope);
  vm.runInContext(source("page-hook.js"), context);
  assert.equal(scope.fetch("/i/api/graphql/abc/HomeTimeline"), expected);
  assert.equal(
    await (await expected).json().then((v) => v.private),
    "not-forwarded",
  );
  await pause(150);
  assert.equal(emitted.length, 1);
  assert.deepEqual(Object.keys(emitted[0].records[0]).sort(), [
    "at",
    "count",
    "handle",
  ]);
  assert.equal(emitted[0].records[0].count, 12345);
  listeners.message({
    source: vm.runInContext("window", context),
    origin: "https://x.com",
    data: { channel: C.CHANNEL, type: "ready" },
  });
  await pause(100);
  assert.equal(emitted.length, 2);
  expected = Promise.reject(new Error("offline"));
  assert.equal(scope.fetch("/i/api/graphql/abc/HomeTimeline"), expected);
  await assert.rejects(expected, /offline/);
  await pause(10);
});

test("XHR hook covers text and JSON, reused XHR, errors and unrelated hosts", async () => {
  const emitted = [];
  class XHR {
    open(method, url) {
      this.url = url;
    }
    addEventListener(type, cb) {
      this.callback = cb;
    }
  }
  const scope = {
    fetch: () => Promise.resolve(),
    XMLHttpRequest: XHR,
    location: { href: "https://x.com/home", origin: "https://x.com" },
    setTimeout,
    URL,
    postMessage: (m) => emitted.push(m),
    addEventListener: () => {},
  };
  scope.window = scope;
  vm.runInNewContext(source("page-hook.js"), scope);
  const xhr = new XHR();
  xhr.open("GET", "/i/api/graphql/abc/Followers");
  xhr.status = 200;
  xhr.responseType = "json";
  xhr.response = user("bob", 0);
  xhr.callback();
  await pause(100);
  assert.equal(emitted[0].records[0].count, 0);
  xhr.open("GET", "/i/api/graphql/abc/Followers");
  xhr.responseType = "";
  xhr.responseText = JSON.stringify(user("alice", 77));
  xhr.callback();
  await pause(100);
  assert.equal(emitted[1].records[0].count, 77);
  xhr.status = 429;
  xhr.callback();
  xhr.status = 200;
  xhr.open("GET", "https://example.com/2/users");
  xhr.callback();
  await pause(100);
  assert.equal(emitted.length, 2);
});

function setup(html) {
  const dom = new JSDOM(html, {
    url: "https://x.com/home",
    runScripts: "outside-only",
  });
  let change;
  dom.window.chrome = {
    storage: {
      local: { get: async (defaults) => defaults },
      onChanged: { addListener: (fn) => (change = fn) },
    },
    runtime: { onMessage: { addListener: () => {} } },
  };
  // Regression: run the actual packaged content entry with NO shared core global.
  assert.equal(dom.window.__XFB_CORE_V1__, undefined);
  dom.window.eval(source("content.js"));
  function send(records, origin = "https://x.com") {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: dom.window,
        origin,
        data: {
          channel: C.CHANNEL,
          type: "records",
          records: records.map((r) => ({ at: Date.now(), ...r })),
        },
      }),
    );
  }
  return {
    dom,
    doc: dom.window.document,
    send,
    change: (v) => change(v, "local"),
  };
}
test("DOM rendering, missing counts, zero, inline mentions, duplicate prevention, updates, preferences and recycled rows", async () => {
  const s = setup(
    '<main><div data-testid="User-Name"><a id="alice" href="/Alice"><div><span>@Alice</span></div></a></div><div data-testid="UserCell"><a href="/Bob"><span>@Bob</span></a></div><a href="/Unknown"><span>@Unknown</span></a><div data-testid="tweetText"><a href="/Alice"><span>@Alice</span></a></div></main>',
  );
  try {
    s.send([
      { handle: "alice", count: 12345 },
      { handle: "bob", count: 0 },
    ]);
    await pause(200);
    assert.equal(s.doc.querySelectorAll(".xfb-badge").length, 2);
    assert.equal(
      s.doc.querySelector("#alice .xfb-badge").textContent,
      "粉丝 1.2万",
    );
    assert.equal(
      s.doc.querySelector('[data-testid="tweetText"] .xfb-badge'),
      null,
    );
    s.send([{ handle: "alice", count: 23456 }]);
    await pause(200);
    assert.equal(s.doc.querySelectorAll(".xfb-badge").length, 2);
    assert.equal(
      s.doc.querySelector("#alice .xfb-badge").textContent,
      "粉丝 2.3万",
    );
    s.change({ format: { newValue: "exact" } });
    await pause(200);
    assert.equal(
      s.doc.querySelector("#alice .xfb-badge").textContent,
      "粉丝 23,456",
    );
    s.change({ enabled: { newValue: false } });
    await pause(200);
    assert.equal(s.doc.querySelectorAll(".xfb-badge").length, 0);
    s.change({ enabled: { newValue: true } });
    await pause(200);
    assert.equal(s.doc.querySelectorAll(".xfb-badge").length, 2);
    const a = s.doc.querySelector("#alice");
    a.href = "/Charlie";
    a.querySelector("span").textContent = "@Charlie";
    await pause(200);
    assert.equal(a.querySelector(".xfb-badge"), null);
    s.send([{ handle: "charlie", count: 7 }]);
    await pause(200);
    assert.equal(a.querySelector(".xfb-badge").textContent, "粉丝 7");
    const row = s.doc.createElement("div");
    row.innerHTML = '<a href="/Charlie"><span>@Charlie</span></a>';
    s.doc.querySelector("main").append(row);
    await pause(200);
    assert.equal(row.querySelector(".xfb-badge").textContent, "粉丝 7");
  } finally {
    s.dom.window.close();
  }
});
test("bridge ignores foreign origin, invalid counts, stale records and out-of-order updates", async () => {
  const s = setup('<main><a href="/alice"><span>@alice</span></a></main>');
  try {
    s.send([{ handle: "alice", count: 9 }], "https://evil.test");
    s.send([
      { handle: "alice", count: -1 },
      { handle: "alice", count: 100, at: Date.now() - C.TTL - 100 },
    ]);
    await pause(200);
    assert.equal(s.doc.querySelector(".xfb-badge"), null);
    s.send([{ handle: "alice", count: 300 }]);
    s.send([{ handle: "alice", count: 100, at: Date.now() - 5000 }]);
    await pause(200);
    assert.equal(s.doc.querySelector(".xfb-badge").textContent, "粉丝 300");
  } finally {
    s.dom.window.close();
  }
});
