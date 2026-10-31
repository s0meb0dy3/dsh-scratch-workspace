import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ScratchStore } from './core.js';

const MARKER = '.dsh-scratch-owner.json';
const absent = async target => assert.rejects(fs.lstat(target), { code: 'ENOENT' });

// Every test filesystem mutation lives below this system mkdtemp allocation.
// Explicit absolute-path checks immediately precede every delete/move, including
// cleanup, so no test cleanup can delete the workspace or arbitrary user paths.
async function fixture(run) {
  const allocated = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-scratch-core-test-'));
  const base = await fs.realpath(allocated);
  const tempRoot = await fs.realpath(os.tmpdir());
  assert.ok(path.isAbsolute(base));
  assert.equal(path.dirname(base), tempRoot);
  assert.match(path.basename(base), /^dsh-scratch-core-test-/);
  process.env.DSH_SCRATCH_TRASH_DIR = path.join(base, 'trash');
  function intended(target, allowBase = false) {
    assert.ok(path.isAbsolute(target), 'mutation target must be absolute');
    assert.equal(path.resolve(target), target);
    const relative = path.relative(base, target);
    assert.ok((allowBase && target === base) || (relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)), `unsafe test mutation: ${target}`);
  }
  const remove = async target => { intended(target); await fs.rm(target, { recursive: true, force: true }); };
  const move = async (source, destination) => { intended(source); intended(destination); await fs.rename(source, destination); };
  const stateDir = path.join(base, 'state');
  const root = path.join(base, 'root');
  const store = new ScratchStore({ stateDir });
  try { await store.init(); await run({ base, root, stateDir, store, remove, move }); }
  finally {
    assert.ok(path.isAbsolute(base));
    assert.equal(path.dirname(base), tempRoot);
    assert.match(path.basename(base), /^dsh-scratch-core-test-/);
    assert.equal(await fs.realpath(base), base);
    intended(base, true);
    await fs.rm(base, { recursive: true, force: false });
  }
}

async function configured(context) {
  await context.store.saveSettings({ rootDirectory: context.root });
  return context.store.createDirectory();
}

async function blockPersistence(context) {
  const target = path.join(context.stateDir, 'tasks.json');
  const backup = path.join(context.stateDir, 'tasks.backup');
  await context.move(target, backup);
  await fs.mkdir(target);
  return async () => { await context.remove(target); await context.move(backup, target); };
}

test('default settings, unconfigured create, and constructor path validation', async () => {
  assert.throws(() => new ScratchStore({ stateDir: 'relative' }), /absolute/);
  assert.throws(() => new ScratchStore(), /absolute/);
  await fixture(async ({ store }) => {
    assert.deepEqual(await store.getSettings(), { rootDirectory: '', directoryPrefix: 'task', confirmDelete: true, autoCleanupEnabled: false, idleHours: 24 });
    assert.deepEqual(await store.list(), []);
    await assert.rejects(store.createDirectory(), /Configure rootDirectory/);
    assert.equal(await store.get('missing'), null);
    assert.equal(await store.forget('missing'), null);
  });
});

test('normal lifecycle persists ownership and preserves records until forgotten', async () => {
  await fixture(async context => {
    const { store, root, stateDir } = context;
    const record = await configured(context);
    assert.equal(record.phase, 'created');
    assert.equal(record.rootDirectory, await fs.realpath(root));
    assert.equal(path.dirname(record.path), record.rootDirectory);
    assert.match(record.directoryName, /^task-\d{8}-\d{6}-[a-f0-9-]{36}$/);
    const marker = JSON.parse(await fs.readFile(path.join(record.path, MARKER), 'utf8'));
    assert.equal(marker.token, record.markerToken);
    assert.equal(marker.id, record.id);
    assert.equal(String((await fs.lstat(record.path, { bigint: true })).ino), record.ino);
    await fs.mkdir(path.join(record.path, 'outputs'));
    await fs.writeFile(path.join(record.path, 'outputs', 'artifact.txt'), 'generated');
    const updated = await store.updateRecord(record.id, { workspaceId: 'workspace-1', sessionId: 'session-1', phase: 'active' });
    assert.equal(updated.workspaceId, 'workspace-1');
    assert.equal(updated.sessionId, 'session-1');
    const removed = await store.removeDirectory(record.id);
    assert.equal(removed.phase, 'files-deleted');
    await absent(record.path);
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.get(record.id)).workspaceId, 'workspace-1');
    assert.equal((await store.removeDirectory(record.id)).phase, 'files-deleted');
    const disk = JSON.parse(await fs.readFile(path.join(stateDir, 'tasks.json'), 'utf8'));
    assert.equal(disk.tasks[0].phase, 'files-deleted');
    assert.equal((await store.forget(record.id)).id, record.id);
    assert.deepEqual(await store.list(), []);
    assert.ok((await fs.stat(root)).isDirectory());
  });
});

