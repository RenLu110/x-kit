function records(users) {
  window.postMessage(
    {
      channel: "renlu-x-followers-v1",
      type: "records",
      records: users.map(([handle, count]) => ({
        handle,
        count,
        at: Date.now(),
      })),
    },
    location.origin,
  );
}
records([
  ["demo_creator", 17456],
  ["demo_builder", 178],
]);
document
  .querySelector("#enabled")
  .addEventListener("change", (e) =>
    updatePreference("enabled", e.target.checked),
  );
document
  .querySelector("#format")
  .addEventListener("change", (e) =>
    updatePreference("format", e.target.value),
  );
document
  .querySelector("#theme")
  .addEventListener("click", () => document.body.classList.toggle("dark"));
document.querySelector("#load").addEventListener("click", (e) => {
  const row = document.createElement("article");
  row.className = "row";
  row.innerHTML =
    '<div class="avatar">D</div><div><div class="name"><strong>示例 · 刚刚加入</strong><a href="https://x.com/demo_new"><div class="handle"><span>@demo_new</span></div></a></div><p class="body">新加载的账号会自动补上标签。</p><div class="meta">示例数据 · 35,678 位粉丝</div></div>';
  document.querySelector("#rows").append(row);
  records([["demo_new", 35678]]);
  e.target.disabled = true;
  e.target.textContent = "已加载，标签会自动出现";
});
