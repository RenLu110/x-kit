# Contributing

Use Node.js 22 or newer. No build step is needed to install the checked-in `extension/` folder.

```sh
npm ci --ignore-scripts
npm test
```

Edit `src/` for the entry points. `build.cjs` inlines shared factories into standalone scripts; this avoids relying on globals shared between different extension execution worlds. The generated entry points in `extension/` must be committed with the source changes.

For local visual checks, run `node preview/serve.cjs` and open `http://127.0.0.1:8791/preview/toolkit.html`. Demo data is explicitly synthetic. The browser API adapter in `preview/dev-runtime.js` is not shipped in the extension.

Before a release:

- Check each feature alone and all six together in a real installed extension.
- Check opening, closing and reloading the popup, and reloading X.
- Verify one explicit save, a JSON backup/import round trip, and an export.
- Verify a noise rule folds the intended post and can be reversed.
- Verify list coverage is labelled as partial; never claim a complete follower list or complete thread from a loaded-page snapshot.
- Keep screenshots of real accounts, saved bookmarks, credentials, browser profiles and local logs out of commits. Use `docs/assets/` for clearly labelled synthetic demonstrations only.

Bug reports should include the extension version, browser version, page type and a redacted description. Do not attach cookies, authentication headers, or private exports.