test('concurrent creates and updates serialize without lost records', async () => {
  await fixture(async context => {
    const { store, root, stateDir } = context;
    await store.saveSettings({ rootDirectory: root, directoryPrefix: '任务_1' });
    const records = await Promise.all(Array.from({ length: 16 }, () => store.createDirectory()));
    assert.equal(new Set(records.map(record => record.id)).size, 16);
    assert.equal(new Set(records.map(record => record.path)).size, 16);
    assert.equal((await store.list()).length, 16);
    await Promise.all(records.map((record, index) => store.updateRecord(record.id, { sessionId: `s-${index}` })));
    const recovered = new ScratchStore({ stateDir });
    await recovered.init();
    assert.equal((await recovered.list()).length, 16);
    for (const [index, record] of records.entries()) assert.equal((await recovered.get(record.id)).sessionId, `s-${index}`);
  });
});

test('settings reject unsafe prefixes, relative paths, malformed values and unknown keys', async () => {
  await fixture(async ({ store }) => {
    for (const directoryPrefix of ['', '.', '..', '../task', 'a/b', 'a\\b', 'a b', 'a.b', 'x'.repeat(41), 'é', '🐱', null, 12]) {
      await assert.rejects(store.saveSettings({ directoryPrefix }), /directoryPrefix/);
    }
    for (const rootDirectory of ['relative', '~', '../tmp', 'foo/bar', '/bad\0path', null, 23]) {
      await assert.rejects(store.saveSettings({ rootDirectory }), /rootDirectory/);
    }
    for (const confirmDelete of ['false', 0, null]) await assert.rejects(store.saveSettings({ confirmDelete }), /boolean/);
    await assert.rejects(store.saveSettings({ surprise: true }), /Unknown/);
    await assert.rejects(store.saveSettings({ toString: 'not a setting' }), /Unknown/);
    await assert.rejects(store.saveSettings(JSON.parse('{"__proto__":{}}')), /Unknown/);
    await assert.rejects(store.saveSettings(null), /object/);
    assert.deepEqual(await store.getSettings(), { rootDirectory: '', directoryPrefix: 'task', confirmDelete: true, autoCleanupEnabled: false, idleHours: 24 });
    assert.equal((await store.saveSettings({ rootDirectory: '~/scratch-example', directoryPrefix: '中文_-09AZaz', confirmDelete: false })).rootDirectory, path.join(os.homedir(), 'scratch-example'));
    assert.equal((await store.saveSettings({ rootDirectory: '' })).rootDirectory, '');
  });
});

test('changing root or prefix does not invalidate old owned directories', async () => {
  await fixture(async context => {
    const old = await configured(context);
    const nextRoot = path.join(context.base, 'new-root');
    await context.store.saveSettings({ rootDirectory: nextRoot, directoryPrefix: 'next' });
    const next = await context.store.createDirectory();
    assert.match(next.directoryName, /^next-/);
    await context.store.removeDirectory(old.id);
    await absent(old.path);
    assert.ok((await fs.stat(next.path)).isDirectory());
    assert.ok((await fs.stat(nextRoot)).isDirectory());
  });
});

