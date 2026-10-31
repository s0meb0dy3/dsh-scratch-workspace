# Configuration

Settings → Temporary workspaces, or the plugin's own page in **Plugins**.

| Setting | Default | Meaning |
|---|---|---|
| Storage root | unset (asked on first use) | Where temporary folders are created. Each task gets its own subfolder. Changing it affects new tasks only. |
| Folder prefix | `task` | Name prefix, 1–40 characters (letters, digits, Han, `_`, `-`). |
| Confirm before deletion | on | Ask before a manual cleanup. When off, **Clean up** deletes immediately. |
| Automatic cleanup | off | Idle expiry, for **new** tasks only. |
| Idle hours | 24 | 1–8760 hours. |

## How the idle timer counts

- Activity means: a user message, turn start/end, a tool call/result, an assistant
  message, or the agent changing between running and idle.
- Opening a session or browsing history does **not** count as activity.
- A cleanup is skipped while the agent, a subtask, a scheduled task or a terminal is
  still using the folder; once everything stops, the full idle period starts again.
- The check runs once a minute, so expiry is approximate.
- Nothing runs while DeepSeek Harness is closed; on the next start the timer is
  rebuilt from the session log. If that log cannot be read, the task is skipped rather
  than guessed idle.

## What changes apply to which task

Each task fixes its cleanup policy at creation (on/off and the hour count). Enabling
or changing automatic cleanup therefore never puts older work at risk, and disabling
it does not cancel a policy an existing task already carries.

Turning automatic cleanup on, or changing the hours of an enabled policy, requires an
explicit confirmation in the UI — a one-time consent to permanent deletion, not a
per-task prompt.

## Data location

Plugin state (settings, task registry, deletion authorizations):

```
~/.local/share/deepseek-harness/scratch-workspace/<profile-hash>/tasks.json
```

Task files themselves live under the configured storage root. Archived conversations
live in DeepSeek Harness's own session storage, not here.
