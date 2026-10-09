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
