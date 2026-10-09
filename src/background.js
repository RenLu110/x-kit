(() => {
  const M = createModel();
  let queue = Promise.resolve();
  async function writeEntries(entries) {
    const all = await chrome.storage.local.get(null);
    const merged = { ...all, ...entries };
    if (Object.keys(merged).filter((k) => k.startsWith("post:")).length > 1500)
      throw new Error("素材库已达 1,500 条，请先导出备份并整理");
    if (
      new TextEncoder().encode(JSON.stringify(merged)).length >
      8 * 1024 * 1024
    )
      throw new Error("本地数据接近容量上限，请先导出备份并整理");
    await chrome.storage.local.set(entries);
  }
  async function handle(message) {
    const state = await chrome.storage.local.get(null);
    const prefs = M.prefs(state);
    if (message.type === "xkit-save-post") {
      if (!prefs.libraryEnabled) throw new Error("收藏模块已关闭");
      const post = M.normalizePost(message.post);
      const old = state["post:" + post.id];
      if (old) post.savedAt = old.savedAt;
      await writeEntries({ ["post:" + post.id]: post });
      return { post };
    }
    if (message.type === "xkit-save-note") {
      if (!prefs.notesEnabled) throw new Error("账号备注模块已关闭");
      const note = M.normalizeNote(message.note);
      await writeEntries({ ["note:" + note.handle]: note });
      return { note };
    }
    if (message.type === "xkit-delete") {
      if (!/^(?:post:(?:article-)?\d+|note:\w{1,15})$/.test(message.key))
        throw new Error("无效条目");
      const old = state[message.key];
      if (!old) return {};
      await chrome.storage.local.remove(message.key);
      return { deleted: old };
    }
    if (message.type === "xkit-import") {
      const incoming = M.validateBackup(message.backup);
      const entries = {};
      let added = 0,
        skipped = 0;
      for (const [prefix, items] of [
        ["post:", incoming.posts],
        ["note:", incoming.notes],
      ])
        for (const value of items) {
          const key = prefix + (value.id || value.handle);
          if (state[key] || entries[key]) {
            skipped++;
            continue;
          }
          entries[key] = value;
          added++;
        }
      await writeEntries(entries);
      return { added, skipped };
    }
    throw new Error("不支持的操作");
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message?.type?.startsWith("xkit-") || sender.id !== chrome.runtime.id)
      return;
    if (["xkit-open-library"].includes(message.type)) {
      chrome.tabs
        .create({ url: chrome.runtime.getURL("library.html") })
        .then(() => respond({ ok: true }))
        .catch((error) => respond({ ok: false, error: error.message }));
      return true;
    }
    const job = queue.then(() => handle(message));
    queue = job.catch(() => {});
    job
      .then((result) => respond({ ok: true, ...result }))
      .catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
  /* MODEL_FACTORY */
})();
