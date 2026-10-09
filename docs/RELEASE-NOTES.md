# X Kit v2.0.0 — public preview

Six independently switchable local tools for X/Twitter:

- Follower-count badges.
- Filtering of already-rendered following/follower lists.
- Private account notes.
- A local clipping library with categories, tags, notes and search.
- Markdown/copy export of selected loaded posts and detected article text.
- Literal keyword/account noise filtering with allowlists and reversible folding.

## Install

Download `x-kit-v2.0.0.zip`, extract it, open `chrome://extensions`, enable Developer mode, then load the extracted folder containing `manifest.json`. Refresh X. No Node.js or API key is needed. Requires Chrome 114+ or compatible Edge.

For updates, reload the extension, then refresh the specific X tab. The popup checks the actual page-script version.

## Validation and scope

24 automated tests pass, including all 64 preference combinations, storage validation/serialization, backup merge and DOM integration. Browser demonstrations verify all-off, notes-only, persistent clipping/search, and reversible noise rules. GitHub CI passes and the public source was independently cloned.

This is a preview: new modules still need the installed-extension live-X validation described in `docs/RELEASE-CHECKLIST.md`. Earlier follower badges/list filtering were verified on live X in v1.1.0. Exports cover loaded content only; the library is separate from native X bookmarks. Article extraction may need adaptation as X changes its markup.

`SHA256SUMS.txt` contains the package checksum. MIT licensed. No backend, telemetry or uploads.
