# Privacy / 隐私说明

X Kit has no backend, analytics, telemetry, API key, remote model, or remote executable code. It is independent of X Corp.

## What stays on your device

- User handles and follower counts observed in X's existing responses: bounded page memory, up to 4,000 records, 30-minute expiry.
- List membership, displayed names and biographies: bounded page memory for the current list, cleared on navigation/reload.
- Posts you explicitly save, your labels and notes, and account annotations: `chrome.storage.local` in your browser profile.
- Six feature switches, number format and noise rules: `chrome.storage.local`.

The library is separate from X bookmarks. X Kit does not follow, unfollow, block, like, send messages, or publish posts. Noise filtering only folds local page elements.

The only requested API permission is `storage`. Content scripts are limited to x.com and twitter.com. A local service worker validates and serializes writes. Turning off a feature preserves saved records. Turning off both follower display and list filtering stops response parsing, though transparent request wrappers remain installed until navigation.

## Export and deletion

Exports and backups are created on-device when you click their buttons. JSON imports add new records and skip existing keys. They never overwrite existing records. Removing the extension deletes its local storage; back up first. The library limits new writes to approximately 8 MB and 1,500 saved posts. Browser profiles do not automatically share X Kit data.

Markdown images use links from X's image CDN; opening those links or rendering remote images later makes ordinary requests from your reader. X Kit does not download or upload those images as part of its saving operation. Posts visible only to you can still be saved locally, so review any export before sharing it.

## 中文

没有服务器、统计埋点、云端模型或数据上传。收藏和备注仅保存在当前浏览器；列表和粉丝数缓存仅存在当前页面内存中。开关不会删除已存内容，卸载插件会删除扩展本地数据，请先导出 JSON 备份。素材库独立于 X 的书签，不会在 X 上自动关注、取关、点赞、发消息或发布帖子。导出保留原链接，是否分享由你决定。