test('rejects task symlink replacement and preserves target', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const moved = `${record.path}-original`;
    const target = path.join(context.base, 'unowned-target');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'precious'), 'keep');
    await context.move(record.path, moved);
    await fs.symlink(target, record.path, 'dir');
    await assert.rejects(context.store.removeDirectory(record.id), /replaced/);
    assert.equal(await fs.readFile(path.join(target, 'precious'), 'utf8'), 'keep');
    assert.ok((await fs.lstat(record.path)).isSymbolicLink());
    assert.equal((await context.store.get(record.id)).phase, 'created');
  });
});

test('rejects recreated task directory even with copied marker content', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const marker = await fs.readFile(path.join(record.path, MARKER));
    await context.move(record.path, `${record.path}-original`);
    await fs.mkdir(record.path);
    await fs.writeFile(path.join(record.path, MARKER), marker);
    await fs.writeFile(path.join(record.path, 'precious'), 'keep');
    await assert.rejects(context.store.removeDirectory(record.id), /replaced/);
    assert.equal(await fs.readFile(path.join(record.path, 'precious'), 'utf8'), 'keep');
  });
});

test('rejects symlink ownership marker without touching target', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const marker = path.join(record.path, MARKER);
    const target = path.join(context.base, 'marker-target');
    await fs.writeFile(target, await fs.readFile(marker));
    await context.move(marker, path.join(record.path, 'marker-original'));
    await fs.symlink(target, marker);
    await assert.rejects(context.store.removeDirectory(record.id), /marker was replaced/);
    assert.ok((await fs.lstat(marker)).isSymbolicLink());
    assert.equal(JSON.parse(await fs.readFile(target, 'utf8')).id, record.id);
  });
});

test('rejects regular marker replacement with identical content', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const marker = path.join(record.path, MARKER);
    const original = await fs.readFile(marker);
    await context.move(marker, path.join(record.path, 'marker-original'));
    await fs.writeFile(marker, original);
    await assert.rejects(context.store.removeDirectory(record.id), /marker was replaced/);
    assert.ok((await fs.stat(record.path)).isDirectory());
  });
});

test('rejects changed marker token and missing marker', async () => {
  await fixture(async context => {
    const first = await configured(context);
    const marker = path.join(first.path, MARKER);
    const data = JSON.parse(await fs.readFile(marker, 'utf8'));
    data.token = '0'.repeat(64);
    await fs.writeFile(marker, JSON.stringify(data));
    await assert.rejects(context.store.removeDirectory(first.id), /does not match/);
    const second = await context.store.createDirectory();
    await context.remove(path.join(second.path, MARKER));
    await assert.rejects(context.store.removeDirectory(second.id), { code: 'ENOENT' });
    assert.equal((await context.store.get(second.id)).phase, 'created');
  });
});

test('rejects recorded root replacement by a different directory', async () => {
  await fixture(async context => {
    const record = await configured(context);
    await context.move(context.root, `${context.root}-original`);
    await fs.mkdir(context.root);
    await assert.rejects(context.store.removeDirectory(record.id), /root was replaced/);
    assert.ok((await fs.stat(path.join(`${context.root}-original`, record.directoryName))).isDirectory());
  });
});

test('rejects recorded root symlink even when it points at the original root', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const movedRoot = `${context.root}-original`;
    await context.move(context.root, movedRoot);
    await fs.symlink(movedRoot, context.root, 'dir');
    await assert.rejects(context.store.removeDirectory(record.id), /symlink/);
    assert.ok((await fs.stat(path.join(movedRoot, record.directoryName))).isDirectory());
  });
});

test('creation refuses symlink root and records canonical parent paths', async () => {
  await fixture(async context => {
    const real = path.join(context.base, 'real-root');
    await fs.mkdir(real);
    await fs.symlink(real, context.root, 'dir');
    await context.store.saveSettings({ rootDirectory: context.root });
    await assert.rejects(context.store.createDirectory(), /symlink/);
    const parentAlias = path.join(context.base, 'parent-alias');
    await fs.symlink(context.base, parentAlias, 'dir');
    await context.store.saveSettings({ rootDirectory: path.join(parentAlias, 'nested-root') });
    const record = await context.store.createDirectory();
    assert.equal(record.rootDirectory, path.join(context.base, 'nested-root'));
    await context.store.removeDirectory(record.id);
  });
});

