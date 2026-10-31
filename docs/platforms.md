# Platforms

| Platform | Status |
|---|---|
| macOS | **Verified** end to end: create, manage, cleanup, idle expiry, restart recovery. |
| Linux | Not verified. Expected to behave like macOS (POSIX filesystem semantics). |
| Windows | **Not verified — expect breakage.** |

## Windows caveats

The host half is plain Node (`node:fs`, `node:path`) with no macOS-specific commands,
and "Open folder" uses the Host's own file-manager integration (Explorer on Windows),
so the design is portable. Four things are known to need work before Windows can be
trusted:

1. **`O_NOFOLLOW`** is POSIX-only; reading the state file with it will throw on
   Windows.
2. **`ino` semantics** differ; some filesystems report unstable or zero inodes, which
   weakens the identity checks that protect deletion.
3. **Reserved filenames** (`CON`, `NUL`, …) and names ending in a dot or space are not
   rejected by the prefix validation.
4. **Case-insensitive paths** are not normalised, so two spellings of one directory
   could be treated as different.

Contributions that fix these are welcome; each needs a test that would fail on the
current code.
