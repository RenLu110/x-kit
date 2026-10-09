(() => {
  "use strict";
  const C = globalThis.__XFB_CORE_V1__;
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
  /* LIST_FILTER_FACTORY */
  /* MODEL_FACTORY */
  /* POST_TOOLS_FACTORY */
})();
