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
