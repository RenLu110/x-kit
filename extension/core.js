/* Shared pure logic; no network, DOM, or storage access. */
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
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.defineProperty(globalThis, '__XFB_CORE_V1__', {value: api, configurable: true});
})();
