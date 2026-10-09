const initial = [
  ["demo_alice", "示例 Alice", "AI 产品研究 · 分享真实落地案例", 17456],
  ["demo_bob", "示例 Bob", "AI 工具测评 · 设计与效率", 3200],
  ["demo_carol", "示例 Carol", "独立开发 · 产品定价与增长", 35678],
  ["demo_unknown", "示例 新账号", "AI 内容创作 · 暂无粉丝数据", null],
];
function addRows(users) {
  for (const [handle, name, bio] of users) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.dataset.testid = "UserCell";
    cell.style.cssText =
      "display:block;width:100%;text-align:left;background:white;color:inherit;font:inherit;border:0;border-bottom:1px solid #e5edf2";
    // The live X DOM also has a button UserCell containing a follow button, constructed at runtime.
    cell.innerHTML =
      '<div><div class="avatar">' +
      name.slice(-1) +
      '</div><div style="flex:1"><div class="profile-header"><a href="https://x.com/' +
      handle +
      '"><span>' +
      name +
      '</span></a><a href="https://x.com/' +
      handle +
      '"><span>@' +
      handle +
      '</span></a><button type="button" disabled>正在关注</button></div><div class="bio" dir="auto">' +
      bio +
      "</div></div></div>";
    document.querySelector("#native-rows").append(cell);
  }
  window.postMessage(
    {
      channel: "renlu-x-followers-v1",
      type: "records",
      records: users
        .filter((user) => user[3] !== null)
        .map(([handle, , , count]) => ({ handle, count, at: Date.now() })),
    },
    location.origin,
  );
}
addRows(initial);
document.querySelector("#load").addEventListener("click", (event) => {
  addRows([["demo_dave", "示例 Dave", "AI 应用开发 · 自动化工作流", 28000]]);
  event.target.disabled = true;
  event.target.textContent = "已加载 1 个新账号";
});
