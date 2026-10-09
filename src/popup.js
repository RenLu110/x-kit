(() => {
  const M = createModel();
  const status = document.querySelector("#status"),
    detail = document.querySelector("#detail"),
    list = document.querySelector("#features");
  document.querySelector("#version").textContent = M.version;
  for (const [key, name, description] of M.features) {
    const label = document.createElement("label");
    label.className = "feature";
    const span = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = name;
    const help = document.createElement("small");
    help.textContent = description;
    span.append(title, help);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.dataset.feature = key;
    input.id = key;
    input.disabled = true;
    const track = document.createElement("i");
    track.className = "switch-track";
    track.setAttribute("aria-hidden", "true");
    label.append(span, input, track);
    list.append(label);
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        await chrome.storage.local.set({ [key]: input.checked });
        setTimeout(refresh, 200);
      } catch (e) {
        input.checked = !input.checked;
        status.textContent = "设置未保存：" + e.message;
      } finally {
        input.disabled = false;
      }
    });
  }
  async function refresh() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const state = await chrome.tabs.sendMessage(tab.id, {
        type: "xfb-status",
      });
      status.textContent =
        state.version === M.version
          ? "X Kit 已连接当前页面"
          : "页面还在运行旧脚本";
      detail.textContent =
        state.version === M.version
          ? `收到 ${state.users} 个账号 · ${state.badges} 个粉丝标签`
          : "请先重新加载插件，再刷新这个 X 标签页。";
    } catch {
      status.textContent = "打开 X 后即可使用";
      detail.textContent = "更新后：重新加载插件，再刷新 X 页面。";
    }
  }
  async function init() {
    const p = M.prefs(await chrome.storage.local.get(null));
    for (const input of list.querySelectorAll("input")) {
      input.checked = p[input.dataset.feature];
      input.disabled = false;
    }
    document.querySelector("#format").value = p.format;
    await refresh();
  }
  document.querySelector("#format").addEventListener("change", async (e) => {
    try {
      await chrome.storage.local.set({ format: e.target.value });
    } catch (error) {
      status.textContent = error.message;
    }
  });
  for (const [id, enabled] of [
    ["all-on", true],
    ["all-off", false],
  ])
    document.querySelector("#" + id).addEventListener("click", async () => {
      try {
        await chrome.storage.local.set(
          Object.fromEntries(M.features.map(([key]) => [key, enabled])),
        );
        await init();
      } catch (e) {
        status.textContent = e.message;
      }
    });
  document.querySelector("#open-library").onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
  document.querySelector("#reload").onclick = () => chrome.runtime.reload();
  init().catch((e) => (status.textContent = "无法读取设置：" + e.message));
  /* MODEL_FACTORY */
})();
