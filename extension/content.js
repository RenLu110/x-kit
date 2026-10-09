(() => {
  "use strict";
  const C = /* Shared pure logic; no network, DOM, or storage access. */
(() => {
  'use strict';
  const CHANNEL = 'renlu-x-followers-v1';
  const LIMIT = 4000;
  const TTL = 30 * 60 * 1000;
  const handle = value => typeof value === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(value)
    ? value.toLowerCase() : null;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  function extract(root) {
    const result = new Map();
    const seen = new WeakSet();
    const stack = [root];
    let visited = 0;
    while (stack.length && visited++ < 100000) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      const name = handle(node.core?.screen_name) || handle(node.legacy?.screen_name) || handle(node.screen_name);
      const value = [node.relationship_counts?.followers, node.legacy?.followers_count, node.followers_count, node.public_metrics?.followers_count].find(count);
      if (name && count(value)) result.set(name, {handle: name, count: value});
      for (const value of Object.values(node)) if (value && typeof value === 'object') stack.push(value);
    }
    return [...result.values()];
  }
  function format(value, mode = 'compact') {
    if (!count(value)) return '';
    if (mode === 'exact' || value < 10000) return value.toLocaleString('en-US');
    const unit = value >= 100000000 ? 100000000 : 10000;
    return (Math.floor(value / unit * 10) / 10).toLocaleString('en-US', {maximumFractionDigits: 1}) + (unit === 10000 ? '万' : '亿');
  }
  function fromHref(href, base = 'https://x.com') {
    try {
      const url = new URL(href, base);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
      const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/);
      return match ? handle(match[1]) : null;
    } catch { return null; }
  }
  function isApi(url, base) {
    try {
      const u = new URL(url, base);
      return /^(?:www\.|api\.)?(?:x\.com|twitter\.com)$/.test(u.hostname) &&
        /^\/(?:i\/api\/)?(?:graphql|1\.1|2)\//.test(u.pathname);
    } catch { return false; }
  }
  function listRoute(path) {
    const match = path.match(/^\/([a-zA-Z0-9_]{1,15})\/(following|followers|verified_followers)\/?$/);
    return match ? '/' + match[1].toLowerCase() + '/' + match[2] : null;
  }
  function bound(text) {
    const cleaned = String(text).trim().toLowerCase().replaceAll(',', '');
    if (!cleaned) return null;
    const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(万|亿|k|m)?$/);
    if (!match) return NaN;
    const value = Number(match[1]) * ({'万':10000,'亿':100000000,k:1000,m:1000000}[match[2]] || 1);
    return count(value) ? value : NaN;
  }
  function filterUsers(users, options) {
    const min = bound(options.min || '');
    const max = bound(options.max || '');
    if (Number.isNaN(min) || Number.isNaN(max)) return {error:'粉丝数请输入非负整数，也支持 1万、10k。', users:[]};
    if (min !== null && max !== null && min > max) return {error:'最低粉丝数不能大于最高粉丝数。', users:[]};
    const normalize = s => String(s || '').normalize('NFKC').toLowerCase();
    const terms = normalize(options.query).trim().split(/\s+/).filter(Boolean);
    const filtered = users.filter(user => {
      const text = normalize([user.name, user.handle, user.bio].join(' '));
      if (!terms.every(term => text.includes(term))) return false;
      if (!count(user.count)) return min === null && max === null || !!options.includeUnknown;
      return (min === null || user.count >= min) && (max === null || user.count <= max);
    });
    if (options.sort === 'desc' || options.sort === 'asc') filtered.sort((a,b) => {
      if (!count(a.count)) return count(b.count) ? 1 : 0;
      if (!count(b.count)) return -1;
      return options.sort === 'desc' ? b.count-a.count : a.count-b.count;
    });
    return {error:null,users:filtered};
  }
  const api = Object.freeze({CHANNEL, LIMIT, TTL, handle, count, extract, format, fromHref, isApi, listRoute, bound, filterUsers});
  return api;
})();

  const M = createModel();
  const cache = new Map();
  let settings = { ...M.defaults };
  const postMap = new Map(),
    noteMap = new Map();
  let timer;
  let lastAt = 0;
  const selector = "a[href]";
  const listFilter = createListFilter({ C, cache, schedule });
  const postTools = createPostTools({
    M,
    getSettings: () => settings,
    postMap,
    noteMap,
    schedule,
  });
  function validRecord(r) {
    return (
      r &&
      C.handle(r.handle) &&
      C.count(r.count) &&
      Number.isFinite(r.at) &&
      r.at <= Date.now() + 5000 &&
      Date.now() - r.at < C.TTL
    );
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== C.CHANNEL ||
      event.data.type !== "records" ||
      !Array.isArray(event.data.records)
    )
      return;
    for (const r of event.data.records.slice(0, 250)) {
      if (!validRecord(r)) continue;
      const name = C.handle(r.handle);
      if ((cache.get(name)?.at || 0) > r.at) continue;
      cache.delete(name);
      cache.set(name, { handle: name, count: r.count, at: r.at });
      lastAt = Math.max(lastAt, r.at);
    }
    while (cache.size > C.LIMIT) cache.delete(cache.keys().next().value);
    schedule();
  });
  // The MAIN script may already have received early responses. Ask for its bounded buffer.
  window.postMessage({ channel: C.CHANNEL, type: "ready" }, location.origin);
  function labelFor(anchor) {
    const name = C.fromHref(anchor.getAttribute("href"), location.href);
    if (
      !name ||
      anchor.closest(
        '.xkit-ui,.xfb-filter, [data-testid="tweetText"], [contenteditable="true"], nav, header',
      )
    )
      return null;
    const spans = [...anchor.querySelectorAll("span")];
    const label = spans.find(
      (span) =>
        !span.classList.contains("xfb-badge") &&
        span.children.length === 0 &&
        span.textContent.trim().toLowerCase() === "@" + name,
    );
    return label ? { name, label } : null;
  }
  function render() {
    timer = null;
    const now = Date.now();
    for (const [key, r] of cache) if (now - r.at >= C.TTL) cache.delete(key);
    if (document.documentElement)
      document.documentElement.dataset.xkitVersion = M.version;
    listFilter.update(settings.filterEnabled);
    postTools.update();
    for (const badge of document.querySelectorAll(".xfb-badge")) {
      const anchor = badge.closest("a");
      const target = anchor && labelFor(anchor);
      if (
        !settings.enabled ||
        !target ||
        target.name !== badge.dataset.xfbHandle ||
        !cache.has(target.name)
      )
        badge.remove();
    }
    if (!settings.enabled) return;
    for (const anchor of document.querySelectorAll(selector)) {
      const target = labelFor(anchor);
      if (!target) continue;
      const record = cache.get(target.name);
      if (!record) continue;
      let badge = anchor.querySelector(".xfb-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "xfb-badge";
        badge.dataset.xfbHandle = target.name;
        target.label.after(badge);
      }
      const text = "粉丝 " + C.format(record.count, settings.format);
      const title =
        "@" +
        target.name +
        " · " +
        C.format(record.count, "exact") +
        " 位粉丝\n来自本页 X 响应 · " +
        new Date(record.at).toLocaleTimeString("zh-CN");
      if (badge.textContent !== text) badge.textContent = text;
      if (badge.title !== title) badge.title = title;
    }
  }
  function schedule() {
    if (!timer) timer = setTimeout(render, 120);
  }
  const observer = new MutationObserver((changes) => {
    if (
      changes.some((m) => {
        if (m.target.nodeType === 1 && m.target.closest(".xkit-ui"))
          return false;
        if (m.target.parentElement?.closest(".xkit-ui")) return false;
        if (m.target.nodeType === 1 && m.target.closest(".xfb-filter"))
          return false;
        if (m.target.parentElement?.closest(".xfb-filter")) return false;
        if (m.target.nodeType === 1 && m.target.closest(".xfb-badge"))
          return false;
        if (m.target.parentElement?.closest(".xfb-badge")) return false;
        if (
          m.type === "childList" &&
          [...m.addedNodes, ...m.removedNodes].every(
            (n) => n.nodeType === 1 && n.classList.contains("xfb-badge"),
          )
        )
          return false;
        return true;
      })
    )
      schedule();
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "aria-selected", "aria-labelledby"],
  });
  function hookConfig() {
    window.postMessage(
      {
        channel: C.CHANNEL,
        type: "config",
        enabled: settings.enabled || settings.filterEnabled,
      },
      location.origin,
    );
  }
  chrome.storage.local
    .get(null)
    .then((value) => {
      settings = M.prefs(value);
      for (const [key, item] of Object.entries(value || {})) {
        if (key.startsWith("post:")) postMap.set(key.slice(5), item);
        if (key.startsWith("note:")) noteMap.set(key.slice(5), item);
      }
      hookConfig();
      schedule();
    })
    .catch(() => schedule());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (Object.hasOwn(M.defaults, key))
        settings = M.prefs({
          ...settings,
          [key]: change.newValue ?? M.defaults[key],
        });
      if (key.startsWith("post:"))
        change.newValue
          ? postMap.set(key.slice(5), change.newValue)
          : postMap.delete(key.slice(5));
      if (key.startsWith("note:"))
        change.newValue
          ? noteMap.set(key.slice(5), change.newValue)
          : noteMap.delete(key.slice(5));
    }
    hookConfig();
    schedule();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "xfb-status") {
      respond({
        version: M.version,
        users: cache.size,
        badges: document.querySelectorAll(".xfb-badge").length,
        lastAt,
        enabled: settings.enabled,
      });
    }
  });
  // Expire stale labels even on an otherwise idle page.
  setInterval(schedule, 60000);
  schedule();
  function createListFilter({ C, cache, schedule }) {
  const members = new Map();
  let route = null,
    panel = null,
    primary = null,
    lastSection = null;
  let departedSection = null,
    departedSignature = "",
    signature = "",
    limit = 50,
    capped = false;
  let options = {
    query: "",
    min: "",
    max: "",
    sort: "original",
    includeUnknown: false,
  };
  const UI = `
    <details open><summary><strong>关注列表筛选</strong><span class="xfb-filter-summary"></span></summary>
      <div class="xfb-filter-body">
        <label class="xfb-query-label">关键词<input class="xfb-query" type="search" placeholder="昵称、用户名、简介；空格表示同时满足" maxlength="120"></label>
        <div class="xfb-filter-grid">
          <label>最低粉丝数<input class="xfb-min" type="text" inputmode="decimal" placeholder="不限，例如 1万" maxlength="20"></label>
          <label>最高粉丝数<input class="xfb-max" type="text" inputmode="decimal" placeholder="不限" maxlength="20"></label>
          <label>排序<select class="xfb-sort"><option value="original">浏览顺序</option><option value="desc">粉丝从多到少</option><option value="asc">粉丝从少到多</option></select></label>
        </div>
        <div class="xfb-filter-actions"><label><input class="xfb-unknown" type="checkbox">粉丝数未知的账号也保留</label><button class="xfb-reset" type="button">清空条件</button></div>
        <p class="xfb-filter-status" role="status" aria-live="polite"></p>
        <p class="xfb-filter-help">仅筛选本次打开此列表后已显示的账号，不代表完整名单。继续向下滚动原列表可增加范围；切换列表会清空收录。</p>
        <div class="xfb-filter-results" aria-label="筛选结果"></div>
        <button class="xfb-more" type="button" hidden>再显示 50 个结果</button>
      </div>
    </details>`;
  function cleanText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone
      .querySelectorAll(
        '.xfb-badge, button, script, style, [hidden], [aria-hidden="true"]',
      )
      .forEach((e) => e.remove());
    clone.querySelectorAll("[style]").forEach((e) => {
      if (e.style.display === "none") e.remove();
    });
    clone.querySelectorAll("img[alt]").forEach((e) => e.replaceWith(e.alt));
    return clone.textContent.trim();
  }
  function readCell(cell) {
    const links = [...cell.querySelectorAll("a[href]")];
    const account = links.find((link) => {
      const name = C.fromHref(link.getAttribute("href"), location.href);
      return (
        name &&
        [...link.querySelectorAll("span")].some(
          (span) =>
            !span.children.length &&
            span.textContent.trim().toLowerCase() === "@" + name,
        )
      );
    });
    if (!account) return null;
    const handle = C.fromHref(account.getAttribute("href"), location.href);
    const nameLink = links.find(
      (link) =>
        link !== account &&
        C.fromHref(link.getAttribute("href"), location.href) === handle &&
        link.textContent.trim() &&
        !link.textContent.trim().startsWith("@"),
    );
    // X UserCell has an avatar column and a content column: header, then biography.
    const column = cell.firstElementChild?.lastElementChild;
    const bio =
      column && column.contains(account)
        ? [...column.children].slice(1).map(cleanText).filter(Boolean).join(" ")
        : "";
    return {
      handle,
      name: (cleanText(nameLink) || handle).slice(0, 200),
      bio: bio.slice(0, 2000),
    };
  }
  function sectionSignature(section) {
    return section
      ? (section.getAttribute("aria-labelledby") || "") +
          "|" +
          [...section.querySelectorAll('[data-testid="UserCell"]')]
            .map(
              (cell) =>
                cell.querySelector("a[href]")?.getAttribute("href") || "",
            )
            .join("|")
      : "";
  }
  function resetRoute(next) {
    departedSection = lastSection;
    departedSignature = sectionSignature(lastSection);
    route = next;
    members.clear();
    capped = false;
    signature = "";
    limit = 50;
    options = {
      query: "",
      min: "",
      max: "",
      sort: "original",
      includeUnknown: false,
    };
    panel?.remove();
    panel = null;
    primary = null;
    lastSection = null;
  }
  function mount(section) {
    if (panel?.isConnected) return;
    panel = document.createElement("aside");
    panel.className = "xfb-filter";
    panel.setAttribute("aria-label", "关注列表筛选");
    panel.innerHTML = UI;
    panel.querySelector(".xfb-query").value = options.query;
    panel.querySelector(".xfb-min").value = options.min;
    panel.querySelector(".xfb-max").value = options.max;
    panel.querySelector(".xfb-sort").value = options.sort;
    panel.querySelector(".xfb-unknown").checked = options.includeUnknown;
    const change = () => {
      options = {
        query: panel.querySelector(".xfb-query").value,
        min: panel.querySelector(".xfb-min").value,
        max: panel.querySelector(".xfb-max").value,
        sort: panel.querySelector(".xfb-sort").value,
        includeUnknown: panel.querySelector(".xfb-unknown").checked,
      };
      limit = 50;
      draw();
    };
    panel.addEventListener("input", change);
    panel.addEventListener("change", change);
    panel.querySelector(".xfb-reset").addEventListener("click", () => {
      panel.querySelectorAll("input").forEach((input) => {
        if (input.type === "checkbox") input.checked = false;
        else input.value = "";
      });
      panel.querySelector(".xfb-sort").value = "original";
      change();
    });
    panel.querySelector(".xfb-more").addEventListener("click", () => {
      limit += 50;
      draw();
    });
    section.before(panel);
    signature = "";
  }
  function draw() {
    if (!panel) return;
    const users = [...members.values()].map((user) => ({
      ...user,
      count: cache.get(user.handle)?.count,
    }));
    const result = C.filterUsers(users, options);
    const unknown = users.filter((user) => !C.count(user.count)).length;
    const visible = result.users.slice(0, limit);
    const nextSignature = JSON.stringify([
      result.error,
      options,
      users.length,
      unknown,
      result.users.length,
      visible,
      limit,
      capped,
    ]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    panel.querySelector(".xfb-filter-summary").textContent =
      `${members.size} 个已收录`;
    const status = panel.querySelector(".xfb-filter-status");
    status.textContent =
      result.error ||
      `已收录 ${members.size} · 匹配 ${result.users.length} · 粉丝数未知 ${unknown}` +
        (capped ? " · 已达 4,000 个上限" : "");
    status.classList.toggle("xfb-filter-error", !!result.error);
    const area = panel.querySelector(".xfb-filter-results");
    const fragment = document.createDocumentFragment();
    for (const user of visible) {
      const card = document.createElement("div");
      card.className = "xfb-result";
      const line = document.createElement("div");
      line.className = "xfb-result-line";
      const link = document.createElement("a");
      link.href = "https://x.com/" + user.handle;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = user.name;
      link.title = "打开 @" + user.handle + " 的主页（新标签页）";
      const number = document.createElement("span");
      number.className = "xfb-result-count";
      number.textContent = C.count(user.count)
        ? "粉丝 " + C.format(user.count)
        : "粉丝数未知";
      number.title = C.count(user.count)
        ? C.format(user.count, "exact") + " 位粉丝"
        : "页面尚未返回粉丝数";
      line.append(link, number);
      const handle = document.createElement("div");
      handle.className = "xfb-result-handle";
      handle.textContent = "@" + user.handle;
      const bio = document.createElement("p");
      bio.textContent = user.bio || "未显示简介";
      card.append(line, handle, bio);
      fragment.append(card);
    }
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "xfb-filter-empty";
      empty.textContent = result.error
        ? "请调整筛选条件。"
        : members.size
          ? "当前收录范围内没有匹配账号。可放宽条件，或向下浏览原列表。"
          : "等待原列表显示账号。";
      fragment.append(empty);
    }
    area.replaceChildren(fragment);
    const more = panel.querySelector(".xfb-more");
    more.hidden = result.users.length <= limit;
    more.textContent = `再显示 50 个结果（当前 ${visible.length} / ${result.users.length}）`;
  }
  function update(enabled = true) {
    if (!enabled) {
      if (route || panel) resetRoute(null);
      return;
    }
    const next = C.listRoute(location.pathname);
    if (next !== route) resetRoute(next);
    if (!route) return;
    primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) return;
    const tab = primary.querySelector('[role="tab"][aria-selected="true"]');
    if (
      !tab ||
      C.listRoute(
        new URL(tab.getAttribute("href") || "", location.href).pathname,
      ) !== route
    )
      return;
    const section = [
      ...primary.querySelectorAll('section[role="region"]'),
    ].find((s) => s.querySelector('[data-testid="UserCell"]'));
    if (!section) {
      draw();
      return;
    }
    // During client-side navigation, old rows can briefly survive under the new URL.
    if (
      section === departedSection &&
      sectionSignature(section) === departedSignature
    )
      return;
    departedSection = null;
    lastSection = section;
    mount(section);
    for (const cell of section.querySelectorAll('[data-testid="UserCell"]')) {
      const user = readCell(cell);
      if (!user) continue;
      if (!members.has(user.handle) && members.size >= C.LIMIT) {
        capped = true;
        continue;
      }
      members.set(user.handle, user);
    }
    draw();
  }
  window.addEventListener("popstate", schedule);
  setInterval(() => {
    if (C.listRoute(location.pathname) !== route) schedule();
  }, 1000);
  return { update };
}

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

  function createPostTools({
  M,
  settings,
  getSettings,
  postMap,
  noteMap,
  schedule,
}) {
  let dialog = null,
    bar = null;
  const revealed = new WeakMap();
  function message(value) {
    return chrome.runtime.sendMessage(value).then((r) => {
      if (!r?.ok) throw new Error(r?.error || "操作失败，请重新加载插件");
      return r;
    });
  }
  function textOf(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".xkit-ui,script,style").forEach((n) => n.remove());
    clone.querySelectorAll("img[alt]").forEach((n) => n.replaceWith(n.alt));
    return clone.textContent.trim();
  }
  function readPost(node) {
    const time = node.querySelector("time");
    const link = time?.closest("a[href]");
    const parsed = M.postUrl(link?.href || "");
    if (!parsed) return null;
    const nameBox = node.querySelector('[data-testid="User-Name"]');
    const authorLinks = [...(nameBox?.querySelectorAll("a[href]") || [])];
    const match = new URL(parsed.url).pathname.match(/^\/(\w+)\/status/);
    const handle = match?.[1] || "";
    const author =
      textOf(
        authorLinks.find(
          (a) => a.textContent.trim() && !a.textContent.trim().startsWith("@"),
        ),
      ) || handle;
    const texts = [...node.querySelectorAll('[data-testid="tweetText"]')].map(
      textOf,
    );
    const images = [
      ...node.querySelectorAll('[data-testid="tweetPhoto"] img'),
    ].map((img) => img.src);
    return M.normalizePost({
      url: parsed.url,
      handle,
      author,
      text: texts[0] || "",
      quoted: texts.slice(1).join("\n\n"),
      date: time?.getAttribute("datetime") || "",
      images,
      partial: true,
    });
  }
  function readArticle() {
    const root = document.querySelector(
      '[data-testid="twitterArticleReadView"], [data-testid="longformRichTextComponent"]',
    );
    const parsed = M.postUrl(location.href);
    if (!root || !parsed) return null;
    const heading = root.querySelector("h1,h2");
    return M.normalizePost({
      url: parsed.url,
      kind: "article",
      title: textOf(heading) || document.title,
      text: root.innerText || textOf(root),
      partial: true,
    });
  }
  function posts() {
    return [...document.querySelectorAll('main [data-testid="tweet"]')]
      .map(readPost)
      .filter(Boolean)
      .filter((p, i, a) => a.findIndex((v) => v.id === p.id) === i);
  }
  function download(content, name, type = "text/markdown;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function close() {
    dialog?.remove();
    dialog = null;
  }
  function box(title) {
    close();
    dialog = document.createElement("dialog");
    dialog.className = "xkit-ui xkit-dialog";
    const h = document.createElement("h2");
    h.textContent = title;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "关闭";
    cancel.className = "xkit-close";
    cancel.onclick = close;
    dialog.append(h, cancel);
    document.body.append(dialog);
    dialog.addEventListener("cancel", close);
    dialog.showModal?.();
    if (!dialog.open) dialog.setAttribute("open", "");
    return dialog;
  }
  function field(parent, label, value = "", multiline = false) {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const input = document.createElement(multiline ? "textarea" : "input");
    input.value = value;
    input.maxLength = multiline ? 5000 : 400;
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  function status(parent) {
    const p = document.createElement("p");
    p.setAttribute("role", "status");
    parent.append(p);
    return p;
  }
  function button(parent, title, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = title;
    b.onclick = fn;
    parent.append(b);
    return b;
  }
  function editPost(post) {
    if (!getSettings().libraryEnabled) return;
    const existing = postMap.get(post.id);
    const p = {
      ...post,
      ...(existing
        ? {
            tags: existing.tags,
            note: existing.note,
            category: existing.category,
            savedAt: existing.savedAt,
          }
        : {}),
    };
    const d = box(existing ? "更新本地收藏" : "存入本地素材库");
    d.dataset.module = "libraryEnabled";
    const info = document.createElement("p");
    info.textContent =
      "保存当前已加载内容；和 X 的书签分开管理。" + p.text.slice(0, 120);
    d.append(info);
    const category = field(d, "用途（如选题、案例、工具、待验证）", p.category);
    const tags = field(d, "标签（逗号分隔）", p.tags?.join("，"));
    const note = field(d, "为什么保存 / 我的备注", p.note, true);
    const result = status(d);
    const save = button(d, "保存", async () => {
      save.disabled = true;
      try {
        if (!getSettings().libraryEnabled) throw new Error("收藏模块已关闭");
        await message({
          type: "xkit-save-post",
          post: {
            ...p,
            category: category.value,
            tags: tags.value,
            note: note.value,
          },
        });
        result.textContent = "已保存到本地素材库";
        save.textContent = "已保存";
      } catch (error) {
        result.textContent = error.message;
        save.disabled = false;
      }
    });
  }
  function editNote(handle) {
    if (!getSettings().notesEnabled) return;
    const d = box("@" + handle + " 的备注");
    d.dataset.module = "notesEnabled";
    const input = field(
      d,
      "仅本地保存，账号改名后需手动迁移",
      noteMap.get(handle)?.text || "",
      true,
    );
    const result = status(d);
    const save = button(d, "保存备注", async () => {
      save.disabled = true;
      try {
        await message({
          type: "xkit-save-note",
          note: { handle, text: input.value },
        });
        result.textContent = "备注已保存";
      } catch (e) {
        result.textContent = e.message;
        save.disabled = false;
      }
    });
  }
  function exportSelection(single) {
    if (!getSettings().exportEnabled) return;
    const list = single ? [single] : posts();
    const article = readArticle();
    if (!single && article) list.unshift(article);
    const d = box("导出已加载内容");
    d.dataset.module = "exportEnabled";
    const info = document.createElement("p");
    info.textContent =
      "先在 X 展开长文并滚动加载，再选择要导出的帖子。线程只包含当前已加载的部分。";
    d.append(info);
    const checks = [];
    for (const p of list) {
      const label = document.createElement("label");
      label.className = "xkit-export-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      label.append(
        input,
        document.createTextNode(
          (p.author || p.title || "文章") + "：" + p.text.slice(0, 100),
        ),
      );
      d.append(label);
      checks.push([input, p]);
    }
    const result = status(d);
    result.textContent = list.length
      ? `已加载 ${list.length} 条，可取消勾选无关回复`
      : "当前未识别到帖子或文章正文";
    button(d, "下载 Markdown", () => {
      if (!getSettings().exportEnabled) return;
      const selected = checks.filter(([c]) => c.checked).map(([, p]) => p);
      if (!selected.length) {
        result.textContent = "请至少选择一条内容";
        return;
      }
      download(M.markdown(selected), "x-kit-" + Date.now() + ".md");
      result.textContent = "已生成 Markdown";
    });
    button(d, "复制正文与来源", async () => {
      try {
        if (!getSettings().exportEnabled) return;
        const selected = checks.filter(([c]) => c.checked).map(([, p]) => p);
        if (!selected.length) throw new Error("请先选择内容");
        await navigator.clipboard.writeText(M.markdown(selected));
        result.textContent = "已复制";
      } catch (e) {
        result.textContent = "复制失败，可改用下载 Markdown。";
      }
    });
  }
  function update() {
    const s = getSettings();
    if (dialog && dialog.dataset.module && !s[dialog.dataset.module]) close();
    document.querySelectorAll(".xkit-note-button").forEach((b) => {
      const a = b.closest("a");
      const m = a && new URL(a.href).pathname.match(/^\/(\w+)\/?$/);
      if (!s.notesEnabled || m?.[1]?.toLowerCase() !== b.dataset.handle)
        b.remove();
    });
    if (s.notesEnabled)
      for (const link of document.querySelectorAll("main a[href]")) {
        if (link.closest('.xkit-ui,.xfb-filter,[data-testid="tweetText"]'))
          continue;
        let h;
        try {
          h = M.handle(new URL(link.href).pathname.match(/^\/(\w+)\/?$/)?.[1]);
        } catch {
          continue;
        }
        if (!h) continue;
        const span = [...link.querySelectorAll("span")].find(
          (e) =>
            !e.children.length &&
            e.textContent.trim().toLowerCase() === "@" + h,
        );
        if (!span) continue;
        let b = link.querySelector(".xkit-note-button");
        if (!b) {
          b = document.createElement("button");
          b.type = "button";
          b.className = "xkit-ui xkit-note-button";
          b.dataset.handle = h;
          b.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            editNote(h);
          };
          span.after(b);
        }
        const value = noteMap.get(h)?.text || "";
        const label = value ? "✎ " + value.slice(0, 12) : "＋备注";
        if (b.textContent !== label) b.textContent = label;
        b.title = value || "添加 @" + h + " 的本地备注";
      }
    for (const node of document.querySelectorAll(
      'main [data-testid="tweet"]',
    )) {
      const p = readPost(node);
      if (!p) continue;
      let tools = node.querySelector(".xkit-post-actions");
      if (tools && tools.dataset.id !== p.id) {
        tools.remove();
        tools = null;
        revealed.delete(node);
      }
      if (!s.libraryEnabled && !s.exportEnabled) {
        tools?.remove();
      } else {
        if (!tools) {
          tools = document.createElement("div");
          tools.className = "xkit-ui xkit-post-actions";
          tools.dataset.id = p.id;
          node.append(tools);
        }
        const marker = [
          s.libraryEnabled,
          s.exportEnabled,
          postMap.has(p.id),
        ].join("|");
        if (tools.dataset.state !== marker) {
          tools.replaceChildren();
          tools.dataset.state = marker;
          if (s.libraryEnabled)
            button(
              tools,
              postMap.has(p.id) ? "已收藏 · 编辑" : "存入素材库",
              (e) => {
                e.stopPropagation();
                editPost(readPost(node));
              },
            );
          if (s.exportEnabled)
            button(tools, "导出", (e) => {
              e.stopPropagation();
              exportSelection(readPost(node));
            });
        }
      }
      const reason = s.noiseEnabled ? M.noiseMatch(p, s) : "";
      const ruleKey = p.id + "|" + reason;
      if (!reason || revealed.get(node) === ruleKey) {
        node.classList.remove("xkit-folded");
        node.querySelector(".xkit-noise-notice")?.remove();
      } else {
        node.classList.add("xkit-folded");
        let notice = node.querySelector(".xkit-noise-notice");
        if (!notice) {
          notice = document.createElement("div");
          notice.className = "xkit-ui xkit-noise-notice";
          node.prepend(notice);
        }
        if (notice.dataset.reason !== ruleKey) {
          notice.dataset.reason = ruleKey;
          notice.replaceChildren();
          const t = document.createElement("span");
          t.textContent = "已折叠 · " + reason;
          notice.append(t);
          button(notice, "本次展开", (e) => {
            e.stopPropagation();
            revealed.set(node, ruleKey);
            schedule();
          });
        }
      }
    }
    // Clean up folded nodes when turned off, even if a recycled row no longer parses.
    if (!s.noiseEnabled)
      document.querySelectorAll(".xkit-folded").forEach((node) => {
        node.classList.remove("xkit-folded");
        node.querySelector(".xkit-noise-notice")?.remove();
      });
    const needsBar = s.libraryEnabled || s.exportEnabled || s.noiseEnabled;
    if (!needsBar) {
      bar?.remove();
      bar = null;
    } else if (document.body) {
      if (!bar?.isConnected) {
        bar = document.createElement("div");
        bar.className = "xkit-ui xkit-pagebar";
        bar.setAttribute("aria-label", "X Kit 工具");
        document.body.append(bar);
      }
      const key = [
        s.libraryEnabled,
        s.exportEnabled,
        s.noiseEnabled,
        !!readArticle(),
      ].join("|");
      if (bar.dataset.state !== key) {
        bar.dataset.state = key;
        bar.replaceChildren();
        if (s.libraryEnabled) {
          button(bar, "素材库", () =>
            message({ type: "xkit-open-library" }).catch(() => {}),
          );
          if (readArticle())
            button(bar, "收藏文章", () => editPost(readArticle()));
        }
        if (s.exportEnabled)
          button(bar, "导出已加载内容", () => exportSelection());
        if (s.noiseEnabled)
          button(bar, "降噪规则", () =>
            message({ type: "xkit-open-library" }).catch(() => {}),
          );
      }
    }
  }
  return { update, readPost, readArticle, close };
}

})();