test('recursive removal deletes normal outputs and child links but preserves targets', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const target = path.join(context.base, 'external-output');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'precious'), 'not owned');
    await fs.mkdir(path.join(record.path, 'nested'));
    await fs.writeFile(path.join(record.path, 'nested', 'generated'), 'owned');
    await fs.symlink(target, path.join(record.path, 'nested', 'external'), 'dir');
    await fs.symlink(path.join(target, 'precious'), path.join(record.path, 'file-link'));
    await fs.symlink(context.root, path.join(record.path, 'root-link'), 'dir');
    await fs.symlink(path.join(context.base, 'not-there'), path.join(record.path, 'dangling'));
    await context.store.removeDirectory(record.id);
    await absent(record.path);
    assert.equal(await fs.readFile(path.join(target, 'precious'), 'utf8'), 'not owned');
    assert.ok((await fs.stat(context.root)).isDirectory());
  });
});

test('missing task or missing root is idempotently marked files-deleted', async () => {
  await fixture(async context => {
    const record = await configured(context);
    await context.remove(record.path);
    await context.store.removeDirectory(record.id);
    assert.equal((await context.store.get(record.id)).phase, 'files-deleted');
    const next = await context.store.createDirectory();
    await context.remove(context.root);
    assert.equal((await context.store.removeDirectory(next.id)).phase, 'files-deleted');
    assert.equal((await context.store.removeDirectory(next.id)).phase, 'files-deleted');
  });
});

test('repeated remove does not delete a replacement after successful deletion', async () => {
  await fixture(async context => {
    const record = await configured(context);
    await context.store.removeDirectory(record.id);
    await fs.mkdir(record.path);
    await fs.writeFile(path.join(record.path, 'new-user-file'), 'keep');
    await assert.rejects(context.store.removeDirectory(record.id));
    assert.equal(await fs.readFile(path.join(record.path, 'new-user-file'), 'utf8'), 'keep');
  });
});

test('immutable ownership data cannot be changed through updateRecord; getters clone', async () => {
  await fixture(async context => {
    const record = await configured(context);
    for (const patch of [{ path: context.root }, { rootDirectory: '/' }, { id: 'new' }, { markerToken: 'fake' }, { dev: '0' }, { directoryName: '..' }, { phase: null }, { phase: '../bad' }, { workspaceId: {} }]) {
      await assert.rejects(context.store.updateRecord(record.id, patch));
    }
    await assert.rejects(context.store.updateRecord('unknown', { phase: 'active' }), { code: 'ERR_SCRATCH_NOT_FOUND' });
    await assert.rejects(context.store.removeDirectory('unknown'), { code: 'ERR_SCRATCH_NOT_FOUND' });
    record.path = context.root;
    const list = await context.store.list();
    list[0].path = context.root;
    const settings = await context.store.getSettings();
    settings.rootDirectory = '/';
    assert.notEqual((await context.store.get(list[0].id)).path, context.root);
    assert.equal((await context.store.getSettings()).rootDirectory, context.root);
  });
});

test('new instance restores settings, records and deletion ownership', async () => {
  await fixture(async context => {
    const record = await configured(context);
    await context.store.saveSettings({ directoryPrefix: '恢复', confirmDelete: false });
    await context.store.updateRecord(record.id, { workspaceId: 'w', sessionId: 's', phase: 'session-created' });
    const restored = new ScratchStore({ stateDir: context.stateDir });
    await restored.init();
    assert.deepEqual(await restored.getSettings(), { rootDirectory: context.root, directoryPrefix: '恢复', confirmDelete: false, autoCleanupEnabled: false, idleHours: 24 });
    assert.equal((await restored.get(record.id)).sessionId, 's');
    await restored.removeDirectory(record.id);
    await absent(record.path);
    const restoredAgain = new ScratchStore({ stateDir: context.stateDir });
    assert.equal((await restoredAgain.get(record.id)).phase, 'files-deleted');
  });
});

