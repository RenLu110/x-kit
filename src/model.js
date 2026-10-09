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
// MODEL_EXPORT
if (typeof module !== "undefined" && module.exports)
  module.exports = createModel;
