// index.js
import path5 from "node:path";
import os3 from "node:os";
import { createHash } from "node:crypto";

// core.js
import * as fs from "node:fs/promises";
import { constants as constants2 } from "node:fs";
import path2 from "node:path";
import os2 from "node:os";
import { randomBytes, randomUUID } from "node:crypto";

// trash.js
import { access, mkdir, rename } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var run = promisify(execFile);
async function moveToTrash(target) {
  const override = process.env.DSH_SCRATCH_TRASH_DIR;
  if (override) return moveInto(override, target);
  if (process.platform === "darwin") {
    return moveInto(path.join(os.homedir(), ".Trash"), target);
  }
  if (process.platform === "win32") {
    return recycleOnWindows(target);
  }
  return trashWithGio(target);
}
async function moveInto(directory, target) {
  await mkdir(directory, { recursive: true });
  const finalPath = await uniquePath(directory, path.basename(target));
  try {
    await rename(target, finalPath);
  } catch (error) {
    if (error.code === "EXDEV") {
      throw new Error(
        `\u4E34\u65F6\u76EE\u5F55\u4E0E\u5E9F\u7EB8\u7BD3\u4E0D\u5728\u540C\u4E00\u78C1\u76D8\uFF0C\u65E0\u6CD5\u79FB\u5165\u5E9F\u7EB8\u7BD3\uFF1A${target}\u3002\u8BF7\u5148\u628A\u5B58\u653E\u4F4D\u7F6E\u6539\u5230\u540C\u4E00\u78C1\u76D8\uFF0C\u6216\u624B\u52A8\u5904\u7406\u8BE5\u76EE\u5F55\u3002`
      );
    }
    throw error;
  }
  return { trashed: true, location: finalPath };
}
async function uniquePath(directory, name) {
  const exists = async (value) => access(value, constants.F_OK).then(() => true, () => false);
  let candidate = path.join(directory, name);
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(directory, `${name} ${index}`);
    index += 1;
  }
  return candidate;
}
async function recycleOnWindows(target) {
  const script = [
    "Add-Type -AssemblyName Microsoft.VisualBasic;",
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${target.replace(/'/g, "''")}',`,
    "'OnlyErrorDialogs', 'SendToRecycleBin')"
  ].join(" ");
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  return { trashed: true, location: null };
}
async function trashWithGio(target) {
  try {
    await run("gio", ["trash", "--", target]);
    return { trashed: true, location: null };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("\u6B64\u7CFB\u7EDF\u6CA1\u6709\u53EF\u7528\u7684\u56DE\u6536\u7AD9\u5DE5\u5177\uFF08gio\uFF09\u3002\u8BF7\u5B89\u88C5 glib2 \u7684 gio\uFF0C\u6216\u624B\u52A8\u5904\u7406\u8BE5\u76EE\u5F55\u3002");
    }
    throw error;
  }
}

// core.js
var DEFAULT_SETTINGS = Object.freeze({ rootDirectory: "", directoryPrefix: "task", confirmDelete: true, autoCleanupEnabled: false, idleHours: 24 });
var isoTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function cleanupPolicy(value) {
  object(value, "cleanupPolicy");
  if (typeof value.enabled !== "boolean" || !Number.isInteger(value.idleHours) || value.idleHours < 1 || value.idleHours > 8760 || Object.keys(value).some((key) => !["enabled", "idleHours"].includes(key))) fail("Invalid cleanupPolicy", "ERR_SCRATCH_VALIDATION");
  return { enabled: value.enabled, idleHours: value.idleHours };
}
var MARKER = ".dsh-scratch-owner.json";
var PREFIX = /^[\p{Script=Han}A-Za-z0-9_-]{1,40}$/u;
var UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
var clone = (value) => structuredClone(value);
var identity = (stat2) => ({ dev: String(stat2.dev), ino: String(stat2.ino) });
var sameIdentity = (stat2, dev, ino) => String(stat2.dev) === dev && String(stat2.ino) === ino;
var missing = (error) => error?.code === "ENOENT";
function fail(message, code = "ERR_SCRATCH_UNSAFE") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function absolute(value, name) {
  if (typeof value !== "string" || !value || value.includes("\0")) fail(`${name} must be an absolute path`, "ERR_SCRATCH_VALIDATION");
  const expanded = value.startsWith("~/") ? path2.join(os2.homedir(), value.slice(2)) : value;
  if (!path2.isAbsolute(expanded)) fail(`${name} must be an absolute path`, "ERR_SCRATCH_VALIDATION");
  return path2.resolve(expanded);
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`, "ERR_SCRATCH_VALIDATION");
}
function settingsPatch(patch, current) {
  object(patch, "settings patch");
  for (const key of Object.keys(patch)) if (!Object.hasOwn(DEFAULT_SETTINGS, key)) fail(`Unknown setting: ${key}`, "ERR_SCRATCH_VALIDATION");
  const next = { ...current, ...patch };
  if (typeof next.rootDirectory !== "string") fail("rootDirectory must be a string", "ERR_SCRATCH_VALIDATION");
  if (next.rootDirectory !== "") next.rootDirectory = absolute(next.rootDirectory, "rootDirectory");
  if (typeof next.directoryPrefix !== "string" || !PREFIX.test(next.directoryPrefix) || [...next.directoryPrefix].length > 40) fail("directoryPrefix must contain 1\u201340 letters, digits, Han characters, _ or -", "ERR_SCRATCH_VALIDATION");
  if (typeof next.confirmDelete !== "boolean") fail("confirmDelete must be a boolean", "ERR_SCRATCH_VALIDATION");
  if (typeof next.autoCleanupEnabled !== "boolean") fail("autoCleanupEnabled must be a boolean", "ERR_SCRATCH_VALIDATION");
  if (!Number.isInteger(next.idleHours) || next.idleHours < 1 || next.idleHours > 8760) fail("idleHours must be an integer from 1 to 8760", "ERR_SCRATCH_VALIDATION");
  return next;
}
function deletionBinding(record) {
  return JSON.stringify(["id", "rootDirectory", "path", "directoryName", "rootDev", "rootIno", "dev", "ino", "markerDev", "markerIno", "markerToken"].map((key) => record[key]));
}
function recordShape(record) {
  object(record, "record");
  if (!UUID.test(record.id)) fail("Invalid record id");
  if (absolute(record.rootDirectory, "record root") !== record.rootDirectory || absolute(record.path, "record path") !== record.path) fail("Record paths must be normalized absolute paths");
  if (record.directoryName !== path2.basename(record.path) || record.directoryName === "." || record.directoryName === ".." || path2.dirname(record.path) !== record.rootDirectory || record.path === record.rootDirectory) fail("Task must be a direct child of its recorded root");
  for (const key of ["rootDev", "rootIno", "dev", "ino", "markerDev", "markerIno"]) {
    if (typeof record[key] !== "string" || !/^\d+$/.test(record[key])) fail(`Invalid record identity: ${key}`);
  }
  if (typeof record.markerToken !== "string" || !/^[a-f0-9]{64}$/.test(record.markerToken)) fail("Invalid ownership token");
  if (typeof record.phase !== "string" || !record.phase) fail("Invalid phase");
  cleanupPolicy(record.cleanupPolicy);
  if (!isoTime(record.lastActivityAt)) fail("Invalid lastActivityAt");
  if (record.cleanupRetryAt != null && !isoTime(record.cleanupRetryAt)) fail("Invalid cleanupRetryAt");
}
var ScratchStore = class {
  constructor({ stateDir, trash = moveToTrash } = {}) {
    this._stateDir = absolute(stateDir, "stateDir");
    this._trash = trash;
    this._state = null;
    this._queue = Promise.resolve();
  }
  _enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(() => {
    });
    return result;
  }
  async _initialize() {
    if (this._state) return;
    await fs.mkdir(this._stateDir, { recursive: true, mode: 448 });
    const stat2 = await fs.lstat(this._stateDir, { bigint: true });
    if (!stat2.isDirectory() || stat2.isSymbolicLink()) fail("stateDir must be a real directory");
    this._stateDir = await fs.realpath(this._stateDir);
    this._stateIdentity = identity(stat2);
    let state;
    try {
      const file = await fs.open(path2.join(this._stateDir, "tasks.json"), constants2.O_RDONLY | constants2.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile()) fail("tasks.json must be a regular file");
        state = JSON.parse(await file.readFile("utf8"));
      } finally {
        await file.close();
      }
    } catch (error) {
      if (!missing(error)) throw error;
      state = { version: 1, settings: { ...DEFAULT_SETTINGS }, tasks: [] };
    }
    object(state, "state");
    if (state.version !== 1 || !Array.isArray(state.tasks)) fail("Unsupported or invalid tasks.json");
    state.settings = settingsPatch(state.settings, DEFAULT_SETTINGS);
    const ids = /* @__PURE__ */ new Set();
    const paths = /* @__PURE__ */ new Set();
    for (const record of state.tasks) {
      record.cleanupPolicy ??= { enabled: false, idleHours: 24 };
      record.lastActivityAt ??= isoTime(record.createdAt) ? record.createdAt : (/* @__PURE__ */ new Date()).toISOString();
      recordShape(record);
      if (ids.has(record.id) || paths.has(record.path)) fail("Duplicate stored task");
      ids.add(record.id);
      paths.add(record.path);
    }
    state.deletionAuthorizations ??= [];
    if (!Array.isArray(state.deletionAuthorizations)) fail("Invalid deletion authorization journal");
    const authorizedIds = /* @__PURE__ */ new Set();
    for (const authorization of state.deletionAuthorizations) {
      object(authorization, "deletion authorization");
      const record = state.tasks.find((task) => task.id === authorization.id);
      if (!record || authorizedIds.has(authorization.id) || authorization.binding !== deletionBinding(record)) fail("Invalid deletion authorization binding");
      authorizedIds.add(authorization.id);
    }
    this._state = clone(state);
  }
  init() {
    return this._enqueue(async () => {
      await this._initialize();
      return this;
    });
  }
  _run(operation) {
    return this._enqueue(async () => {
      await this._initialize();
      return operation();
    });
  }
  getSettings() {
    return this._run(() => clone(this._state.settings));
  }
  list() {
    return this._run(() => clone(this._state.tasks));
  }
  get(id) {
    return this._run(() => clone(this._state.tasks.find((task) => task.id === id) ?? null));
  }
  async _assertStateDirectory() {
    const stat2 = await fs.lstat(this._stateDir, { bigint: true });
    if (!stat2.isDirectory() || stat2.isSymbolicLink() || !sameIdentity(stat2, this._stateIdentity.dev, this._stateIdentity.ino) || await fs.realpath(this._stateDir) !== this._stateDir) fail("stateDir was replaced");
  }
  // Explicitly validate the exact absolute temporary/source/destination paths
  // before each unlink or rename. Never operate on caller-derived loose paths.
  async _assertStatePaths(temp, destination) {
    await this._assertStateDirectory();
    if (!path2.isAbsolute(temp) || path2.dirname(temp) !== this._stateDir || !/^\.tasks-[a-f0-9-]+\.tmp$/.test(path2.basename(temp)) || destination !== path2.join(this._stateDir, "tasks.json") || !path2.isAbsolute(destination)) fail("Invalid atomic state write paths");
  }
  async _persist(next) {
    const destination = path2.join(this._stateDir, "tasks.json");
    const temp = path2.join(this._stateDir, `.tasks-${randomUUID()}.tmp`);
    await this._assertStatePaths(temp, destination);
    let created = false;
    let tempIdentity;
    try {
      const handle = await fs.open(temp, "wx", 384);
      created = true;
      try {
        tempIdentity = identity(await handle.stat({ bigint: true }));
        await handle.writeFile(`${JSON.stringify(next, null, 2)}
`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this._assertStatePaths(temp, destination);
      const tempStat = await fs.lstat(temp, { bigint: true });
      if (!tempStat.isFile() || tempStat.isSymbolicLink() || !sameIdentity(tempStat, tempIdentity.dev, tempIdentity.ino)) fail("Atomic state temporary file was replaced");
      await fs.rename(temp, destination);
      created = false;
    } finally {
      if (created) {
        await this._assertStatePaths(temp, destination);
        let leftover;
        try {
          leftover = await fs.lstat(temp, { bigint: true });
        } catch (error) {
          if (!missing(error)) throw error;
        }
        if (leftover) {
          if (!tempIdentity || !leftover.isFile() || leftover.isSymbolicLink() || !sameIdentity(leftover, tempIdentity.dev, tempIdentity.ino)) fail("Refusing to unlink replaced atomic temporary file");
          await fs.unlink(temp);
        }
      }
    }
  }
  async _commit(next) {
    await this._persist(next);
    this._state = next;
  }
  saveSettings(patch) {
    return this._run(async () => {
      const next = clone(this._state);
      next.settings = settingsPatch(patch, next.settings);
      await this._commit(next);
      return clone(next.settings);
    });
  }
  async _rootIdentity(root) {
    const info = await fs.lstat(root, { bigint: true });
    if (!info.isDirectory() || info.isSymbolicLink()) fail("Root must be a real directory, not a symlink");
    const canonical = await fs.realpath(root);
    return { canonical, ...identity(info) };
  }
  async _assertRoot(record, allowMissing = false) {
    try {
      const info = await this._rootIdentity(record.rootDirectory);
      if (info.canonical !== record.rootDirectory || info.dev !== record.rootDev || info.ino !== record.rootIno) fail("Recorded root was replaced");
      return true;
    } catch (error) {
      if (allowMissing && missing(error)) return false;
      throw error;
    }
  }
  async _assertTask(record, allowMissing = false) {
    recordShape(record);
    if (!await this._assertRoot(record, allowMissing)) return false;
    let stat2;
    try {
      stat2 = await fs.lstat(record.path, { bigint: true });
    } catch (error) {
      if (allowMissing && missing(error)) return false;
      throw error;
    }
    if (!stat2.isDirectory() || stat2.isSymbolicLink() || !sameIdentity(stat2, record.dev, record.ino) || await fs.realpath(record.path) !== record.path) fail("Recorded task directory was replaced");
    return true;
  }
  async _assertOwned(record, allowMissing = false) {
    if (!await this._assertTask(record, allowMissing)) return false;
    const markerPath = path2.join(record.path, MARKER);
    const stat2 = await fs.lstat(markerPath, { bigint: true });
    if (!stat2.isFile() || stat2.isSymbolicLink() || !sameIdentity(stat2, record.markerDev, record.markerIno)) fail("Ownership marker was replaced");
    const handle = await fs.open(markerPath, constants2.O_RDONLY | constants2.O_NOFOLLOW);
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile() || !sameIdentity(opened, record.markerDev, record.markerIno) || opened.size > 16384n) fail("Unsafe ownership marker");
      const marker = JSON.parse(await handle.readFile("utf8"));
      if (marker.version !== 1 || marker.id !== record.id || marker.token !== record.markerToken) fail("Ownership marker does not match");
    } finally {
      await handle.close();
    }
    await this._assertTask(record);
    return true;
  }
  createDirectory({ atMs = Date.now() } = {}) {
    return this._run(async () => {
      if (!Number.isFinite(atMs)) fail("Invalid creation timestamp", "ERR_SCRATCH_VALIDATION");
      const { rootDirectory, directoryPrefix, autoCleanupEnabled, idleHours } = this._state.settings;
      if (!rootDirectory) fail("Configure rootDirectory before creating a task", "ERR_SCRATCH_VALIDATION");
      await fs.mkdir(rootDirectory, { recursive: true });
      const root = await this._rootIdentity(rootDirectory);
      const id = randomUUID();
      const date = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
      const directoryName = `${directoryPrefix}-${date}-${id}`;
      const directory = path2.join(root.canonical, directoryName);
      if (!path2.isAbsolute(directory) || path2.dirname(directory) !== root.canonical || directory === root.canonical) fail("Invalid task creation path");
      await fs.mkdir(directory, { mode: 448 });
      const info = await fs.lstat(directory, { bigint: true });
      const now = new Date(atMs).toISOString();
      const record = {
        id,
        directoryName,
        rootDirectory: root.canonical,
        path: directory,
        rootDev: root.dev,
        rootIno: root.ino,
        ...identity(info),
        markerDev: "0",
        markerIno: "0",
        markerToken: randomBytes(32).toString("hex"),
        phase: "created",
        createdAt: now,
        updatedAt: now,
        workspaceId: null,
        sessionId: null,
        cleanupPolicy: { enabled: autoCleanupEnabled, idleHours },
        lastActivityAt: now,
        cleanupRetryAt: null
      };
      let markerReady = false;
      try {
        await this._assertTask(record);
        const handle = await fs.open(path2.join(directory, MARKER), "wx", 384);
        try {
          await handle.writeFile(`${JSON.stringify({ version: 1, id, token: record.markerToken })}
`);
          await handle.sync();
          const markerInfo = await handle.stat({ bigint: true });
          record.markerDev = String(markerInfo.dev);
          record.markerIno = String(markerInfo.ino);
        } finally {
          await handle.close();
        }
        markerReady = true;
        await this._assertOwned(record);
        const next = clone(this._state);
        next.tasks.push(record);
        await this._commit(next);
        return clone(record);
      } catch (error) {
        try {
          if (markerReady) {
            if (await this._assertOwned(record, true)) await fs.rm(record.path, { recursive: true, force: false });
          } else if (await this._assertTask(record, true)) {
            await fs.rmdir(record.path);
          }
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Create failed; owned-directory rollback also failed");
        }
        throw error;
      }
    });
  }
  updateRecord(id, patch) {
    return this._run(async () => {
      object(patch, "record patch");
      for (const key of Object.keys(patch)) {
        if (!["workspaceId", "sessionId", "phase", "lastError", "lastActivityAt", "cleanupRetryAt"].includes(key)) fail(`Record field is immutable or unknown: ${key}`, "ERR_SCRATCH_VALIDATION");
        if (patch[key] !== null && (typeof patch[key] !== "string" || patch[key].length > 16384)) fail(`Invalid ${key}`, "ERR_SCRATCH_VALIDATION");
        if (key === "phase" && (typeof patch[key] !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(patch[key]))) fail("Invalid phase", "ERR_SCRATCH_VALIDATION");
        if (key === "lastActivityAt" && !isoTime(patch[key])) fail("Invalid lastActivityAt", "ERR_SCRATCH_VALIDATION");
        if (key === "cleanupRetryAt" && patch[key] !== null && !isoTime(patch[key])) fail("Invalid cleanupRetryAt", "ERR_SCRATCH_VALIDATION");
      }
      const next = clone(this._state);
      const record = next.tasks.find((task) => task.id === id);
      if (!record) fail(`Unknown task: ${id}`, "ERR_SCRATCH_NOT_FOUND");
      Object.assign(record, patch, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      await this._commit(next);
      return clone(record);
    });
  }
  async _assertAuthorizedRemoval(record) {
    await this._assertStateDirectory();
    const authorization = this._state.deletionAuthorizations.find((entry) => entry.id === record.id);
    if (!authorization || authorization.binding !== deletionBinding(record)) fail("Missing persisted deletion authorization");
    if (!await this._assertTask(record, true)) return false;
    try {
      await fs.lstat(path2.join(record.path, MARKER));
    } catch (error) {
      if (!missing(error)) throw error;
      return this._assertTask(record);
    }
    return this._assertOwned(record);
  }
  async _removeAuthorizedDirectory(record, beforeRemove) {
    if (await this._assertAuthorizedRemoval(record)) {
      beforeRemove?.();
      await this._trash(record.path);
    }
  }
  removeDirectory(id, { beforeRemove, finalPhase = "files-deleted" } = {}) {
    return this._run(async () => {
      if (!["files-deleted", "auto-completing"].includes(finalPhase)) fail("Invalid deletion final phase", "ERR_SCRATCH_VALIDATION");
      let record = this._state.tasks.find((task) => task.id === id);
      if (!record) fail(`Unknown task: ${id}`, "ERR_SCRATCH_NOT_FOUND");
      await this._assertStateDirectory();
      let authorization = this._state.deletionAuthorizations.find((entry) => entry.id === id);
      if (!authorization && await this._assertOwned(record, true)) {
        const authorized = clone(this._state);
        authorized.deletionAuthorizations.push({ id, binding: deletionBinding(record) });
        await this._commit(authorized);
        record = this._state.tasks.find((task) => task.id === id);
        authorization = this._state.deletionAuthorizations.find((entry) => entry.id === id);
      }
      if (authorization) await this._removeAuthorizedDirectory(record, beforeRemove);
      const next = clone(this._state);
      const updated = next.tasks.find((task) => task.id === id);
      updated.phase = finalPhase;
      updated.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      next.deletionAuthorizations = next.deletionAuthorizations.filter((entry) => entry.id !== id);
      await this._commit(next);
      return clone(updated);
    });
  }
  forget(id) {
    return this._run(async () => {
      const record = this._state.tasks.find((task) => task.id === id);
      if (!record) return null;
      const next = clone(this._state);
      next.tasks = next.tasks.filter((task) => task.id !== id);
      next.deletionAuthorizations = next.deletionAuthorizations.filter((entry) => entry.id !== id);
      await this._commit(next);
      return clone(record);
    });
  }
};

// service.js
import path3 from "node:path";
import * as fs2 from "node:fs/promises";
var AUTOMATIC = /* @__PURE__ */ Symbol("automatic-cleanup");
var AUTO_PHASES = /* @__PURE__ */ new Set(["active", "auto-error", "auto-completing"]);
var SAFE_PHASES = /* @__PURE__ */ new Set(["created", "active"]);
var time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
var issue = (message) => Object.assign(new Error(message), { code: "SCRATCH_BUSY" });
var ScratchService = class {
  constructor(ctx, store, { clock = { now: () => Date.now() }, restoreActivity: restoreActivity2, activityPersistMs = 6e4, retryMs = 6e5 } = {}) {
    this.ctx = ctx;
    this.store = store;
    this.clock = clock;
    this.restoreActivity = restoreActivity2;
    this.activityPersistMs = activityPersistMs;
    this.retryMs = retryMs;
    this.queue = Promise.resolve();
    this.blocked = /* @__PURE__ */ new Set();
    this.blockedPaths = [];
    this.apiRequests = 0;
    this.apiLocked = false;
    this.apiDrainers = /* @__PURE__ */ new Set();
    this.records = /* @__PURE__ */ new Map();
    this.latestActivity = /* @__PURE__ */ new Map();
    this.persistedActivity = /* @__PURE__ */ new Map();
    this.titleCache = /* @__PURE__ */ new Map();
    this.busyTasks = /* @__PURE__ */ new Set();
    this.restoreFailures = /* @__PURE__ */ new Map();
    this.closed = false;
    this.sweepPromise = null;
  }
  serial(fn) {
    if (this.closed) return Promise.reject(new Error("Temporary workspace service is closed"));
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {
    });
    return p;
  }
  async drain() {
    for (; ; ) {
      const p = this.queue;
      await p;
      if (p === this.queue) break;
    }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.closePromise = (async () => {
      await this.drain();
      await this._flushActivities();
    })();
    return this.closePromise;
  }
  async _update(id, patch) {
    const record = await this.store.updateRecord(id, patch);
    this.records.set(id, record);
    return record;
  }
  async init() {
    await this.store.init();
    for (const r of await this.store.list()) {
      this.records.set(r.id, r);
      this.latestActivity.set(r.id, time(r.lastActivityAt));
      this.persistedActivity.set(r.id, time(r.lastActivityAt));
      if (!SAFE_PHASES.has(r.phase) && r.sessionId) this.blocked.add(r.sessionId);
      if (r.cleanupPolicy.enabled && AUTO_PHASES.has(r.phase)) {
        try {
          const recovered = this.restoreActivity ? await this.restoreActivity(r) : this.clock.now();
          if (!Number.isFinite(recovered)) throw new Error("Activity recovery did not return a timestamp");
          const latest = Math.max(time(r.lastActivityAt), recovered);
          this.latestActivity.set(r.id, latest);
          if (latest > time(r.lastActivityAt)) {
            await this._update(r.id, { lastActivityAt: new Date(latest).toISOString() });
            this.persistedActivity.set(r.id, latest);
          }
        } catch (error) {
          this.restoreFailures.set(r.id, String(error.message || error));
        }
      }
    }
    await this.refreshBlockedPaths();
    return this;
  }
  contains(root, value) {
    if (typeof value !== "string" || !path3.isAbsolute(value)) return false;
    const rel = path3.relative(root, value);
    return rel === "" || !rel.startsWith(`..${path3.sep}`) && rel !== ".." && !path3.isAbsolute(rel);
  }
  _belongs(record, sessionId) {
    if (record.sessionId === sessionId) return true;
    const s = this.ctx.sessions.get(sessionId);
    if (!s) return false;
    return this.contains(record.path, s.header?.cwd) || this.contains(record.path, this.ctx.workingDirectory.get(s));
  }
  noteActivity(sessionId, atMs = this.clock.now()) {
    if (this.closed || !Number.isFinite(atMs)) return Promise.resolve();
    let due = false;
    try {
      for (const r of this.records.values()) {
        if (r.phase === "completed" || !this._belongs(r, sessionId)) continue;
        const latest = Math.max(this.latestActivity.get(r.id) || 0, atMs);
        this.latestActivity.set(r.id, latest);
        if (latest - (this.persistedActivity.get(r.id) || 0) >= this.activityPersistMs) due = true;
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return due ? this.serial(() => this._flushActivities()) : Promise.resolve();
  }
  async _flushActivities() {
    for (const [id, latest] of this.latestActivity) {
      if (latest > (this.persistedActivity.get(id) || 0)) {
        await this._update(id, { lastActivityAt: new Date(latest).toISOString() });
        this.persistedActivity.set(id, latest);
      }
    }
  }
  async status() {
    return { settings: await this.store.getSettings(), tasks: (await this.store.list()).map((r) => ({
      id: r.id,
      path: r.path,
      workspaceId: r.workspaceId,
      sessionId: r.sessionId,
      phase: r.phase,
      lastError: r.lastError,
      cleanupPolicy: r.cleanupPolicy,
      lastActivityAt: new Date(Math.max(time(r.lastActivityAt), this.latestActivity.get(r.id) || 0)).toISOString(),
      cleanupRetryAt: r.cleanupRetryAt || null,
      cleanupIssue: this.restoreFailures.get(r.id) || r.lastError || null
    })) };
  }
  configure(patch, { user = false, autoCleanupConsent = false } = {}) {
    if (!user && ["confirmDelete", "autoCleanupEnabled", "idleHours"].some((key) => Object.hasOwn(patch, key))) return Promise.reject(new Error("\u5220\u9664\u786E\u8BA4\u548C\u81EA\u52A8\u6E05\u7406\u8BBE\u7F6E\u53EA\u80FD\u7531\u7528\u6237\u5728\u8BBE\u7F6E\u9875\u4FEE\u6539\u3002"));
    return this.serial(async () => {
      const old = await this.store.getSettings();
      const next = { ...old, ...patch };
      if (next.autoCleanupEnabled && (!old.autoCleanupEnabled || next.idleHours !== old.idleHours) && autoCleanupConsent !== true) throw new Error("\u542F\u7528\u81EA\u52A8\u6E05\u7406\u6216\u4FEE\u6539\u5DF2\u542F\u7528\u7684\u65F6\u957F\u524D\uFF0C\u9700\u8981\u7528\u6237\u786E\u8BA4\u6C38\u4E45\u5220\u9664\u6388\u6743\u3002");
      return this.store.saveSettings(patch);
    });
  }
  /** Measured size of one task folder, bounded so a huge tree cannot stall the UI.
   * Symlinks are counted as links and never followed. */
  async usage(id, { budgetMs = 2500, maxEntries = 2e5 } = {}) {
    const r = await this.store.get(id);
    if (!r) return null;
    const started = Date.now();
    let bytes = 0, files = 0, dirs = 0, truncated = false;
    const stack = [r.path];
    while (stack.length) {
      if (Date.now() - started > budgetMs || files + dirs > maxEntries) {
        truncated = true;
        break;
      }
      const current = stack.pop();
      let entries;
      try {
        entries = await fs2.readdir(current, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const entry of entries) {
        const target = path3.join(current, entry.name);
        if (entry.isSymbolicLink()) {
          files++;
          continue;
        }
        if (entry.isDirectory()) {
          dirs++;
          stack.push(target);
          continue;
        }
        try {
          const info = await fs2.lstat(target);
          bytes += info.size;
          files++;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
    return { bytes, files, dirs, truncated };
  }
  /** Sessions that belong to one temporary workspace, with their titles.
   * Membership comes from the workspace registration plus any session whose
   * directory sits inside the folder (extra sessions created by hand). */
  async sessionsOf(id) {
    const r = await this.store.get(id);
    if (!r) return [];
    const ids = [];
    const workspace = r.workspaceId ? this.ctx.workspaceRegistry.get(r.workspaceId) : void 0;
    for (const sessionId of workspace?.sessionIds || []) ids.push(sessionId);
    if (r.sessionId) ids.push(r.sessionId);
    for (const s of this.ctx.sessions.list()) if (this.contains(r.path, this.ctx.workingDirectory.get(s)) || this.contains(r.path, s.header?.cwd)) ids.push(s.id);
    const unique = [...new Set(ids)];
    const result = [];
    for (const sessionId of unique) {
      if (!(workspace?.sessionIds || []).includes(sessionId) && sessionId !== r.sessionId && !this.ctx.sessions.get(sessionId)) continue;
      result.push({ sessionId, title: await this._titleOf(sessionId), running: this.ctx.sessions.get(sessionId) ? this.blocked.has(sessionId) : false });
    }
    return result;
  }
  async _titleOf(sessionId) {
    const cached = this.titleCache.get(sessionId);
    if (cached && this.clock.now() - cached.at < 3e4) return cached.title;
    const newest = (events) => {
      let title2 = null;
      for (const event of events) if (event.type === "session/title") title2 = event.data?.title ?? event.data?.text ?? title2;
      return typeof title2 === "string" && title2.trim() ? title2.trim() : null;
    };
    let title = null;
    const live = this.ctx.sessions.get(sessionId);
    if (live) title = newest(live.snapshotEvents());
    else {
      const handle = await this.ctx.sessionPersistence.open(sessionId, "read");
      try {
        title = newest((await handle.read()).events);
      } finally {
        await handle.close();
      }
    }
    this.titleCache.set(sessionId, { title, at: this.clock.now() });
    return title;
  }
  /** Why this task could not be cleaned up right now (or that it is idle).
   * Reuses the same signals the cleanup path uses, so the list and the gate agree. */
  async taskState(id) {
    const r = await this.store.get(id);
    if (!r) return { state: "missing" };
    const ids = new Set(r.sessionId ? [r.sessionId] : []);
    for (const s of this.ctx.sessions.list()) if (this._belongs(r, s.id)) ids.add(s.id);
    const terminals = this.ctx.get?.("terminalController");
    if (!terminals) return { state: "unknown", reason: "\u65E0\u6CD5\u68C0\u67E5\u7EC8\u7AEF\u5360\u7528" };
    let terminal = false;
    const known = /* @__PURE__ */ new Set([...this.ctx.sessions.list().map((s) => s.id), ...ids]);
    for (const sid of known) if (terminals.list(sid).some((info) => ids.has(sid) || this.contains(r.path, info.cwd))) terminal = true;
    if (terminal) return { state: "terminal" };
    for (const sessionId of ids) {
      const busy = await this.ctx.waterfall("workspace/session-activity", { sessionId }, async () => []);
      if (busy.length) return { state: "running" };
    }
    return { state: "idle" };
  }
  /** Reveal the task folder in the Host desktop file manager. The session
   * controller owns path verification and the platform-specific opener. */
  async reveal(id) {
    const r = await this.store.get(id);
    if (!r) throw new Error("\u4E34\u65F6\u4EFB\u52A1\u4E0D\u5B58\u5728\u3002");
    await fs2.stat(r.path);
    const signal = AbortSignal.timeout(15e3);
    try {
      await this.ctx.sessionController.openWorkspacePath({ path: r.path, action: "reveal" }, signal);
    } catch (error) {
      if (error?.name === "TimeoutError") throw new Error("\u6253\u5F00\u76EE\u5F55\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
      throw error;
    }
    return { revealed: true };
  }
  create() {
    return this.serial(async () => {
      let r = await this.store.createDirectory({ atMs: this.clock.now() });
      this.records.set(r.id, r);
      this.latestActivity.set(r.id, time(r.lastActivityAt));
      this.persistedActivity.set(r.id, time(r.lastActivityAt));
      try {
        const workspace = await this.ctx.workspaceRegistry.create(r.path, `\u4E34\u65F6 \xB7 ${r.directoryName}`);
        r = await this._update(r.id, { workspaceId: workspace.id });
        const value = await this.ctx.sessionController.create({ workspaceId: workspace.id });
        r = await this._update(r.id, { sessionId: value.sessionId, phase: "active", lastError: null });
        return { id: r.id, path: r.path, workspaceId: r.workspaceId, sessionId: r.sessionId };
      } catch (error) {
        await this._update(r.id, { phase: "error", lastError: String(error.message || error) });
        throw new Error(`\u521B\u5EFA\u672A\u5B8C\u6210\uFF0C\u76EE\u5F55\u5DF2\u4FDD\u7559\uFF0C\u53EF\u4ECE\u8BBE\u7F6E\u9875\u91CD\u8BD5\u6E05\u7406\uFF1A${error.message || error}`);
      }
    });
  }
  isBlocked(agent) {
    if (this.blocked.has(agent.id)) return true;
    const s = this.ctx.sessions.get(agent.id);
    if (!s) return false;
    return this.blockedPaths.some((p) => this.contains(p, s.header?.cwd) || this.contains(p, this.ctx.workingDirectory.get(s)));
  }
  /** Which temporary task owns one session: its own recorded session first, then
   * any session whose directory sits inside a registered task folder. This lets
   * an extra hand-made session inside a temporary workspace offer the same
   * "complete" action instead of silently showing nothing. */
  async taskForSession(sessionId) {
    if (typeof sessionId !== "string") return null;
    const records = await this.store.list();
    const view = (r) => ({ id: r.id, path: r.path, workspaceId: r.workspaceId, sessionId: r.sessionId, phase: r.phase, cleanupPolicy: r.cleanupPolicy });
    const direct = records.find((r) => r.sessionId === sessionId);
    if (direct) return view(direct);
    const s = this.ctx.sessions.get(sessionId);
    if (!s) return null;
    const cwds = [s.header?.cwd, this.ctx.workingDirectory.get(s)].filter((value) => typeof value === "string" && value);
    const owner = records.find((r) => cwds.some((cwd) => this.contains(r.path, cwd)));
    return owner ? view(owner) : null;
  }
  async refreshBlockedPaths() {
    const records = await this.store.list();
    this.blocked = new Set(records.filter((r) => !SAFE_PHASES.has(r.phase)).map((r) => r.sessionId).filter(Boolean));
    this.blockedPaths = records.filter((r) => !SAFE_PHASES.has(r.phase)).map((r) => r.path);
  }
  async requestGate(_req, res, next) {
    if (this.apiLocked) {
      res.writeHead(409, { "content-type": "text/plain; charset=utf-8" });
      res.end("Temporary workspace cleanup in progress; retry shortly.");
      return;
    }
    this.apiRequests++;
    try {
      return await next();
    } finally {
      this.apiRequests--;
      if (!this.apiRequests) for (const fn of [...this.apiDrainers]) fn();
    }
  }
  async lockApi() {
    this.apiLocked = true;
    if (!this.apiRequests) return;
    try {
      await new Promise((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          this.apiDrainers.delete(done);
          resolve();
        };
        const timer = setTimeout(() => {
          this.apiDrainers.delete(done);
          reject(issue("\u5176\u4ED6\u754C\u9762\u64CD\u4F5C\u5C1A\u672A\u7ED3\u675F\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u5B8C\u6210\u3002"));
        }, 5e3);
        this.apiDrainers.add(done);
      });
    } catch (error) {
      this.apiLocked = false;
      throw error;
    }
  }
  _deadline(record) {
    return Math.max(time(record.lastActivityAt), this.latestActivity.get(record.id) || 0) + record.cleanupPolicy.idleHours * 36e5;
  }
  async _restore(record) {
    if (!this.restoreActivity) {
      if (this.restoreFailures.has(record.id)) throw new Error(this.restoreFailures.get(record.id));
      return;
    }
    const value = await this.restoreActivity(record);
    if (!Number.isFinite(value)) throw new Error("Activity recovery did not return a timestamp");
    this.restoreFailures.delete(record.id);
    this.latestActivity.set(record.id, Math.max(this.latestActivity.get(record.id) || 0, value));
  }
  sweep() {
    if (this.closed) return Promise.reject(new Error("Temporary workspace service is closed"));
    if (this.sweepPromise) return this.sweepPromise;
    const pending = this.serial(async () => {
      const result = { completed: [], skipped: [], failed: [] };
      if (this.closed) return result;
      await this._flushActivities();
      for (const r of await this.store.list()) {
        if (this.closed) break;
        if (!r.cleanupPolicy.enabled || !AUTO_PHASES.has(r.phase)) continue;
        if (time(r.cleanupRetryAt) > this.clock.now()) continue;
        if (r.phase === "active" && !this.busyTasks.has(r.id) && this.clock.now() < this._deadline(r)) continue;
        try {
          const value = await this._complete(r.id, { automatic: AUTOMATIC });
          result[value.completed ? "completed" : "skipped"].push(r.id);
        } catch (error) {
          result.failed.push({ id: r.id, error: String(error.message || error) });
        }
      }
      await this._flushActivities();
      return result;
    });
    this.sweepPromise = pending;
    pending.finally(() => {
      if (this.sweepPromise === pending) this.sweepPromise = null;
    }).catch(() => {
    });
    return pending;
  }
  complete(id, { user = false } = {}) {
    if (!user) return Promise.reject(new Error("\u5B8C\u6210\u5E76\u5220\u9664\u53EA\u80FD\u7531\u7528\u6237\u70B9\u51FB\u6309\u94AE\u6267\u884C\u3002"));
    return this.serial(() => this._complete(id, { user: true }));
  }
  async _complete(id, { user = false, automatic } = {}) {
    const auto = automatic === AUTOMATIC;
    if (!auto && !user) throw new Error("\u5B8C\u6210\u5E76\u5220\u9664\u53EA\u80FD\u7531\u7528\u6237\u70B9\u51FB\u6309\u94AE\u6267\u884C\u3002");
    const r = await this.store.get(id);
    if (!r) throw new Error("\u4E34\u65F6\u4EFB\u52A1\u4E0D\u5B58\u5728\u3002");
    if (r.phase === "completed") return { completed: true, sessionId: r.sessionId };
    if (auto && (!r.cleanupPolicy.enabled || !AUTO_PHASES.has(r.phase))) throw new Error("Task has no automatic cleanup authorization");
    let committed = false, removed = false, archived = false;
    const archivedSiblings = [];
    const checkOpen = () => {
      if (this.closed) throw Object.assign(new Error("\u4E34\u65F6\u5DE5\u4F5C\u533A\u63D2\u4EF6\u6B63\u5728\u5173\u95ED\uFF0C\u5DF2\u53D6\u6D88\u5C1A\u672A\u5F00\u59CB\u7684\u6E05\u7406\u3002"), { code: "SCRATCH_CLOSED" });
    };
    const skip = async (message) => {
      this.latestActivity.set(id, Math.max(this.latestActivity.get(id) || 0, this.clock.now()));
      this.busyTasks.add(id);
      if (r.phase === "active") await this._update(id, { phase: "active", lastError: message, cleanupRetryAt: null });
      else await this._update(id, { phase: r.phase, lastError: message, cleanupRetryAt: new Date(this.clock.now() + this.retryMs).toISOString() });
      if (archived) await this.ctx.workspaceRegistry.unarchiveSession(r.sessionId);
      await this.refreshBlockedPaths();
      return { completed: false, skipped: true, reason: message };
    };
    try {
      checkOpen();
      await this.lockApi();
      const headers = await this.ctx.sessionPersistence.list();
      const siblings = /* @__PURE__ */ new Set();
      for (const { header } of headers) {
        if (header.id === r.sessionId || header.origin === "subagent") continue;
        if (this.contains(r.path, header.cwd)) siblings.add(header.id);
      }
      for (const s of this.ctx.sessions.list()) {
        if (s.id === r.sessionId || s.header.origin === "subagent") continue;
        if (this.contains(r.path, this.ctx.workingDirectory.get(s)) || this.contains(r.path, s.header?.cwd)) siblings.add(s.id);
      }
      for (const w of this.ctx.workspaceRegistry.list()) if (w.id !== r.workspaceId && this.contains(r.path, w.path)) throw issue("\u76EE\u5F55\u4E2D\u6709\u5176\u4ED6\u5DF2\u767B\u8BB0\u5DE5\u4F5C\u533A\uFF0C\u62D2\u7EDD\u5220\u9664\u3002");
      const activity = async () => {
        const ids = new Set(r.sessionId ? [r.sessionId] : []);
        for (const id2 of siblings) ids.add(id2);
        for (const s of this.ctx.sessions.list()) if (this._belongs(r, s.id)) ids.add(s.id);
        const terminals = this.ctx.get?.("terminalController");
        if (!terminals) throw issue("\u65E0\u6CD5\u68C0\u67E5\u7EC8\u7AEF\u5360\u7528\uFF0C\u6682\u4E0D\u6E05\u7406\u3002");
        const allIds = /* @__PURE__ */ new Set([...headers.map((x) => x.header.id), ...this.ctx.sessions.list().map((s) => s.id), ...ids]);
        for (const sid of allIds) if (terminals.list(sid).some((info) => ids.has(sid) || this.contains(r.path, info.cwd))) throw issue("\u8BF7\u5148\u5173\u95ED\u8FD9\u4E2A\u4E34\u65F6\u4EFB\u52A1\u7684\u5168\u90E8\u7EC8\u7AEF\uFF0C\u518D\u70B9\u51FB\u5B8C\u6210\u3002");
        for (const sessionId of ids) if ((await this.ctx.waterfall("workspace/session-activity", { sessionId }, async () => [])).length) throw issue("\u4EFB\u52A1\u3001\u5B50\u4EFB\u52A1\u6216\u5B9A\u65F6\u5DE5\u4F5C\u4ECD\u5728\u8FD0\u884C\uFF0C\u8BF7\u5148\u505C\u6B62\u540E\u518D\u70B9\u51FB\u5B8C\u6210\u3002");
      };
      await activity();
      if (auto) {
        if (this.busyTasks.delete(id)) {
          this.latestActivity.set(id, Math.max(this.latestActivity.get(id) || 0, this.clock.now()));
          return { completed: false, skipped: true, reason: "Activity just ended" };
        }
        await this._restore(r);
        if (this.clock.now() < this._deadline(r)) return { completed: false, skipped: true, reason: "Not idle long enough" };
      }
      if (r.sessionId) this.blocked.add(r.sessionId);
      this.blockedPaths.push(r.path);
      for (const sibling of siblings) this.blocked.add(sibling);
      await activity();
      const checkDeadline = () => {
        checkOpen();
        if (auto && this.clock.now() < this._deadline(r)) throw issue("\u68C0\u6D4B\u5230\u65B0\u7684\u4EFB\u52A1\u6D3B\u52A8\uFF0C\u5DF2\u8DF3\u8FC7\u81EA\u52A8\u6E05\u7406\u3002");
      };
      checkDeadline();
      committed = true;
      await this._update(id, { phase: auto ? "auto-completing" : "completing", lastError: null, cleanupRetryAt: null });
      if (r.sessionId) {
        await this.ctx.workspaceRegistry.archiveSession(r.sessionId);
        archived = true;
      }
      for (const sibling of siblings) {
        await this.ctx.workspaceRegistry.archiveSession(sibling);
        archivedSiblings.push(sibling);
      }
      await activity();
      checkDeadline();
      await this.store.removeDirectory(id, { beforeRemove: checkDeadline, finalPhase: auto ? "auto-completing" : "files-deleted" });
      removed = true;
      if (r.workspaceId) {
        const w = this.ctx.workspaceRegistry.get(r.workspaceId);
        if (w && w.path !== r.path) throw new Error("\u5DE5\u4F5C\u533A\u767B\u8BB0\u8DEF\u5F84\u6539\u53D8\uFF0C\u62D2\u7EDD\u79FB\u9664\u767B\u8BB0\u3002");
        await this.ctx.workspaceRegistry.delete(r.workspaceId);
      }
      await this._update(id, { phase: "completed", lastError: null, cleanupRetryAt: null });
      this.busyTasks.delete(id);
      return { completed: true, sessionId: r.sessionId };
    } catch (error) {
      if (error.code === "SCRATCH_CLOSED" && !removed) {
        if (committed) await this._update(id, { phase: r.phase, lastError: r.lastError || null, cleanupRetryAt: r.cleanupRetryAt || null });
        if (archived && SAFE_PHASES.has(r.phase)) await this.ctx.workspaceRegistry.unarchiveSession(r.sessionId);
        for (const sibling of archivedSiblings) await this.ctx.workspaceRegistry.unarchiveSession(sibling);
        await this.refreshBlockedPaths();
        if (auto) return { completed: false, skipped: true, reason: error.message };
        throw error;
      }
      if (auto && error.code === "SCRATCH_BUSY" && !removed) return await skip(String(error.message || error));
      if (auto) {
        this.restoreFailures.delete(id);
        await this._update(id, { phase: committed ? "auto-error" : r.phase, lastError: String(error.message || error), cleanupRetryAt: new Date(this.clock.now() + this.retryMs).toISOString() });
      } else if (committed) await this._update(id, { phase: "error", lastError: String(error.message || error) });
      await this.refreshBlockedPaths();
      if (auto) throw error;
      if (!committed) throw error;
      throw new Error(`\u6E05\u7406\u672A\u5B8C\u6210\uFF0C\u53EF\u518D\u6B21\u70B9\u51FB\u5B8C\u6210\u91CD\u8BD5\u3002\u4E3A\u907F\u514D\u7EE7\u7EED\u5199\u5165\uFF0C\u4EFB\u52A1\u6682\u65F6\u51BB\u7ED3\uFF1A${error.message || error}`);
    } finally {
      this.apiLocked = false;
    }
  }
};

// activity.js
import path4 from "node:path";
var ACTIVITY_EVENTS = /* @__PURE__ */ new Set(["user/message", "turn/start", "turn/end", "tool/call", "tool/result", "assistant/message"]);
var contains = (root, value) => {
  if (!value) return false;
  const rel = path4.relative(root, value);
  return rel === "" || !rel.startsWith(`..${path4.sep}`) && rel !== ".." && !path4.isAbsolute(rel);
};
async function restoreActivity(ctx, record) {
  let newest = Date.parse(record.lastActivityAt || record.createdAt);
  const snapshots = await ctx.sessionPersistence.list();
  const ids = /* @__PURE__ */ new Map();
  for (const snapshot of snapshots) if (snapshot.header.id === record.sessionId || contains(record.path, snapshot.header.cwd)) ids.set(snapshot.header.id, snapshot);
  if (record.sessionId && !ids.has(record.sessionId)) throw new Error("Cannot verify stored temporary session activity");
  for (const session of ctx.sessions.list()) {
    const cwd = ctx.workingDirectory.get(session);
    if (session.id !== record.sessionId && !contains(record.path, cwd) && !contains(record.path, session.header.cwd)) continue;
    ids.set(session.id, ids.get(session.id) || { header: session.header });
  }
  for (const [id, snapshot] of ids) {
    const live = ctx.sessions.get(id);
    if (live) {
      const events = live.snapshotEvents();
      for (let i = events.length - 1; i >= 0; i--) if (ACTIVITY_EVENTS.has(events[i].type)) {
        newest = Math.max(newest, events[i].time);
        break;
      }
      continue;
    }
    const handle = await ctx.sessionPersistence.open(id, "read");
    try {
      if (Number.isSafeInteger(snapshot.eventCount) && snapshot.eventCount >= 0) {
        let end = snapshot.eventCount;
        while (end > 0) {
          const start = Math.max(0, end - 128);
          const { events } = await handle.read(start, end - start);
          const event = [...events].reverse().find((e) => ACTIVITY_EVENTS.has(e.type));
          if (event) {
            newest = Math.max(newest, event.time);
            break;
          }
          end = start;
        }
      } else {
        const { events } = await handle.read();
        const event = [...events].reverse().find((e) => ACTIVITY_EVENTS.has(e.type));
        if (event) newest = Math.max(newest, event.time);
      }
    } finally {
      await handle.close();
    }
  }
  if (!Number.isFinite(newest)) throw new Error("Cannot verify temporary activity timestamp");
  return newest;
}

// user-api.js
function createUserHandler(service) {
  return async function handle(method, payload, signal, peer) {
    try {
      if (peer?.principal?.kind !== "owner" || peer.interactions !== "answer") throw new Error("\u6B64\u64CD\u4F5C\u4EC5\u5BF9\u5DF2\u8BA4\u8BC1\u7684\u4EA4\u4E92\u7528\u6237\u5F00\u653E\u3002");
      if (signal.aborted) throw new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88\u3002");
      const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      let result;
      if (method === "status") result = await service.status();
      else if (method === "resolve") {
        if (typeof value.sessionId !== "string") throw new Error("\u7F3A\u5C11\u4F1A\u8BDD\u6807\u8BC6\u3002");
        result = await service.taskForSession(value.sessionId);
      } else if (method === "usage") {
        if (typeof value.id !== "string") throw new Error("\u7F3A\u5C11\u4E34\u65F6\u4EFB\u52A1\u6807\u8BC6\u3002");
        result = await service.usage(value.id);
      } else if (method === "sessions") {
        if (typeof value.id !== "string") throw new Error("\u7F3A\u5C11\u4E34\u65F6\u4EFB\u52A1\u6807\u8BC6\u3002");
        result = await service.sessionsOf(value.id);
      } else if (method === "state") {
        if (typeof value.id !== "string") throw new Error("\u7F3A\u5C11\u4E34\u65F6\u4EFB\u52A1\u6807\u8BC6\u3002");
        result = await service.taskState(value.id);
      } else if (method === "reveal") {
        if (typeof value.id !== "string") throw new Error("\u7F3A\u5C11\u4E34\u65F6\u4EFB\u52A1\u6807\u8BC6\u3002");
        result = await service.reveal(value.id);
      } else if (method === "configure") {
        const { autoCleanupConsent, ...patch } = value;
        result = await service.configure(patch, { user: true, autoCleanupConsent: autoCleanupConsent === true });
      } else if (method === "create") result = await service.create();
      else if (method === "complete") {
        if (typeof value.id !== "string") throw new Error("\u7F3A\u5C11\u4E34\u65F6\u4EFB\u52A1\u6807\u8BC6\u3002");
        result = await service.complete(value.id, { user: true });
      } else throw new Error("\u672A\u77E5\u4E34\u65F6\u5DE5\u4F5C\u533A\u64CD\u4F5C\u3002");
      return { ok: true, value: result };
    } catch (error) {
      return { ok: false, error: { code: "scratch-workspace/error", message: String(error.message || error), details: {} } };
    }
  };
}

// index.js
var inject = ["connection", "webServer", "workspaceRegistry", "sessionController", "sessionPersistence", "sessions", "workingDirectory", "tools", "terminalController", "timer"];
async function apply(ctx) {
  const identity2 = process.env.DSH_PROFILE_DIR || process.env.DSH_PROFILE || "default";
  const hash = createHash("sha256").update(identity2).digest("hex").slice(0, 12);
  const store = new ScratchStore({ stateDir: path5.join(os3.homedir(), ".local", "share", "deepseek-harness", "scratch-workspace", hash) });
  const service = await new ScratchService(ctx, store, { restoreActivity: (record) => restoreActivity(ctx, record) }).init();
  await service.refreshBlockedPaths();
  ctx.effect(() => ctx.provide("scratchWorkspace", service), "scratch-workspace: service");
  ctx.on("connection/request", (req, res, next) => service.requestGate(req, res, next));
  const recordActivity = (id, time2) => {
    service.noteActivity(id, time2).catch((error) => ctx.logger.warn(`scratch activity: ${error.message}`));
  };
  ctx.on("session/event", (session, event) => {
    if (ACTIVITY_EVENTS.has(event.type)) recordActivity(session.id, event.time);
  });
  ctx.on("agent/status", ({ agent, status }) => {
    if (status === "running" || status === "idle") recordActivity(agent.id, Date.now());
  });
  const sweep = () => service.sweep().catch((error) => ctx.logger.warn(`scratch cleanup: ${error.message}`));
  const stopSweep = ctx.interval(sweep, 6e4);
  const firstSweep = ctx.timeout(sweep, 1e3);
  ctx.effect(() => async () => {
    stopSweep();
    firstSweep();
    await service.close();
  }, "scratch-workspace: scheduler lifetime");
  ctx.on("agent/pre-step", async ({ agent }, next) => service.isBlocked(agent) ? { kind: "reject" } : next());
  ctx.effect(() => ctx.tools.guard((exec) => exec.agent && service.isBlocked(exec.agent) ? "\u4E34\u65F6\u5DE5\u4F5C\u533A\u6B63\u5728\u6E05\u7406\u6216\u5DF2\u5B8C\u6210\uFF0C\u7981\u6B62\u7EE7\u7EED\u6267\u884C\u5DE5\u5177\u3002" : void 0), "scratch-workspace: cleanup fence");
  const handle = createUserHandler(service);
  let channelRegistered = false;
  try {
    ctx.effect(() => ctx.connection.rpc.handle("/scratch-workspace", handle), "scratch-workspace: rpc channel");
    channelRegistered = true;
  } catch (error) {
    ctx.logger.warn(`scratch-workspace: RPC channel unavailable, falling back to HTTP route: ${error.message}`);
  }
  if (!channelRegistered) {
    const webServer = ctx.webServer;
    ctx.effect(() => webServer.register({ kind: "prefix", path: "/scratch-workspace", handler: async (req, res) => {
      const admission = ctx.connection.admit(req);
      if ("rejection" in admission) {
        res.writeHead(admission.rejection);
        res.end();
        return;
      }
      if (req.method !== "POST" || !String(req.headers["content-type"] || "").startsWith("application/json")) {
        res.writeHead(415);
        res.end();
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const expected = new URL(req.url, "http://localhost").pathname.slice("/scratch-workspace/".length);
      if (body?.type !== "client-request" || typeof body.rpcId !== "string" || body.method !== expected) {
        res.writeHead(400);
        res.end();
        return;
      }
      const result = await handle(body.method, body.payload, new AbortController().signal, admission.peer);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify({ type: "server-response", rpcId: body.rpcId, result }));
    } }), "scratch-workspace: authenticated user route (fallback)");
  }
  ctx.effect(() => ctx.tools.register({
    name: "scratch_workspace",
    description: "Inspect temporary workspace settings and task identifiers, configure the root directory/prefix, or create an empty temporary workspace and session. Creation does not switch this agent\u2019s directory. Completion/deletion and changing deletion confirmation are user-only UI actions.",
    deferLoading: true,
    parameters: { type: "object", properties: { action: { type: "string", enum: ["status", "configure", "create"] }, rootDirectory: { type: "string", description: "For configure: absolute path or ~/ path; empty clears configuration." }, directoryPrefix: { type: "string", description: "For configure: one safe folder-name prefix, 1\u201340 letters, digits, underscores or hyphens." } }, required: ["action"], additionalProperties: false },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    execute: async (args) => {
      if (args.action === "status") return service.status();
      if (args.action === "create") return service.create();
      if (args.action === "configure") {
        const patch = {};
        if (args.rootDirectory !== void 0) patch.rootDirectory = args.rootDirectory;
        if (args.directoryPrefix !== void 0) patch.directoryPrefix = args.directoryPrefix;
        return service.configure(patch);
      }
      throw new Error("\u672A\u77E5\u64CD\u4F5C\u3002");
    }
  }), "scratch-workspace: agent operations");
}
export {
  apply,
  inject
};
