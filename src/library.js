(() => {
  const M = createModel();
  let state = {},
    view = "posts";
  const $ = (selector) => document.querySelector(selector);
  function report(text) {
    $("#status").textContent = text;
  }
  async function send(data) {
    const r = await chrome.runtime.sendMessage(data);
    if (!r?.ok) throw new Error(r?.error || "操作失败");
    return r;
  }
  const values = (prefix) =>
    Object.entries(state)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  function download(data, name, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function b(parent, label, fn, disabled = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = label;
    el.disabled = disabled;
    el.onclick = fn;
    parent.append(el);
    return el;
  }
  function edit(item, type) {
    const d = $("#editor");
    d.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = type === "post" ? "编辑素材用途" : "编辑账号备注";
    d.append(h);
    const inputs = {};
    for (const [key, title, multiline] of type === "post"
      ? [
          ["category", "用途", false],
          ["tags", "标签（逗号分隔）", false],
          ["note", "我的备注", true],
        ]
      : [["text", "@" + item.handle + " 的备注", true]]) {
      const l = document.createElement("label");
      l.textContent = title;
      const i = document.createElement(multiline ? "textarea" : "input");
      i.value = Array.isArray(item[key])
        ? item[key].join("，")
        : item[key] || "";
      i.maxLength = multiline ? 5000 : 400;
      l.append(i);
      d.append(l);
      inputs[key] = i;
    }
    const result = document.createElement("p");
    result.role = "status";
    d.append(result);
    b(d, "取消", () => d.close());
    b(d, "保存", async () => {
      try {
        const updated = {
          ...item,
          ...Object.fromEntries(
            Object.entries(inputs).map(([k, i]) => [k, i.value]),
          ),
        };
        await send(
          type === "post"
            ? { type: "xkit-save-post", post: updated }
            : { type: "xkit-save-note", note: updated },
        );
        d.close();
        await load();
        report("已保存");
      } catch (e) {
        result.textContent = e.message;
      }
    });
    d.showModal();
  }
  function filtered() {
    return M.searchPosts(
      values("post:"),
      $("#query").value,
      $("#category").value,
    );
  }
  async function remove(key) {
    if (!confirm("删除这条本地记录？不会修改 X 上的书签或账号。")) return;
    try {
      await send({ type: "xkit-delete", key });
      await load();
      report("已删除本地记录");
    } catch (e) {
      report(e.message);
    }
  }
  function render() {
    const prefs = M.prefs(state);
    $("#total").textContent =
      `${values("post:").length} 条素材 · ${values("note:").length} 条账号备注`;
    $("#posts-view").hidden = view !== "posts";
    $("#notes-view").hidden = view !== "notes";
    $("#rules-view").hidden = view !== "rules";
    $("#query").hidden = view === "rules";
    $("#category").hidden = view !== "posts";
    $("#module-state").textContent =
      view === "posts" && !prefs.libraryEnabled
        ? "收藏模块已关闭，已保存内容仍可查看和备份。"
        : view === "notes" && !prefs.notesEnabled
          ? "账号备注模块已关闭，已保存备注仍在。"
          : view === "rules" && !prefs.noiseEnabled
            ? "降噪模块已关闭，规则已保留但不生效。"
            : "";
    const area = view === "notes" ? $("#notes") : $("#posts");
    if (view === "rules") return;
    area.replaceChildren();
    const items =
      view === "posts"
        ? filtered()
        : values("note:").filter((n) =>
            (n.handle + " " + n.text)
              .toLowerCase()
              .includes($("#query").value.toLowerCase()),
          );
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent =
        view === "posts"
          ? "还没有匹配素材。去 X 点击帖子下方的「存入素材库」。"
          : "还没有匹配备注。去 X 点击账号旁的「＋备注」。";
      area.append(p);
    }
    for (const item of items) {
      const card = document.createElement("article");
      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("a");
      title.textContent =
        view === "posts"
          ? item.title || item.author || item.handle || "X 帖子"
          : "@" + item.handle;
      title.href = view === "posts" ? item.url : "https://x.com/" + item.handle;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      head.append(title);
      card.append(head);
      if (view === "posts") {
        const meta = document.createElement("small");
        meta.textContent =
          [item.category, ...(item.tags || [])].filter(Boolean).join(" · ") ||
          "未分类";
        card.append(meta);
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = item.text.slice(0, 160) || "查看内容";
        const body = document.createElement("p");
        body.textContent =
          item.text + (item.quoted ? "\n\n引用：\n" + item.quoted : "");
        details.append(summary, body);
        card.append(details);
        if (item.note) {
          const note = document.createElement("blockquote");
          note.textContent = item.note;
          card.append(note);
        }
      } else {
        const p = document.createElement("p");
        p.textContent = item.text;
        card.append(p);
      }
      const actions = document.createElement("div");
      actions.className = "actions";
      b(
        actions,
        "编辑",
        () => edit(item, view === "posts" ? "post" : "note"),
        view === "posts" ? !prefs.libraryEnabled : !prefs.notesEnabled,
      );
      if (view === "posts")
        b(
          actions,
          "导出 Markdown",
          () =>
            download(
              M.markdown([item]),
              "x-kit-" + item.id + ".md",
              "text/markdown;charset=utf-8",
            ),
          !prefs.exportEnabled,
        );
      b(actions, "删除", () =>
        remove(
          (view === "posts" ? "post:" : "note:") + (item.id || item.handle),
        ),
      );
      card.append(actions);
      area.append(card);
    }
    $("#export-filtered").disabled = !prefs.exportEnabled || !filtered().length;
  }
  async function load() {
    state = (await chrome.storage.local.get(null)) || {};
    const previous = $("#category").value;
    $("#category").replaceChildren(new Option("全部用途", ""));
    for (const c of [
      ...new Set(
        values("post:")
          .map((p) => p.category)
          .filter(Boolean),
      ),
    ])
      $("#category").add(new Option(c, c));
    if ([...$("#category").options].some((o) => o.value === previous))
      $("#category").value = previous;
    render();
  }
  for (const button of document.querySelectorAll("[data-view]"))
    button.onclick = () => {
      view = button.dataset.view;
      document
        .querySelectorAll("[data-view]")
        .forEach((el) =>
          el.setAttribute("aria-selected", String(el === button)),
        );
      render();
    };
  $("#query").oninput = render;
  $("#category").onchange = render;
  $("#export-filtered").onclick = () => {
    if (M.prefs(state).exportEnabled)
      download(
        M.markdown(filtered()),
        "x-kit-selection.md",
        "text/markdown;charset=utf-8",
      );
  };
  $("#backup").onclick = () =>
    download(
      JSON.stringify(
        {
          app: "x-kit",
          schema: 1,
          createdAt: new Date().toISOString(),
          posts: values("post:"),
          notes: values("note:"),
        },
        null,
        2,
      ),
      "x-kit-backup-" + Date.now() + ".json",
      "application/json",
    );
  $("#import").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 9 * 1024 * 1024) throw new Error("备份超过 9 MB");
      const backup = JSON.parse(await file.text());
      M.validateBackup(backup);
      const r = await send({ type: "xkit-import", backup });
      await load();
      report(`已导入 ${r.added} 条；保留已有记录，跳过重复 ${r.skipped} 条`);
    } catch (e) {
      report("导入失败：" + e.message);
    } finally {
      event.target.value = "";
    }
  };
  $("#save-rules").onclick = async () => {
    try {
      await chrome.storage.local.set({
        noiseKeywords: $("#keywords").value.slice(0, 6000),
        noiseAccounts: $("#accounts").value.slice(0, 6000),
        noiseAllow: $("#allow").value.slice(0, 6000),
      });
      await load();
      report("规则已保存；开启降噪的 X 页面会立即生效");
    } catch (e) {
      report(e.message);
    }
  };
  load()
    .then(() => {
      const p = M.prefs(state);
      $("#keywords").value = p.noiseKeywords;
      $("#accounts").value = p.noiseAccounts;
      $("#allow").value = p.noiseAllow;
    })
    .catch((e) => report(e.message));
  chrome.storage.onChanged.addListener(() =>
    load().catch((e) => report(e.message)),
  );
  /* MODEL_FACTORY */
})();