test('host phases and completed tombstones remain persisted until explicit forget', async () => {
  await fixture(async context => {
    const record = await configured(context);
    for (const phase of ['active', 'completing', 'error']) {
      assert.equal((await context.store.updateRecord(record.id, { phase })).phase, phase);
    }
    await context.store.removeDirectory(record.id);
    await context.store.updateRecord(record.id, { phase: 'completed' });
    const restored = new ScratchStore({ stateDir: context.stateDir });
    assert.equal((await restored.list()).length, 1);
    assert.equal((await restored.get(record.id)).phase, 'completed');
    assert.equal((await restored.get(record.id)).path, record.path);
  });
});

test('disk commit failure does not publish settings, updates or forget and queue recovers', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const oldSettings = await context.store.getSettings();
    const restore = await blockPersistence(context);
    await assert.rejects(context.store.saveSettings({ directoryPrefix: 'failed' }));
    assert.deepEqual(await context.store.getSettings(), oldSettings);
    await assert.rejects(context.store.updateRecord(record.id, { sessionId: 'failed' }));
    assert.equal((await context.store.get(record.id)).sessionId, null);
    await assert.rejects(context.store.forget(record.id));
    assert.equal((await context.store.list()).length, 1);
    assert.equal((await fs.readdir(context.stateDir)).filter(name => name.endsWith('.tmp')).length, 0);
    await restore();
    assert.equal((await context.store.updateRecord(record.id, { sessionId: 'retry' })).sessionId, 'retry');
  });
});

test('create disk failure rolls back only newly owned directory and permits retry', async () => {
  await fixture(async context => {
    await context.store.saveSettings({ rootDirectory: context.root });
    await fs.mkdir(context.root);
    await fs.writeFile(path.join(context.root, 'precious'), 'keep');
    const restore = await blockPersistence(context);
    await assert.rejects(context.store.createDirectory());
    assert.deepEqual(await context.store.list(), []);
    assert.deepEqual(await fs.readdir(context.root), ['precious']);
    assert.equal(await fs.readFile(path.join(context.root, 'precious'), 'utf8'), 'keep');
    await restore();
    assert.equal((await context.store.createDirectory()).phase, 'created');
  });
});

test('deletion authorization persistence failure removes no files and permits retry', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const restore = await blockPersistence(context);
    await assert.rejects(context.store.removeDirectory(record.id));
    assert.ok((await fs.stat(record.path)).isDirectory());
    assert.ok((await fs.stat(path.join(record.path, MARKER))).isFile());
    assert.equal((await context.store.get(record.id)).phase, 'created');
    await restore();
    assert.equal((await context.store.removeDirectory(record.id)).phase, 'files-deleted');
  });
});

test('final delete commit failure keeps durable authorization for restart retry', async t => {
  await fixture(async context => {
    const record = await configured(context);
    const original = context.store._persist.bind(context.store);
    let writes = 0;
    t.mock.method(context.store, '_persist', async next => {
      if (++writes === 2) throw Object.assign(new Error('injected final disk failure'), { code: 'EIO' });
      return original(next);
    });
    await assert.rejects(context.store.removeDirectory(record.id), { code: 'EIO' });
    await absent(record.path);
    assert.equal((await context.store.get(record.id)).phase, 'created');
    const disk = JSON.parse(await fs.readFile(path.join(context.stateDir, 'tasks.json'), 'utf8'));
    assert.equal(disk.deletionAuthorizations.length, 1);
    const recovered = new ScratchStore({ stateDir: context.stateDir });
    assert.equal((await recovered.removeDirectory(record.id)).phase, 'files-deleted');
    assert.equal(JSON.parse(await fs.readFile(path.join(context.stateDir, 'tasks.json'), 'utf8')).deletionAuthorizations.length, 0);
  });
});

