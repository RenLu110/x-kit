const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../extension/core.js");

test("current X relationship_counts schema, old legacy schema, v2 and zero followers", () => {
  const data = {
    users: [
      {
        core: { screen_name: "Current_User" },
        relationship_counts: { followers: 12345, following: 600 },
      },
      { legacy: { screen_name: "Old_User", followers_count: 178 } },
      { screen_name: "Zero", public_metrics: { followers_count: 0 } },
    ],
  };
  assert.deepEqual(
    C.extract(data).sort((a, b) => a.handle.localeCompare(b.handle)),
    [
      { handle: "current_user", count: 12345 },
      { handle: "old_user", count: 178 },
      { handle: "zero", count: 0 },
    ],
  );
});
test("never combine one user name with another nested user count", () => {
  assert.deepEqual(
    C.extract({
      core: { screen_name: "Missing" },
      nested: {
        core: { screen_name: "Actual" },
        relationship_counts: { followers: 7 },
      },
    }),
    [{ handle: "actual", count: 7 }],
  );
});
test("ignore missing, malformed and unsafe counts; handle cycles", () => {
  const data = {
    users: [
      -1,
      NaN,
      Infinity,
      "100",
      1.5,
      null,
      Number.MAX_SAFE_INTEGER + 1,
    ].map((followers) => ({
      core: { screen_name: "bad" },
      relationship_counts: { followers },
    })),
  };
  data.loop = data;
  assert.deepEqual(C.extract(data), []);
});
test("Chinese compact format does not round up over thresholds", () => {
  for (const [input, output] of [
    [0, "0"],
    [7, "7"],
    [9999, "9,999"],
    [10000, "1万"],
    [17999, "1.7万"],
    [99999999, "9,999.9万"],
    [100000000, "1亿"],
  ])
    assert.equal(C.format(input), output);
  assert.equal(C.format(123456, "exact"), "123,456");
});
test("profile URLs only, case-insensitive handles, strict domain", () => {
  assert.equal(C.fromHref("/Example_User"), "example_user");
  assert.equal(C.fromHref("https://twitter.com/Example_User/"), "example_user");
  for (const url of [
    "/example/status/123",
    "https://x.com.evil.test/example",
    "https://evil.test/example",
    "/i/lists/3",
    "javascript:alert(1)",
  ])
    assert.equal(C.fromHref(url), null);
});
test("intercept only X API URLs", () => {
  assert.equal(
    C.isApi("/i/api/graphql/abc/TweetDetail", "https://x.com"),
    true,
  );
  assert.equal(C.isApi("https://api.x.com/1.1/users/show.json"), true);
  assert.equal(
    C.isApi("https://evil.test/i/api/graphql/abc/TweetDetail"),
    false,
  );
  assert.equal(C.isApi("https://x.com/some-user"), false);
});
