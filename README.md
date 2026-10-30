# Temporary Workspaces for DeepSeek Harness

[![npm](https://img.shields.io/npm/v/@s0meb0dy3/dsh-scratch-workspace)](https://www.npmjs.com/package/@s0meb0dy3/dsh-scratch-workspace)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

One-click temporary workspaces for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness):
create a throwaway folder with its own workspace and session, manage every running
one from a sidebar panel, and delete the files safely when you are done — or let an
optional idle timer do it for you.

> [!WARNING]
> Cleanup **permanently deletes the folder and everything inside it**. Files do not go
> to the Trash, and there is no undo. The conversation is retained and archived.

## Features

- **One entry, two jobs** — the sidebar **Temporary workspaces** panel is the only
  place: `＋ Temporary task` creates, the list below manages.
- **Per-workspace cards** — friendly name (`task · 10-30 14:17`), live state
  (running / terminal open / unable to check), idle countdown, folder size, and the
  session titles inside that workspace (click to jump).
- **Safe cleanup** — verifies the folder is still the one the plugin created
  (canonical path, parent/task inode, ownership marker), writes a durable deletion
  authorization first, and can resume a partially failed delete after restart.
- **Idle auto-expiry** — off by default; 1–8760 hours. New tasks only: a task fixes
  its policy at creation, so changing settings never deletes older work by surprise.
- **Never fights the app** — cleanup is refused while the agent is running or a
  terminal is attached; the list shows that state before you click.
- **Settings vs. panel** — settings hold configuration only; the panel holds running
  workspaces.

## Install

Requires DeepSeek Harness 0.2.1 (developed and tested against `0.2.1` on macOS) and Node 22+.

```sh
npm install -g @s0meb0dy3/dsh-scratch-workspace
dsh plugin --profile <your-profile> install @s0meb0dy3/dsh-scratch-workspace
```

Or install from a checkout:

```sh
git clone https://github.com/s0meb0dy3/dsh-scratch-workspace.git
cd dsh-scratch-workspace
npm install
node build.mjs
dsh plugin --profile <your-profile> install "$PWD"
```

Then restart the app (client plugins load at page start) and open **Temporary
workspaces** in the left sidebar. The plugin icon is a folder with a clock.

## How it behaves

1. Click `＋ Temporary task` → a folder is created under your configured root, a
   workspace is registered, and a session is opened for you.
2. Work as usual. The card shows the idle countdown, folder size and sessions.
3. Click `清理` (Clean up) → confirm → the folder is deleted, the workspace
   registration is removed, and the conversation is archived.
4. Forget to clean up and auto-expiry is on → the same cleanup runs when idle.

Cleanup is refused when the agent is running or a terminal is attached to that
folder; the state chip tells you before you click.

## Configuration

Settings → Temporary workspaces (or the plugin's own page):

| Setting | Default | Meaning |
|---|---|---|
| Storage root | unset (asked on first use) | Where temporary folders are created |
| Folder prefix | `task` | Name prefix, 1–40 word characters |
| Confirm before deletion | on | Ask before deleting manually |
| Automatic cleanup | off | Idle expiry for **new** tasks |
| Idle hours | 24 | 1–8760 hours |

Auto-expiry requires an explicit confirmation when enabled or when changing the
hours of an already-enabled policy.

## What stays, what goes

| After cleanup | |
|---|---|
| Task folder and all files | **deleted permanently** |
| Workspace registration | removed |
| Conversation history | kept and archived (file links stop working) |
| Plugin record | kept as `completed`, so the session cannot run again |

DSH's own **Delete workspace** only removes the registration and keeps files on
disk — use this plugin's panel (or auto-expiry) when you actually want the files gone.

## Platform support

- **macOS**: tested end to end (create, manage, cleanup, auto-expiry).
- **Windows**: not verified. Known risks: `O_NOFOLLOW` is POSIX-only, `ino`
  semantics differ, reserved filenames and case-insensitive paths are not handled.
  Expect to fix those before relying on it.
- **Linux**: not verified, expected to work like macOS.

## Security model

- Cleanup only ever targets a **registered direct child** of a configured root, and
  re-verifies canonical path, inode pair and an ownership marker before `rm`.
- A durable authorization is written before the first deletion, so a crash mid-way is
  recoverable instead of leaving an unclearable folder.
- Child symlinks are unlinked, never traversed.
- Completion, auto-cleanup consent and the delete confirmation are **user-only**; the
  agent tool can only read state, configure root/prefix, and create tasks.
- Not an OS sandbox: path-based Node APIs keep a residual TOCTOU window, and one DSH
  process per profile is assumed.

## Development

```sh
npm install
npm run build     # bundle host sources into host.js
npm test          # node --test; 70 tests over real filesystem behaviour
```

`host.js` is generated. `client.js` is a plain module-loader bundle (no build step).

## License

MIT © 2026 s0meb0dy3
