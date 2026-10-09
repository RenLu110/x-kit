// Development-only Chrome API adapter. Never included in extension/ or the install ZIP.
(() => {
  const key = "x-kit-demo-v2";
  const listeners = [],
    messages = [];
  if (!localStorage.getItem(key))
    localStorage.setItem(
      key,
      JSON.stringify({
        "post:1001": {
          id: "1001",
          url: "https://x.com/demo_creator/status/1001",
          author: "示例 · 产品观察",
          handle: "demo_creator",
          text: "做 AI 产品，先找到用户每周重复处理、又不愿继续手工完成的那件事。",
          kind: "post",
          tags: ["AI", "产品"],
          category: "选题",
          note: "可以联系自己的客户交付案例写一篇。",
          images: [],
          partial: true,
          savedAt: Date.now(),
          updatedAt: Date.now(),
        },
        "post:1002": {
          id: "1002",
          url: "https://x.com/demo_builder/status/1002",
          author: "示例 · 独立开发",
          handle: "demo_builder",
          text: "功能增加之前，先确认上一个功能有没有被真正使用。",
          kind: "post",
          tags: ["独立开发"],
          category: "案例",
          note: "收藏原因：适合讲小工具迭代。",
          images: [],
          partial: true,
          savedAt: Date.now() - 10000,
          updatedAt: Date.now(),
        },
        "note:demo_creator": {
          handle: "demo_creator",
          text: "AI 产品实操，值得回看",
          updatedAt: Date.now(),
        },
      }),
    );
  const getState = () => JSON.parse(localStorage.getItem(key) || "{}");
  const emit = (before, after) => {
    const changes = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        changes[k] = { oldValue: before[k], newValue: after[k] };
    listeners.forEach((fn) => fn(changes, "local"));
  };
  window.addEventListener("storage", (event) => {
    if (event.key === key)
      emit(
        JSON.parse(event.oldValue || "{}"),
        JSON.parse(event.newValue || "{}"),
      );
  });
  const runtime = {
    id: "demo",
    getURL: (path) => "/extension/" + path,
    reload: () => location.reload(),
    onMessage: { addListener: (fn) => messages.push(fn) },
    sendMessage: (message) =>
      new Promise((resolve, reject) => {
        let done = false;
        const respond = (value) => {
          done = true;
          resolve(value);
        };
        messages.forEach((fn) => fn(message, { id: "demo" }, respond));
        setTimeout(() => {
          if (!done) reject(new Error("演示页暂未连接 X 页面"));
        }, 1000);
      }),
  };
  window.chrome = {
    runtime,
    storage: {
      local: {
        get: async (keys) => {
          const state = getState();
          return keys === null
            ? state
            : Object.fromEntries(
                Object.entries(keys || {}).map(([k, v]) => [k, state[k] ?? v]),
              );
        },
        set: async (entries) => {
          const before = getState(),
            after = { ...before, ...entries };
          localStorage.setItem(key, JSON.stringify(after));
          emit(before, after);
        },
        remove: async (name) => {
          const before = getState(),
            after = { ...before };
          delete after[name];
          localStorage.setItem(key, JSON.stringify(after));
          emit(before, after);
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async () => ({ version: "2.0.0", users: 12, badges: 8 }),
      create: async ({ url }) => window.open(url, "_blank"),
    },
  };
})();