async function partialRemoveFailure(context, t, record) {
  const remaining = path.join(record.path, 'remaining-output');
  await fs.writeFile(remaining, 'owned');
  t.mock.method(context.store, '_removeAuthorizedDirectory', async owned => {
    assert.equal(owned.path, record.path);
    assert.equal(await context.store._assertAuthorizedRemoval(owned), true);
    // Deterministically emulate recursive rm deleting its marker before failing.
    // context.remove verifies this exact absolute target before the mutation.
    await context.remove(path.join(owned.path, MARKER));
    throw Object.assign(new Error('injected partial recursive rm failure'), { code: 'EACCES' });
  });
  await assert.rejects(context.store.removeDirectory(record.id), { code: 'EACCES' });
  await absent(path.join(record.path, MARKER));
  assert.equal(await fs.readFile(remaining, 'utf8'), 'owned');
  assert.equal((await context.store.get(record.id)).phase, 'created');
}

test('partially failed recursive delete retries after restart without its removed marker', async t => {
  await fixture(async context => {
    const record = await configured(context);
    await partialRemoveFailure(context, t, record);
    await context.store.updateRecord(record.id, { phase: 'error', lastError: 'retry me' });
    const recovered = new ScratchStore({ stateDir: context.stateDir });
    assert.equal((await recovered.removeDirectory(record.id)).phase, 'files-deleted');
    await absent(record.path);
    assert.ok((await fs.stat(context.root)).isDirectory());
    assert.equal((await recovered.get(record.id)).lastError, 'retry me');
  });
});

test('partially failed recursive delete retries in the same store instance', async t => {
  await fixture(async context => {
    const record = await configured(context);
    await partialRemoveFailure(context, t, record);
    t.mock.restoreAll();
    assert.equal((await context.store.removeDirectory(record.id)).phase, 'files-deleted');
    await absent(record.path);
  });
});

test('authorized partial deletion retry rejects replacement directory without its marker', async t => {
  await fixture(async context => {
    const record = await configured(context);
    await partialRemoveFailure(context, t, record);
    await context.move(record.path, `${record.path}-original`);
    await fs.mkdir(record.path);
    await fs.writeFile(path.join(record.path, 'precious'), 'keep');
    const recovered = new ScratchStore({ stateDir: context.stateDir });
    await assert.rejects(recovered.removeDirectory(record.id), /task directory was replaced/);
    assert.equal(await fs.readFile(path.join(record.path, 'precious'), 'utf8'), 'keep');
  });
});

test('authorized retry still rejects a replacement marker symlink and root replacement', async t => {
  await fixture(async context => {
    const record = await configured(context);
    await partialRemoveFailure(context, t, record);
    const target = path.join(context.base, 'precious');
    await fs.writeFile(target, 'keep');
    await fs.symlink(target, path.join(record.path, MARKER));
    const recovered = new ScratchStore({ stateDir: context.stateDir });
    await assert.rejects(recovered.removeDirectory(record.id), /marker was replaced/);
    assert.equal(await fs.readFile(target, 'utf8'), 'keep');
    await context.move(context.root, `${context.root}-original`);
    await fs.mkdir(context.root);
    await assert.rejects(recovered.removeDirectory(record.id), /root was replaced/);
  });
});

test('forget clears outstanding authorization and malformed authorization fails closed', async t => {
  await fixture(async context => {
    const record = await configured(context);
    await partialRemoveFailure(context, t, record);
    const target = path.join(context.stateDir, 'tasks.json');
    const disk = JSON.parse(await fs.readFile(target, 'utf8'));
    disk.deletionAuthorizations[0].binding = 'forged';
    await fs.writeFile(target, JSON.stringify(disk));
    await assert.rejects(new ScratchStore({ stateDir: context.stateDir }).init(), /authorization binding/);
    await context.store.forget(record.id);
    assert.equal(JSON.parse(await fs.readFile(target, 'utf8')).deletionAuthorizations.length, 0);
    assert.deepEqual(await new ScratchStore({ stateDir: context.stateDir }).list(), []);
    assert.ok((await fs.stat(record.path)).isDirectory());
  });
});

