# Security model

This plugin deletes files, so its guarantees matter. Here is exactly what it does —
and what it deliberately does not protect against.

## What cleanup verifies

Cleanup only ever targets one **registered direct child** of a configured root. Before
`rm`, and again inside the durable authorization record, it checks:

1. the canonical path is still the registered task path;
2. the parent directory and the task directory keep the same `dev`/`ino` pair
   (a same-named replacement is refused);
3. an ownership marker file inside the folder matches its recorded token and inode.

A durable **deletion authorization** is written before the first `rm`, so a crash in
the middle is recoverable on the next start instead of leaving a folder nobody can
clean. Child symlinks are unlinked, never followed.

## Who can trigger what

- **Completion, automatic-cleanup consent and the delete confirmation are user-only.**
  They are reachable only from the authenticated UI channel.
- The agent tool (`scratch_workspace`) can read state, change the root/prefix and
  create a task — it cannot delete anything or weaken a confirmation.
- A cleanup is refused while the agent, a subtask, a scheduled task or a terminal still
  uses the folder, and the list shows that state before you click.
- Sessions created by hand inside a temporary folder are treated as part of it: they
  are archived together with the folder instead of blocking cleanup.

## What this is not

- **Not an OS sandbox.** Path-based Node APIs keep a residual TOCTOU window, so a
  process that can already write to these paths is out of scope.
- **Not a backup.** Deletion is permanent; anything you need must be exported first.
- **Single process.** One DeepSeek Harness process per profile is assumed; two
  concurrent processes can race on the same state file.
- **Not protection from other apps.** While cleanup runs, the plugin briefly locks the
  browser API channel and refuses new model steps in the finished session, but it
  cannot stop an unrelated process from writing into the folder.
