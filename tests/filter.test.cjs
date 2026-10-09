const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const C = require("../extension/core.js");
const pause = () => new Promise((resolve) => setTimeout(resolve, 190));
function cell(handle, name, bio) {
  return `<div role="button" data-testid="UserCell"><div><div><a aria-hidden="true" href="https://x.com/${handle}"></a></div><div><div><a href="https://x.com/${handle}"><span>${name}</span></a><a href="https://x.com/${handle}"><span>@${handle}</span></a><button data-testid="1-unfollow">正在关注</button></div><div dir="auto">${bio}</div></div></div></div>`;
}
function setup(
  route = "/owner/following",
  rows = cell("alice", "Alice", "AI 产品研究") +
    cell("bob", "Bob", "设计工具") +
    cell("carol", "Carol", "AI 内容创作"),
) {
  const dom = new JSDOM(
    `<main><div data-testid="primaryColumn"><a role="tab" aria-selected="true" href="${route}">正在关注</a><section role="region" aria-labelledby="list1">${rows}</section></div><aside>${cell("sidebar", "推荐账号", "AI")}</aside></main>`,
    { url: "https://x.com" + route, runScripts: "outside-only" },
  );
  dom.window.chrome = {
    storage: {
      local: { get: async (defaults) => defaults },
      onChanged: { addListener: () => {} },
    },
    runtime: { onMessage: { addListener: () => {} } },
  };
  dom.window.eval(
    fs.readFileSync(path.join(__dirname, "../extension/content.js"), "utf8"),
  );
  const doc = dom.window.document;
  function send(records) {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: dom.window,
        origin: "https://x.com",
        data: {
          channel: C.CHANNEL,
          type: "records",
          records: records.map(([handle, count]) => ({
            handle,
            count,
            at: Date.now(),
          })),
        },
      }),
    );
  }
  function input(selector, value) {
    const el = doc.querySelector(selector);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  }
  return {
    dom,
    doc,
    send,
    input,
    names: () =>
      [...doc.querySelectorAll(".xfb-result-handle")].map((e) => e.textContent),
  };
}
test("bounds support units, reject invalid input and use inclusive comparisons", () => {
  assert.equal(C.bound("1.2万"), 12000);
  assert.equal(C.bound("10k"), 10000);
  assert.equal(C.bound("1,500"), 1500);
  assert.equal(C.bound(""), null);
  for (const input of ["-1", "1.3", "abc", "Infinity", "2w"])
    assert.ok(Number.isNaN(C.bound(input)));
  const rows = [
    { handle: "a", count: 1000 },
    { handle: "b", count: 10000 },
    { handle: "c" },
  ];
  assert.deepEqual(
    C.filterUsers(rows, { min: "1000", max: "1万" }).users,
    rows.slice(0, 2),
  );
  assert.equal(
    C.filterUsers(rows, { min: "2万", max: "1万" }).error,
    "最低粉丝数不能大于最高粉丝数。",
  );
});
test("only lists get a panel, primary-column membership excludes sidebar recommendations", async () => {
  const s = setup();
  const home = setup("/home");
  try {
    await pause();
    assert.equal(s.doc.querySelectorAll(".xfb-filter").length, 1);
    assert.match(
      s.doc.querySelector(".xfb-filter-status").textContent,
      /已收录 3/,
    );
    assert.ok(!s.names().includes("@sidebar"));
    assert.equal(home.doc.querySelector(".xfb-filter"), null);
  } finally {
    s.dom.window.close();
    home.dom.window.close();
  }
});
test("keyword + count bounds + unknown toggle + sort + clear work without hiding native rows", async () => {
  const s = setup();
  try {
    s.send([
      ["alice", 12000],
      ["bob", 0],
    ]);
    await pause();
    assert.deepEqual(s.names(), ["@alice", "@bob", "@carol"]);
    s.input(".xfb-query", "AI");
    assert.deepEqual(s.names(), ["@alice", "@carol"]);
    s.input(".xfb-min", "1万");
    assert.deepEqual(s.names(), ["@alice"]);
    s.input(".xfb-unknown", true);
    assert.deepEqual(s.names(), ["@alice", "@carol"]);
    s.input(".xfb-max", "100");
    assert.match(
      s.doc.querySelector(".xfb-filter-status").textContent,
      /最低粉丝数不能大于/,
    );
    s.doc.querySelector(".xfb-reset").click();
    assert.equal(s.names().length, 3);
    s.input(".xfb-sort", "asc");
    assert.deepEqual(s.names(), ["@bob", "@alice", "@carol"]);
    s.input(".xfb-sort", "desc");
    assert.deepEqual(s.names(), ["@alice", "@bob", "@carol"]);
    s.input(".xfb-query", "ＡＬＩＣＥ 产品");
    assert.deepEqual(s.names(), ["@alice"]);
    assert.equal(
      s.doc.querySelectorAll('section [data-testid="UserCell"]').length,
      3,
    );
    assert.ok(
      [...s.doc.querySelectorAll('section [data-testid="UserCell"]')].every(
        (el) => !el.hidden && !el.style.display,
      ),
    );
  } finally {
    s.dom.window.close();
  }
});
test("retains visited accounts after virtualization, accepts late counts, and never executes biography HTML", async () => {
  const s = setup();
  try {
    await pause();
    s.input(".xfb-min", "1000");
    assert.equal(s.names().length, 0);
    s.doc.querySelector('section [data-testid="UserCell"]').remove();
    s.send([["alice", 12000]]);
    await pause();
    assert.deepEqual(s.names(), ["@alice"]);
    s.doc
      .querySelector("section")
      .insertAdjacentHTML(
        "beforeend",
        cell("dave", "Dave", "&lt;img src=x onerror=alert(1)&gt; AI"),
      );
    s.send([["dave", 1500]]);
    await pause();
    assert.deepEqual(s.names(), ["@alice", "@dave"]);
    assert.equal(s.doc.querySelector(".xfb-filter-results img"), null);
    assert.match(
      s.doc.querySelector(".xfb-filter-results").textContent,
      /<img src=x onerror=alert\(1\)>/,
    );
  } finally {
    s.dom.window.close();
  }
});
test("route switches discard old membership and avoid capturing lingering previous-page rows", async () => {
  const s = setup();
  try {
    await pause();
    s.dom.window.history.pushState({}, "", "/other/followers");
    s.doc.querySelector('[role="tab"]').href = "/other/followers";
    s.dom.window.dispatchEvent(new s.dom.window.PopStateEvent("popstate"));
    await pause();
    assert.equal(s.doc.querySelector(".xfb-filter"), null);
    s.doc.querySelector("section").setAttribute("aria-labelledby", "list2");
    s.doc.querySelector("section").innerHTML = cell(
      "new_user",
      "New",
      "另一个列表",
    );
    await pause();
    assert.deepEqual(s.names(), ["@new_user"]);
    s.dom.window.history.pushState({}, "", "/home");
    s.dom.window.dispatchEvent(new s.dom.window.PopStateEvent("popstate"));
    await pause();
    assert.equal(s.doc.querySelector(".xfb-filter"), null);
  } finally {
    s.dom.window.close();
  }
});
test("progressive results show matching totals accurately beyond 50 accounts", async () => {
  const s = setup(
    "/owner/following",
    Array.from({ length: 65 }, (_, i) =>
      cell("user" + i, "User " + i, "AI"),
    ).join(""),
  );
  try {
    await pause();
    assert.equal(s.names().length, 50);
    assert.match(
      s.doc.querySelector(".xfb-filter-status").textContent,
      /匹配 65/,
    );
    assert.equal(s.doc.querySelector(".xfb-more").hidden, false);
    s.doc.querySelector(".xfb-more").click();
    assert.equal(s.names().length, 65);
    assert.equal(s.doc.querySelector(".xfb-more").hidden, true);
  } finally {
    s.dom.window.close();
  }
});