test('replaced state directory refuses commits without publishing memory', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const original = await context.store.getSettings();
    await context.move(context.stateDir, `${context.stateDir}-original`);
    await fs.mkdir(context.stateDir);
    await assert.rejects(context.store.saveSettings({ directoryPrefix: 'unsafe' }), /stateDir was replaced/);
    assert.deepEqual(await context.store.getSettings(), original);
    await assert.rejects(context.store.removeDirectory(record.id), /stateDir was replaced/);
    assert.ok((await fs.stat(record.path)).isDirectory());
    assert.deepEqual(await fs.readdir(context.stateDir), []);
  });
});

test('corrupt and dangerous persisted records fail closed without filesystem deletion', async () => {
  await fixture(async context => {
    const record = await configured(context);
    const target = path.join(context.stateDir, 'tasks.json');
    const data = JSON.parse(await fs.readFile(target, 'utf8'));
    data.tasks[0].path = context.root;
    data.tasks[0].directoryName = path.basename(context.root);
    await fs.writeFile(target, JSON.stringify(data));
    await assert.rejects(new ScratchStore({ stateDir: context.stateDir }).init(), /direct child/);
    assert.ok((await fs.stat(record.path)).isDirectory());
    await fs.writeFile(target, '{not json');
    await assert.rejects(new ScratchStore({ stateDir: context.stateDir }).init(), SyntaxError);
  });
});

test('initialization rejects tasks.json symlink without reading its target', async () => {
  await fixture(async context => {
    await context.store.saveSettings({ directoryPrefix: 'original' });
    const state = path.join(context.stateDir, 'tasks.json');
    const backup = path.join(context.stateDir, 'backup');
    await context.move(state, backup);
    await fs.symlink(backup, state);
    await assert.rejects(new ScratchStore({ stateDir: context.stateDir }).init());
    assert.equal(JSON.parse(await fs.readFile(backup, 'utf8')).settings.directoryPrefix, 'original');
  });
});

test('cleanup moves the task folder into the trash instead of deleting it', () => fixture(async ({ store, root, base }) => {
  await store.saveSettings({ rootDirectory: root });
  const record = await store.createDirectory({ atMs: Date.UTC(2026, 0, 2, 3, 4, 5) });
  await fs.writeFile(path.join(record.path, 'result.txt'), 'keep me');
  await store.removeDirectory(record.id);

  await assert.rejects(fs.stat(record.path), { code: 'ENOENT' });
  const trashed = path.join(base, 'trash', path.basename(record.path));
  assert.equal(await fs.readFile(path.join(trashed, 'result.txt'), 'utf8'), 'keep me');
  assert.equal((await store.get(record.id)).phase, 'files-deleted');
}));

test('a trashing failure is reported and deletes nothing', () => fixture(async ({ stateDir, root }) => {
  const failing = new ScratchStore({
    stateDir,
    trash: async () => { throw new Error('trash unavailable'); },
  });
  await failing.init();
  await failing.saveSettings({ rootDirectory: root });
  const record = await failing.createDirectory({ atMs: Date.UTC(2026, 0, 2, 3, 4, 6) });
  await fs.writeFile(path.join(record.path, 'result.txt'), 'still here');

  await assert.rejects(failing.removeDirectory(record.id), /trash unavailable/);
  assert.equal(await fs.readFile(path.join(record.path, 'result.txt'), 'utf8'), 'still here');
  assert.equal((await failing.get(record.id)).phase, 'created');
}));

test('the same folder name can be trashed twice without overwriting', () => fixture(async ({ base }) => {
  const { moveToTrash } = await import('./trash.js');
  const make = async parent => {
    const dir = path.join(base, parent, 'same');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'who.txt'), parent);
    return dir;
  };
  const first = await moveToTrash(await make('one'));
  const second = await moveToTrash(await make('two'));

  assert.equal(path.dirname(first.location), path.join(base, 'trash'));
  assert.equal(path.basename(first.location), 'same');
  assert.equal(path.basename(second.location), 'same 2');
  assert.equal(await fs.readFile(path.join(first.location, 'who.txt'), 'utf8'), 'one');
  assert.equal(await fs.readFile(path.join(second.location, 'who.txt'), 'utf8'), 'two');
}));
