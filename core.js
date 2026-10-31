import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { moveToTrash } from './trash.js';

const DEFAULT_SETTINGS = Object.freeze({ rootDirectory: '', directoryPrefix: 'task', confirmDelete: true, autoCleanupEnabled: false, idleHours: 24 });
const isoTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function cleanupPolicy(value) {
  object(value, 'cleanupPolicy');
  if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.idleHours) || value.idleHours < 1 || value.idleHours > 8760 || Object.keys(value).some(key => !['enabled','idleHours'].includes(key))) fail('Invalid cleanupPolicy', 'ERR_SCRATCH_VALIDATION');
  return { enabled: value.enabled, idleHours: value.idleHours };
}
const MARKER = '.dsh-scratch-owner.json';
const PREFIX = /^[\p{Script=Han}A-Za-z0-9_-]{1,40}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const clone = value => structuredClone(value);
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const sameIdentity = (stat, dev, ino) => String(stat.dev) === dev && String(stat.ino) === ino;
const missing = error => error?.code === 'ENOENT';
function fail(message, code = 'ERR_SCRATCH_UNSAFE') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function absolute(value, name) {
  if (typeof value !== 'string' || !value || value.includes('\0')) fail(`${name} must be an absolute path`, 'ERR_SCRATCH_VALIDATION');
  const expanded = value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
  if (!path.isAbsolute(expanded)) fail(`${name} must be an absolute path`, 'ERR_SCRATCH_VALIDATION');
  return path.resolve(expanded);
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`, 'ERR_SCRATCH_VALIDATION');
}
function settingsPatch(patch, current) {
  object(patch, 'settings patch');
  for (const key of Object.keys(patch)) if (!Object.hasOwn(DEFAULT_SETTINGS, key)) fail(`Unknown setting: ${key}`, 'ERR_SCRATCH_VALIDATION');
  const next = { ...current, ...patch };
  if (typeof next.rootDirectory !== 'string') fail('rootDirectory must be a string', 'ERR_SCRATCH_VALIDATION');
  if (next.rootDirectory !== '') next.rootDirectory = absolute(next.rootDirectory, 'rootDirectory');
  if (typeof next.directoryPrefix !== 'string' || !PREFIX.test(next.directoryPrefix) || [...next.directoryPrefix].length > 40) fail('directoryPrefix must contain 1–40 letters, digits, Han characters, _ or -', 'ERR_SCRATCH_VALIDATION');
  if (typeof next.confirmDelete !== 'boolean') fail('confirmDelete must be a boolean', 'ERR_SCRATCH_VALIDATION');
  if (typeof next.autoCleanupEnabled !== 'boolean') fail('autoCleanupEnabled must be a boolean', 'ERR_SCRATCH_VALIDATION');
  if (!Number.isInteger(next.idleHours) || next.idleHours < 1 || next.idleHours > 8760) fail('idleHours must be an integer from 1 to 8760', 'ERR_SCRATCH_VALIDATION');
  return next;
}
// Bound to immutable ownership data rather than host-managed phase/metadata.
// Persisted before the first recursive rm so a partially removed marker cannot
// make a previously authorized deletion permanently unretryable after restart.
function deletionBinding(record) {
  return JSON.stringify(['id', 'rootDirectory', 'path', 'directoryName', 'rootDev', 'rootIno', 'dev', 'ino', 'markerDev', 'markerIno', 'markerToken'].map(key => record[key]));
}
function recordShape(record) {
  object(record, 'record');
  if (!UUID.test(record.id)) fail('Invalid record id');
  if (absolute(record.rootDirectory, 'record root') !== record.rootDirectory || absolute(record.path, 'record path') !== record.path) fail('Record paths must be normalized absolute paths');
  if (record.directoryName !== path.basename(record.path) || record.directoryName === '.' || record.directoryName === '..' || path.dirname(record.path) !== record.rootDirectory || record.path === record.rootDirectory) fail('Task must be a direct child of its recorded root');
  for (const key of ['rootDev', 'rootIno', 'dev', 'ino', 'markerDev', 'markerIno']) {
    if (typeof record[key] !== 'string' || !/^\d+$/.test(record[key])) fail(`Invalid record identity: ${key}`);
  }
  if (typeof record.markerToken !== 'string' || !/^[a-f0-9]{64}$/.test(record.markerToken)) fail('Invalid ownership token');
  if (typeof record.phase !== 'string' || !record.phase) fail('Invalid phase');
  cleanupPolicy(record.cleanupPolicy);
  if (!isoTime(record.lastActivityAt)) fail('Invalid lastActivityAt');
  if (record.cleanupRetryAt != null && !isoTime(record.cleanupRetryAt)) fail('Invalid cleanupRetryAt');
}

/**
 * Local filesystem ownership store. All operations are serialized per instance;
 * use one instance per stateDir (cross-process coordination is not provided).
 * Node's recursive rm unlinks child symlinks rather than traversing their targets.
 * lstat/realpath/fstat checks defend against replacements observed before rm, but
 * pure Node path-based APIs cannot eliminate malicious concurrent TOCTOU swaps.
 * This is not a security boundary against processes that can mutate these paths.
 */
export class ScratchStore {
  constructor({ stateDir, trash = moveToTrash } = {}) {
    this._stateDir = absolute(stateDir, 'stateDir');
    this._trash = trash;
    this._state = null;
    this._queue = Promise.resolve();
  }

  _enqueue(operation) {
    const result = this._queue.then(operation);
    this._queue = result.catch(() => {});
    return result;
  }

  async _initialize() {
    if (this._state) return;
    await fs.mkdir(this._stateDir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this._stateDir, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('stateDir must be a real directory');
    this._stateDir = await fs.realpath(this._stateDir);
    this._stateIdentity = identity(stat);
    let state;
    try {
      const file = await fs.open(path.join(this._stateDir, 'tasks.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile()) fail('tasks.json must be a regular file');
        state = JSON.parse(await file.readFile('utf8'));
      } finally { await file.close(); }
    } catch (error) {
      if (!missing(error)) throw error;
      state = { version: 1, settings: { ...DEFAULT_SETTINGS }, tasks: [] };
    }
    object(state, 'state');
    if (state.version !== 1 || !Array.isArray(state.tasks)) fail('Unsupported or invalid tasks.json');
    state.settings = settingsPatch(state.settings, DEFAULT_SETTINGS);
    const ids = new Set();
    const paths = new Set();
    for (const record of state.tasks) {
      // Missing policy always means a pre-auto-cleanup task, never inherit the
      // current global preference. Migration cannot opt old files into deletion.
      record.cleanupPolicy ??= { enabled: false, idleHours: 24 };
      record.lastActivityAt ??= isoTime(record.createdAt) ? record.createdAt : new Date().toISOString();
      recordShape(record);
      if (ids.has(record.id) || paths.has(record.path)) fail('Duplicate stored task');
      ids.add(record.id);
      paths.add(record.path);
    }
    // Old version-1 stores without the internal journal remain compatible.
    state.deletionAuthorizations ??= [];
    if (!Array.isArray(state.deletionAuthorizations)) fail('Invalid deletion authorization journal');
    const authorizedIds = new Set();
    for (const authorization of state.deletionAuthorizations) {
      object(authorization, 'deletion authorization');
      const record = state.tasks.find(task => task.id === authorization.id);
      if (!record || authorizedIds.has(authorization.id) || authorization.binding !== deletionBinding(record)) fail('Invalid deletion authorization binding');
      authorizedIds.add(authorization.id);
    }
    this._state = clone(state);
  }

  init() { return this._enqueue(async () => { await this._initialize(); return this; }); }
  _run(operation) { return this._enqueue(async () => { await this._initialize(); return operation(); }); }
  getSettings() { return this._run(() => clone(this._state.settings)); }
  list() { return this._run(() => clone(this._state.tasks)); }
  get(id) { return this._run(() => clone(this._state.tasks.find(task => task.id === id) ?? null)); }

  async _assertStateDirectory() {
    const stat = await fs.lstat(this._stateDir, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(stat, this._stateIdentity.dev, this._stateIdentity.ino) || await fs.realpath(this._stateDir) !== this._stateDir) fail('stateDir was replaced');
  }

  // Explicitly validate the exact absolute temporary/source/destination paths
  // before each unlink or rename. Never operate on caller-derived loose paths.
  async _assertStatePaths(temp, destination) {
    await this._assertStateDirectory();
    if (!path.isAbsolute(temp) || path.dirname(temp) !== this._stateDir || !/^\.tasks-[a-f0-9-]+\.tmp$/.test(path.basename(temp)) || destination !== path.join(this._stateDir, 'tasks.json') || !path.isAbsolute(destination)) fail('Invalid atomic state write paths');
  }

  async _persist(next) {
    const destination = path.join(this._stateDir, 'tasks.json');
    const temp = path.join(this._stateDir, `.tasks-${randomUUID()}.tmp`);
    await this._assertStatePaths(temp, destination);
    let created = false;
    let tempIdentity;
    try {
      const handle = await fs.open(temp, 'wx', 0o600);
      created = true;
      try {
        tempIdentity = identity(await handle.stat({ bigint: true }));
        await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`);
        await handle.sync();
      } finally { await handle.close(); }
      await this._assertStatePaths(temp, destination);
      const tempStat = await fs.lstat(temp, { bigint: true });
      if (!tempStat.isFile() || tempStat.isSymbolicLink() || !sameIdentity(tempStat, tempIdentity.dev, tempIdentity.ino)) fail('Atomic state temporary file was replaced');
      // rename replaces the destination entry, never follows its symlink target.
      await fs.rename(temp, destination);
      created = false;
    } finally {
      if (created) {
        await this._assertStatePaths(temp, destination);
        let leftover;
        try { leftover = await fs.lstat(temp, { bigint: true }); }
        catch (error) { if (!missing(error)) throw error; }
        if (leftover) {
          if (!tempIdentity || !leftover.isFile() || leftover.isSymbolicLink() || !sameIdentity(leftover, tempIdentity.dev, tempIdentity.ino)) fail('Refusing to unlink replaced atomic temporary file');
          await fs.unlink(temp);
        }
      }
    }
  }

  async _commit(next) { await this._persist(next); this._state = next; }

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
    if (!info.isDirectory() || info.isSymbolicLink()) fail('Root must be a real directory, not a symlink');
    const canonical = await fs.realpath(root);
    return { canonical, ...identity(info) };
  }

  async _assertRoot(record, allowMissing = false) {
    try {
      const info = await this._rootIdentity(record.rootDirectory);
      if (info.canonical !== record.rootDirectory || info.dev !== record.rootDev || info.ino !== record.rootIno) fail('Recorded root was replaced');
      return true;
    } catch (error) { if (allowMissing && missing(error)) return false; throw error; }
  }

  async _assertTask(record, allowMissing = false) {
    // This checks the intended absolute deletion path and that it is neither the
    // root itself nor an arbitrary descendant outside the recorded direct child.
    recordShape(record);
    if (!await this._assertRoot(record, allowMissing)) return false;
    let stat;
    try { stat = await fs.lstat(record.path, { bigint: true }); }
    catch (error) { if (allowMissing && missing(error)) return false; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(stat, record.dev, record.ino) || await fs.realpath(record.path) !== record.path) fail('Recorded task directory was replaced');
    return true;
  }

  async _assertOwned(record, allowMissing = false) {
    if (!await this._assertTask(record, allowMissing)) return false;
    const markerPath = path.join(record.path, MARKER);
    const stat = await fs.lstat(markerPath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !sameIdentity(stat, record.markerDev, record.markerIno)) fail('Ownership marker was replaced');
    const handle = await fs.open(markerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile() || !sameIdentity(opened, record.markerDev, record.markerIno) || opened.size > 16384n) fail('Unsafe ownership marker');
      const marker = JSON.parse(await handle.readFile('utf8'));
      if (marker.version !== 1 || marker.id !== record.id || marker.token !== record.markerToken) fail('Ownership marker does not match');
    } finally { await handle.close(); }
    // Recheck root/task identities immediately before returning to the rm call.
    await this._assertTask(record);
    return true;
  }

  createDirectory({ atMs = Date.now() } = {}) {
    return this._run(async () => {
      if (!Number.isFinite(atMs)) fail('Invalid creation timestamp', 'ERR_SCRATCH_VALIDATION');
      const { rootDirectory, directoryPrefix, autoCleanupEnabled, idleHours } = this._state.settings;
      if (!rootDirectory) fail('Configure rootDirectory before creating a task', 'ERR_SCRATCH_VALIDATION');
      await fs.mkdir(rootDirectory, { recursive: true });
      const root = await this._rootIdentity(rootDirectory);
      const id = randomUUID();
      const date = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
      const directoryName = `${directoryPrefix}-${date}-${id}`;
      const directory = path.join(root.canonical, directoryName);
      if (!path.isAbsolute(directory) || path.dirname(directory) !== root.canonical || directory === root.canonical) fail('Invalid task creation path');
      await fs.mkdir(directory, { mode: 0o700 });
      const info = await fs.lstat(directory, { bigint: true });
      const now = new Date(atMs).toISOString();
      const record = {
        id, directoryName, rootDirectory: root.canonical, path: directory,
        rootDev: root.dev, rootIno: root.ino, ...identity(info),
        markerDev: '0', markerIno: '0', markerToken: randomBytes(32).toString('hex'),
        phase: 'created', createdAt: now, updatedAt: now, workspaceId: null, sessionId: null,
        cleanupPolicy: {enabled:autoCleanupEnabled,idleHours}, lastActivityAt: now, cleanupRetryAt: null,
      };
      let markerReady = false;
      try {
        await this._assertTask(record);
        const handle = await fs.open(path.join(directory, MARKER), 'wx', 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({ version: 1, id, token: record.markerToken })}\n`);
          await handle.sync();
          const markerInfo = await handle.stat({ bigint: true });
          record.markerDev = String(markerInfo.dev);
          record.markerIno = String(markerInfo.ino);
        } finally { await handle.close(); }
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
            // Without a proven marker only remove an empty directory; never recurse.
            await fs.rmdir(record.path);
          }
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], 'Create failed; owned-directory rollback also failed');
        }
        throw error;
      }
    });
  }

  updateRecord(id, patch) {
    return this._run(async () => {
      object(patch, 'record patch');
      for (const key of Object.keys(patch)) {
        if (!['workspaceId', 'sessionId', 'phase', 'lastError', 'lastActivityAt', 'cleanupRetryAt'].includes(key)) fail(`Record field is immutable or unknown: ${key}`, 'ERR_SCRATCH_VALIDATION');
        if (patch[key] !== null && (typeof patch[key] !== 'string' || patch[key].length > 16384)) fail(`Invalid ${key}`, 'ERR_SCRATCH_VALIDATION');
        if (key === 'phase' && (typeof patch[key] !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(patch[key]))) fail('Invalid phase', 'ERR_SCRATCH_VALIDATION');
        if (key === 'lastActivityAt' && !isoTime(patch[key])) fail('Invalid lastActivityAt', 'ERR_SCRATCH_VALIDATION');
        if (key === 'cleanupRetryAt' && patch[key] !== null && !isoTime(patch[key])) fail('Invalid cleanupRetryAt', 'ERR_SCRATCH_VALIDATION');
      }
      const next = clone(this._state);
      const record = next.tasks.find(task => task.id === id);
      if (!record) fail(`Unknown task: ${id}`, 'ERR_SCRATCH_NOT_FOUND');
      Object.assign(record, patch, { updatedAt: new Date().toISOString() });
      await this._commit(next);
      return clone(record);
    });
  }

  async _assertAuthorizedRemoval(record) {
    await this._assertStateDirectory();
    const authorization = this._state.deletionAuthorizations.find(entry => entry.id === record.id);
    if (!authorization || authorization.binding !== deletionBinding(record)) fail('Missing persisted deletion authorization');
    if (!await this._assertTask(record, true)) return false;
    try { await fs.lstat(path.join(record.path, MARKER)); }
    catch (error) {
      if (!missing(error)) throw error;
      // Only a missing marker is allowed after an authorized partial rm. A
      // present symlink/replaced/corrupt marker still fails the full checks.
      return this._assertTask(record);
    }
    return this._assertOwned(record);
  }

  async _removeAuthorizedDirectory(record, beforeRemove) {
    if (await this._assertAuthorizedRemoval(record)) {
      // Caller may synchronously cancel a pending idle cleanup after filesystem
      // validation/authorization I/O but before recursive deletion begins.
      beforeRemove?.();
      // Intended absolute direct-child path + root/task identities and durable
      // authorization verified immediately before the move. The folder goes to
      // the platform trash; a failure here is reported, never downgraded to a
      // permanent delete. The residual concurrent TOCTOU limitation still applies.
      await this._trash(record.path);
    }
  }

  removeDirectory(id, { beforeRemove, finalPhase = 'files-deleted' } = {}) {
    return this._run(async () => {
      if (!['files-deleted','auto-completing'].includes(finalPhase)) fail('Invalid deletion final phase', 'ERR_SCRATCH_VALIDATION');
      let record = this._state.tasks.find(task => task.id === id);
      if (!record) fail(`Unknown task: ${id}`, 'ERR_SCRATCH_NOT_FOUND');
      await this._assertStateDirectory();
      let authorization = this._state.deletionAuthorizations.find(entry => entry.id === id);
      if (!authorization && await this._assertOwned(record, true)) {
        const authorized = clone(this._state);
        authorized.deletionAuthorizations.push({ id, binding: deletionBinding(record) });
        // Do not touch the filesystem unless authorization is durably saved.
        await this._commit(authorized);
        record = this._state.tasks.find(task => task.id === id);
        authorization = this._state.deletionAuthorizations.find(entry => entry.id === id);
      }
      if (authorization) await this._removeAuthorizedDirectory(record, beforeRemove);
      const next = clone(this._state);
      const updated = next.tasks.find(task => task.id === id);
      updated.phase = finalPhase;
      updated.updatedAt = new Date().toISOString();
      next.deletionAuthorizations = next.deletionAuthorizations.filter(entry => entry.id !== id);
      await this._commit(next);
      return clone(updated);
    });
  }

  forget(id) {
    return this._run(async () => {
      const record = this._state.tasks.find(task => task.id === id);
      if (!record) return null;
      const next = clone(this._state);
      next.tasks = next.tasks.filter(task => task.id !== id);
      next.deletionAuthorizations = next.deletionAuthorizations.filter(entry => entry.id !== id);
      await this._commit(next);
      return clone(record);
    });
  }
}
