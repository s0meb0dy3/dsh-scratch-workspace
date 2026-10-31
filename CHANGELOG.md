# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.3] - 2026-10-31

### Changed
- Releases are published by GitHub Actions through npm Trusted Publishing (OIDC);
  no tokens are stored anywhere. This release validates that configuration.

## [1.6.2] - 2026-10-31

### Added
- Chinese README (`README.zh.md`), linked from both language variants.

### Fixed
- Install instructions now describe the real path: Plugins page → install → paste the
  package name, instead of a CLI command that shipped builds do not expose.
- Publishing no longer requires local dev dependencies: `prepublishOnly` verifies
  that `host.js` is newer than its sources (`build.mjs --check`) instead of bundling,
  so a machine without `node_modules` can still publish the committed artifact.

### Infrastructure
- GitHub Actions CI (build freshness, tests on macOS/Ubuntu/Windows × Node 22/24,
  tarball content check).
- Release workflow publishing through npm Trusted Publishing (OIDC) — no tokens.

## [1.6.0] - 2026-10-31

### Added
- Sidebar **Temporary workspaces** panel: the single entry point for creating and
  managing temporary workspaces.
- Per-workspace cards with a friendly name, live state (running / terminal open /
  unable to check), idle countdown, folder size and the workspace's session titles.
- `Open folder` action using the Host's native file manager.
- Bulk **Clean up all**.
- Sessions created by hand inside a temporary folder are recognised as part of it and
  archived together when the folder is cleaned up.

### Changed
- Settings carry configuration only; the running workspaces live in the panel.
- Removed the in-session "Complete" button, the session menu entry and the composer
  status bar in favour of the single panel.
- Plugin renamed to `@s0meb0dy3/dsh-scratch-workspace`, MIT licensed, publish-ready.

## [1.1.0] - 2026-10-29

### Added
- Optional idle auto-expiry (off by default, 1–8760 hours) that only applies to tasks
  created after the policy changes.
- Activity tracking from session events, with recovery from the session log after a
  restart.

### Changed
- Settings page reached from Settings; switches show explicit On/Off state.

## [1.0.0] - 2026-10-29

### Added
- First working version: one-click temporary workspace creation (folder + workspace +
  session) and explicit completion that deletes the folder, removes the registration
  and archives the conversation.
- Ownership verification (canonical path, parent/task inode, ownership marker) and a
  durable deletion journal that survives a crash mid-delete.
- 69 automated tests over real filesystem behaviour.
