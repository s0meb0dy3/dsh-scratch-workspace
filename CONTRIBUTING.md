# Contributing

## Requirements

- Node 22 or newer
- DeepSeek Harness 0.2.1 or newer

## Develop locally

```sh
git clone https://github.com/s0meb0dy3/dsh-scratch-workspace.git
cd dsh-scratch-workspace
npm install        # esbuild, the only dev dependency
npm test           # 70 tests over real filesystem behaviour
npm run build      # regenerate host.js from the host sources
```

Then, in DeepSeek Harness, open **Plugins** → **Install** and paste the absolute path
of this checkout. Restart the app after changing host sources; client-only changes are
picked up by the client module HMR.

## Layout

| File | Role |
|---|---|
| `index.js` | Host entry: services, RPC channel, agent tool, event wiring, scheduler |
| `service.js` | Task lifecycle: create, cleanup, idle sweep, activity tracking |
| `core.js` | Filesystem ownership: creation, verification, deletion, persistence |
| `activity.js` | Recover last activity from the session log |
| `user-api.js` | Authenticated user-only operation dispatch |
| `client.js` | Sidebar panel, settings page, dialogs (module-loader bundle, no build) |
| `host.js` | **Generated** — built from the files above; never edit by hand |

## Build freshness

`host.js` is committed so the package works without a build step. `build.lock.json`
holds a content hash of the host sources:

```sh
npm run build:check   # fails when host.js and its sources disagree
```

`prepublishOnly` runs this check plus the tests, so a stale artifact cannot be
published. **Run `npm run build` after every host change.**

## Tests

`npm test` runs `node --test`. The suite uses real temporary directories (never mocks
the filesystem) and covers ownership checks, symlink attacks, partial-deletion
recovery, idle boundaries, busy/terminal skips, restart recovery and the user-only
authorization boundary.

## Release

Releases are published by CI through npm **Trusted Publishing** (OIDC); no tokens are
stored anywhere.

```sh
npm version patch          # or minor / major
git push --follow-tags     # tag push triggers .github/workflows/release.yml
```

The workflow verifies that the tag matches `package.json`, runs `build:check` and the
tests, then publishes with provenance. Add a short entry to `CHANGELOG.md` in the same
commit. A `workflow_dispatch` run with *dry run* lets you build and test without
publishing.
