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
  function createModel() {
  const version = "2.0.0";
  const defaults = {
    enabled: true,
    filterEnabled: true,
    notesEnabled: true,
    libraryEnabled: true,
    exportEnabled: true,
    noiseEnabled: true,
    format: "compact",
    noiseKeywords: "",
    noiseAccounts: "",
    noiseAllow: "",
  };
  const features = [
    ["enabled", "粉丝数显示", "在账号旁显示粉丝数"],
    ["filterEnabled", "关注列表筛选", "关键词、粉丝区间和排序"],
    ["notesEnabled", "账号备注", "记住是谁，以及为什么关注"],
    ["libraryEnabled", "收藏与检索", "本地素材库、用途、标签和备注"],
    ["exportEnabled", "内容导出", "帖子、已加载线程与文章正文"],
    ["noiseEnabled", "信息流降噪", "按关键词和账号折叠，可随时展开"],
  ];
  const text = (value, max = 2000) =>
    typeof value === "string" ? value.slice(0, max) : "";
  const handle = (value) =>
    typeof value === "string" && /^[\w]{1,15}$/.test(value)
      ? value.toLowerCase()
      : null;
  function prefs(raw = {}) {
    raw = raw || {};
    const result = { ...defaults };
    for (const [key, value] of Object.entries(defaults))
      if (typeof raw[key] === typeof value)
        result[key] =
          typeof value === "string" ? raw[key].slice(0, 6000) : raw[key];
    result.format = result.format === "exact" ? "exact" : "compact";
    return result;
  }
  function postUrl(input) {
    try {
      const u = new URL(input);
      if (
        u.protocol !== "https:" ||
        !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(
          u.hostname,
        )
      )
        return null;
      const m =
        u.pathname.match(/^\/([\w]{1,15})\/status\/(\d+)\/?$/) ||
        u.pathname.match(/^\/i\/article\/(\d+)\/?$/);
      if (!m) return null;
      const id = m.length === 3 ? m[2] : "article-" + m[1];
      return { id, url: "https://x.com" + u.pathname.replace(/\/$/, "") };
    } catch {
      return null;
    }
  }
  function normalizePost(raw) {
    const parsed = postUrl(raw?.url);
    if (!parsed) throw new Error("无效的 X 内容链接");
    const tags = [
      ...new Set(
        (Array.isArray(raw.tags)
          ? raw.tags
          : String(raw.tags || "").split(/[,，\n]/)
        )
          .map((x) => text(x, 40).trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    const images = (Array.isArray(raw.images) ? raw.images : [])
      .filter((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "https:" && u.hostname === "pbs.twimg.com";
        } catch {
          return false;
        }
      })
      .slice(0, 12);
    return {
      id: parsed.id,
      url: parsed.url,
      author: text(raw.author, 200),
      handle: handle(raw.handle) || "",
      title: text(raw.title, 300),
      text: text(raw.text, 100000),
      quoted: text(raw.quoted, 20000),
      date: text(raw.date, 60),
      kind: raw.kind === "article" ? "article" : "post",
      images,
      tags,
      category: text(raw.category, 50),
      note: text(raw.note, 5000),
      partial: raw.partial !== false,
      savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now(),
      updatedAt: Date.now(),
    };
  }
  function normalizeNote(raw) {
    const h = handle(raw?.handle);
    if (!h) throw new Error("无效用户名");
    return { handle: h, text: text(raw.text, 5000), updatedAt: Date.now() };
  }
  function searchPosts(posts, query = "", category = "") {
    const words = query
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return posts
      .filter(
        (p) =>
          (!category || p.category === category) &&
          words.every((w) =>
            [p.text, p.author, p.handle, p.title, p.note, ...(p.tags || [])]
              .join(" ")
              .normalize("NFKC")
              .toLowerCase()
              .includes(w),
          ),
      )
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  const mdText = (value) =>
    String(value || "").replace(/([\\`*_{}\[\]<>])/g, "\\$1");
  function markdown(posts) {
    return (
      "# X Kit 导出\n\n> 仅包含用户选择的、当前页面已加载或已保存的内容；不保证线程或文章完整。图片保留来源链接，视频请回原帖查看。\n\n" +
      posts
        .map((p) =>
          [
            "## " + mdText(p.title || p.author || "X 帖子"),
            `来源：${p.url}\n作者：${mdText(p.author)} ${p.handle ? "(@" + p.handle + ")" : ""}\n发布时间：${mdText(p.date || "页面未提供")}`,
            p.kind === "article" ? "类型：文章（已加载正文）" : "类型：帖子",
            p.partial
              ? "范围：页面快照，可能包含截断或未加载内容。"
              : "范围：当前已加载内容。",
            p.text,
            p.quoted ? "### 页面内引用内容\n\n" + p.quoted : "",
            (p.images || [])
              .map((url, i) => `![图片 ${i + 1}](${url})`)
              .join("\n"),
            p.category ? "用途：" + mdText(p.category) : "",
            p.tags?.length ? "标签：" + p.tags.map(mdText).join("、") : "",
            p.note ? "### 我的备注\n\n" + p.note : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        )
        .join("\n\n---\n\n") +
      "\n"
    );
  }
  function ruleLines(value) {
    return String(value || "")
      .split("\n")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100);
  }
  function noiseMatch(post, settings) {
    const h = String(post.handle || "").toLowerCase();
    if (
      ruleLines(settings.noiseAllow)
        .map((x) => x.replace(/^@/, ""))
        .includes(h)
    )
      return "";
    if (
      ruleLines(settings.noiseAccounts)
        .map((x) => x.replace(/^@/, ""))
        .includes(h)
    )
      return "账号规则：@" + h;
    const body = [post.text, post.author, post.quoted]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();
    const word = ruleLines(settings.noiseKeywords).find((w) =>
      body.includes(w.normalize("NFKC")),
    );
    return word ? "关键词：" + word : "";
  }
  function validateBackup(raw) {
    if (
      raw?.app !== "x-kit" ||
      raw.schema !== 1 ||
      !Array.isArray(raw.posts) ||
      !Array.isArray(raw.notes) ||
      raw.posts.length > 1500 ||
      raw.notes.length > 3000
    )
      throw new Error("备份格式不正确或数量超出限制");
    return {
      posts: raw.posts.map(normalizePost),
      notes: raw.notes.map(normalizeNote),
    };
  }
  return {
    version,
    defaults,
    features,
    prefs,
    text,
    handle,
    postUrl,
    normalizePost,
    normalizeNote,
    searchPosts,
    markdown,
    noiseMatch,
    validateBackup,
  };
}

})();
