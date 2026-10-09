(() => {
  "use strict";
  if (window.__XFB_HOOK_V1__) return;
  window.__XFB_HOOK_V1__ = true;
  const C = globalThis.__XFB_CORE_V1__;
  const cache = new Map();
  const pending = new Map();
  let timer;
  let enabled = true;
  function flush() {
    timer = null;
    if (!pending.size) return;
    const records = [...pending.values()];
    pending.clear();
    for (let i = 0; i < records.length; i += 250) {
      window.postMessage(
        {
          channel: C.CHANNEL,
          type: "records",
          records: records.slice(i, i + 250),
        },
        location.origin,
      );
    }
  }
  function ingest(data) {
    if (!enabled) return;
    const now = Date.now();
    for (const user of C.extract(data)) {
      const record = { ...user, at: now };
      cache.delete(user.handle);
      cache.set(user.handle, record);
      pending.set(user.handle, record);
    }
    while (cache.size > C.LIMIT) cache.delete(cache.keys().next().value);
    while (pending.size > C.LIMIT) pending.delete(pending.keys().next().value);
    if (pending.size && !timer) timer = setTimeout(flush, 60);
  }
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== C.CHANNEL
    )
      return;
    if (event.data.type === "config") {
      enabled = event.data.enabled === true;
      if (!enabled) {
        cache.clear();
        pending.clear();
      }
      return;
    }
    if (event.data.type !== "ready") return;
    for (const [key, record] of cache) {
      if (Date.now() - record.at < C.TTL) pending.set(key, record);
      else cache.delete(key);
    }
    if (!timer) timer = setTimeout(flush, 60);
  });
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = Reflect.apply(originalFetch, this, args);
    try {
      const input = args[0];
      const url =
        typeof input === "string" ? input : input?.url || String(input);
      if (enabled && C.isApi(url, location.href)) {
        promise
          .then((response) => {
            if (!response.ok) return;
            if (
              Number(response.headers.get("content-length")) >
              8 * 1024 * 1024
            )
              return;
            return response
              .clone()
              .text()
              .then((text) => {
                if (text.length <= 8 * 1024 * 1024) ingest(JSON.parse(text));
              });
          })
          .catch(() => {});
      }
    } catch {
      /* Never change the page's request outcome. */
    }
    return promise;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const urls = new WeakMap();
  const attached = new WeakSet();
  XMLHttpRequest.prototype.open = function (...args) {
    const result = Reflect.apply(originalOpen, this, args);
    urls.set(this, String(args[1]));
    if (!attached.has(this)) {
      attached.add(this);
      this.addEventListener("load", () => {
        try {
          if (
            !enabled ||
            this.status < 200 ||
            this.status >= 300 ||
            !C.isApi(this.responseURL || urls.get(this), location.href)
          )
            return;
          if (this.responseType === "json") ingest(this.response);
          else if (
            (!this.responseType || this.responseType === "text") &&
            this.responseText.length <= 8 * 1024 * 1024
          ) {
            ingest(JSON.parse(this.responseText));
          }
        } catch {
          /* Non-JSON and failed responses are ignored. */
        }
      });
    }
    return result;
  };
})();
