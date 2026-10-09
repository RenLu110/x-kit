# Release validation

Version: 2.0.0

- [x] 24 automated tests pass on the generated extension entry points.
- [x] Preference model covers all 64 combinations of six independent switches.
- [x] DOM integration verifies independent disabling, saved-post metadata, notes, and reversible noise rules.
- [x] Service-worker harness verifies serialized writes, deduplication, disabled write gates, validated merge import and data preservation.
- [x] Browser demo: all six switches visible; all-off removes enhanced controls; notes-only leaves exactly the account-note controls.
- [x] Public screenshot is clearly labelled synthetic demo data.
- [ ] Installed v2 extension: verify save, persistence, export, switches and noise on live X after reloading.
- [ ] Public repository and release download verified independently.

The first two modules (follower badges and list filtering) were previously verified on live X in v1.1.0. This is separate from the new v2 installed-runtime checks. Article extraction remains dependent on X's current markup and covers loaded text only.
