import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ScratchStore} from './core.js';
import {ScratchService} from './service.js';
const HOUR=3600000;
async function fixture(fn) {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dsh-scratch-auto-')));process.env.DSH_SCRATCH_TRASH_DIR=path.join(base,'trash');
  const stateDir=path.join(base,'state'),root=path.join(base,'root');
  let now=Date.parse('2026-10-29T00:00:00.000Z'),counter=0,failDelete=false,activityHook;
  const live=new Map(),headers=new Map(),workspaces=new Map(),busy=new Set(),terminalRows=new Map(),archived=new Set();
  const ctx={
    get:name=>name==='terminalController'?{list:sid=>terminalRows.get(sid)||[]}:undefined,
    sessions:{get:id=>live.get(id),list:()=>[...live.values()]},workingDirectory:{get:s=>s.cwd||s.header.cwd},
    sessionPersistence:{list:async()=>[...headers.values()].map(header=>({header}))},
    workspaceRegistry:{create:async p=>{const w={id:`w${++counter}`,path:p};workspaces.set(w.id,w);return w;},get:id=>workspaces.get(id),list:()=>[...workspaces.values()],delete:async id=>{if(failDelete)throw new Error('registry failed');return workspaces.delete(id);},archiveSession:async sid=>archived.add(sid),unarchiveSession:async sid=>archived.delete(sid)},
    sessionController:{create:async({workspaceId})=>{const sessionId=`s${++counter}`,header={id:sessionId,cwd:workspaces.get(workspaceId).path};headers.set(sessionId,header);live.set(sessionId,{id:sessionId,header});return {sessionId};}},
    waterfall:async(_event,{sessionId})=>{await activityHook?.(sessionId);return busy.has(sessionId)?[{kind:'agent'}]:[];},
  };
  const clock={now:()=>now};const store=new ScratchStore({stateDir});
  const service=await new ScratchService(ctx,store,{clock}).init();await service.configure({rootDirectory:root});
  const restart=async(restoreActivity)=>{await service.close();return new ScratchService(ctx,new ScratchStore({stateDir}),{clock,restoreActivity}).init();};
  try{await fn({base,stateDir,root,ctx,clock,store,service,live,headers,workspaces,busy,terminalRows,archived,restart,setNow:v=>now=v,advance:v=>now+=v,setFailDelete:v=>failDelete=v,setActivityHook:v=>activityHook=v});}
  finally{await service.close();assert.ok(path.isAbsolute(base)&&path.dirname(base)===await fs.realpath(os.tmpdir())&&path.basename(base).startsWith('dsh-scratch-auto-'));assert.equal(await fs.realpath(base),base);await fs.rm(base,{recursive:true,force:true});}
}
const enable=service=>service.configure({autoCleanupEnabled:true,idleHours:1},{user:true,autoCleanupConsent:true});
const exists=async p=>{try{return (await fs.stat(p)).isDirectory();}catch(e){if(e.code==='ENOENT')return false;throw e;}};

test('settings defaults, range and user-only consent gates',()=>fixture(async({service,store})=>{
 assert.deepEqual(await store.getSettings(),{rootDirectory:(await store.getSettings()).rootDirectory,directoryPrefix:'task',confirmDelete:true,autoCleanupEnabled:false,idleHours:24});
 for(const patch of [{autoCleanupEnabled:true},{idleHours:5}])await assert.rejects(service.configure(patch),/用户/);
 await assert.rejects(service.configure({autoCleanupEnabled:true},{user:true}),/确认/);
 await service.configure({idleHours:12},{user:true});await enable(service);
 await assert.rejects(service.configure({idleHours:2},{user:true}),/确认/);
 await service.configure({idleHours:2},{user:true,autoCleanupConsent:true});
 for(const idleHours of [0,8761,1.1,'24',null,NaN])await assert.rejects(store.saveSettings({idleHours}),/integer/);
 for(const autoCleanupEnabled of [1,'false',null])await assert.rejects(store.saveSettings({autoCleanupEnabled}),/boolean/);
 await service.configure({autoCleanupEnabled:false},{user:true});
}));
test('disabled policy never deletes; settings only affect future immutable task policy',()=>fixture(async({service,store,advance})=>{
 const manual=await service.create();await enable(service);const automatic=await service.create();
 await service.configure({autoCleanupEnabled:false,idleHours:48},{user:true});
 assert.deepEqual((await store.get(manual.id)).cleanupPolicy,{enabled:false,idleHours:24});
 assert.deepEqual((await store.get(automatic.id)).cleanupPolicy,{enabled:true,idleHours:1});
 await assert.rejects(store.updateRecord(manual.id,{cleanupPolicy:{enabled:true,idleHours:1}}),/immutable/);
 advance(HOUR);const result=await service.sweep();assert.deepEqual(result.completed,[automatic.id]);assert.ok(await exists(manual.path));
}));
test('legacy migration never inherits enabled global setting and preserves deletion journal',()=>fixture(async({store,stateDir,service})=>{
 const r=await service.create();await service.close();const file=path.join(stateDir,'tasks.json');const data=JSON.parse(await fs.readFile(file,'utf8'));
 data.settings.autoCleanupEnabled=true;delete data.tasks[0].cleanupPolicy;delete data.tasks[0].lastActivityAt;await fs.writeFile(file,JSON.stringify(data));
 const restored=await new ScratchStore({stateDir}).init();const old=await restored.get(r.id);assert.deepEqual(old.cleanupPolicy,{enabled:false,idleHours:24});assert.equal(old.lastActivityAt,old.createdAt);await restored.removeDirectory(r.id);assert.equal(await exists(r.path),false);
}));
test('idle deadline is inclusive and status exposes policy and activity',()=>fixture(async({service,advance})=>{
 await enable(service);const r=await service.create();advance(HOUR-1);assert.deepEqual((await service.sweep()).completed,[]);assert.ok(await exists(r.path));
 const state=await service.status();assert.equal(state.tasks[0].cleanupPolicy.idleHours,1);assert.equal(state.tasks[0].cleanupIssue,null);
 advance(1);assert.deepEqual((await service.sweep()).completed,[r.id]);assert.equal(await exists(r.path),false);
}));
test('synchronous main and original/current child cwd activity resets deadline, writes are throttled',()=>fixture(async({service,store,live,advance,clock,base})=>{
 await enable(service);const r=await service.create();let writes=0;const original=store.updateRecord.bind(store);store.updateRecord=async(...args)=>{writes++;return original(...args);};
 advance(1000);await service.noteActivity(r.sessionId);await service.noteActivity(r.sessionId);assert.equal(writes,0);
 assert.equal(Date.parse((await service.status()).tasks[0].lastActivityAt),clock.now());
 advance(HOUR-1000);await service.sweep();assert.ok(await exists(r.path));
 const child={id:'child',header:{id:'child',origin:'subagent',cwd:r.path},cwd:base};live.set('child',child);
 await service.noteActivity('child');assert.equal(Date.parse((await service.status()).tasks[0].lastActivityAt),clock.now());
 child.header.cwd=base;child.cwd=path.join(r.path,'sub');advance(1000);await service.noteActivity('child');advance(HOUR);assert.deepEqual((await service.sweep()).completed,[r.id]);
}));
test('new activity during authorization IO cancels rm and thaws unstarted auto cleanup',()=>fixture(async({service,store,advance,archived})=>{
 await enable(service);const r=await service.create();advance(HOUR);
 const persist=store._persist.bind(store);let injected=false;
 store._persist=async next=>{await persist(next);if(next.deletionAuthorizations.length&&!injected){injected=true;service.noteActivity(r.sessionId);}};
 const result=await service.sweep();assert.equal(result.completed.length,0);assert.ok(await exists(r.path));assert.equal((await store.get(r.id)).phase,'active');assert.equal(service.isBlocked({id:r.sessionId}),false);assert.equal(archived.has(r.sessionId),false);
}));
test('busy task and PTY skip without freezing; full idle starts after observed work ends',()=>fixture(async({service,store,busy,terminalRows,advance})=>{
 await enable(service);const r=await service.create();advance(HOUR);busy.add(r.sessionId);await service.sweep();assert.equal((await store.get(r.id)).phase,'active');assert.equal(service.isBlocked({id:r.sessionId}),false);
 advance(3*HOUR);busy.clear();terminalRows.set(r.sessionId,[{cwd:r.path,state:'running'}]);await service.sweep();assert.ok(await exists(r.path));terminalRows.clear();advance(HOUR);await service.sweep();assert.ok(await exists(r.path));advance(HOUR);assert.deepEqual((await service.sweep()).completed,[r.id]);
}));
test('missing terminal provider fails closed and does not freeze',()=>fixture(async({service,ctx,store,advance})=>{
 await enable(service);const r=await service.create();ctx.get=()=>undefined;advance(HOUR);await service.sweep();assert.ok(await exists(r.path));assert.equal((await store.get(r.id)).phase,'active');assert.equal(service.isBlocked({id:r.sessionId}),false);
}));
test('sessions inside the folder are archived with it; a nested workspace refuses automatic deletion',()=>fixture(async({service,store,headers,workspaces,advance,archived})=>{
 await enable(service);const r=await service.create();headers.set('shared',{id:'shared',cwd:r.path});advance(HOUR);await service.sweep();assert.equal((await store.get(r.id)).phase,'completed');assert.ok(archived.has('shared'));assert.equal(await exists(r.path),false);
 const second=await service.create();workspaces.set('nested',{id:'nested',path:path.join(second.path,'nested')});advance(HOUR);await service.sweep();assert.ok(await exists(second.path));assert.equal(service.isBlocked({id:second.sessionId}),false);
}));
test('restart without recovery resets timer; trusted recovery allows already overdue cleanup',()=>fixture(async({service,store,restart,ctx,stateDir,clock,advance})=>{
 await enable(service);const r=await service.create();const created=Date.parse((await store.get(r.id)).lastActivityAt);advance(2*HOUR);
 const conservative=await restart();await conservative.sweep();assert.ok(await exists(r.path));await conservative.close();
 const recovered=await new ScratchService(ctx,new ScratchStore({stateDir}),{clock,restoreActivity:async()=>created}).init();
 // Conservative restart already persisted its new activity, so it cannot be undone by stale recovery.
 await recovered.sweep();assert.ok(await exists(r.path));advance(HOUR);assert.deepEqual((await recovered.sweep()).completed,[r.id]);await recovered.close();
}));
test('startup restored overdue task cleans immediately without artificial idle reset',()=>fixture(async({service,store,ctx,stateDir,clock,advance})=>{
 await enable(service);const r=await service.create();const created=Date.parse((await store.get(r.id)).lastActivityAt);await service.close();advance(2*HOUR);
 const restored=await new ScratchService(ctx,new ScratchStore({stateDir}),{clock,restoreActivity:async()=>created}).init();assert.equal(Date.parse((await restored.status()).tasks[0].lastActivityAt),created);assert.deepEqual((await restored.sweep()).completed,[r.id]);assert.equal(await exists(r.path),false);await restored.close();
}));
test('not-yet-due sweep avoids locks, Host activity scans and repeated recovery',()=>fixture(async({service,ctx})=>{
 await enable(service);await service.create();ctx.sessionPersistence.list=async()=>assert.fail('must not scan before due');service.restoreActivity=async()=>assert.fail('must not restore before due');service.lockApi=async()=>assert.fail('must not lock before due');assert.equal((await service.sweep()).completed.length,0);
}));
test('recovery callback failure skips with backoff and no freeze; later successful recovery retries',()=>fixture(async({service,ctx,stateDir,clock,store,advance})=>{
 await enable(service);const r=await service.create();const created=Date.parse((await store.get(r.id)).lastActivityAt);await service.close();advance(2*HOUR);let fail=true;
 const restored=await new ScratchService(ctx,new ScratchStore({stateDir}),{clock,restoreActivity:async()=>{if(fail)throw new Error('unreadable log');return created;}}).init();
 await restored.sweep();assert.ok(await exists(r.path));assert.equal((await restored.store.get(r.id)).phase,'active');assert.equal(restored.isBlocked({id:r.sessionId}),false);assert.match((await restored.status()).tasks[0].cleanupIssue,/unreadable/);
 fail=false;advance(600000);assert.deepEqual((await restored.sweep()).completed,[r.id]);await restored.close();
}));
test('automatic failures persist provenance and ten minute retry; manual failures are never swept',()=>fixture(async({service,store,advance,setFailDelete})=>{
 await enable(service);const r=await service.create();advance(HOUR);setFailDelete(true);const result=await service.sweep();assert.equal(result.failed.length,1);let record=await store.get(r.id);assert.equal(record.phase,'auto-error');assert.ok(record.cleanupRetryAt);assert.equal(await exists(r.path),false);
 setFailDelete(false);assert.equal((await service.sweep()).completed.length,0);advance(600000);assert.deepEqual((await service.sweep()).completed,[r.id]);
 const manual=await service.create();setFailDelete(true);await assert.rejects(service.complete(manual.id,{user:true}),/清理未完成/);assert.equal((await store.get(manual.id)).phase,'error');setFailDelete(false);advance(2*HOUR);assert.equal((await service.sweep()).completed.includes(manual.id),false);
}));
test('automatic partial deletion failure recovers its journal after restart',()=>fixture(async({service,store,ctx,stateDir,clock,advance})=>{
 await enable(service);const r=await service.create();const created=Date.parse((await store.get(r.id)).lastActivityAt);advance(HOUR);const remove=store._removeAuthorizedDirectory.bind(store);
 store._removeAuthorizedDirectory=async record=>{const marker=path.join(record.path,'.dsh-scratch-owner.json');assert.equal(path.dirname(marker),r.path);await fs.unlink(marker);throw new Error('partial rm failure');};
 await service.sweep();assert.equal((await store.get(r.id)).phase,'auto-error');assert.ok(await exists(r.path));store._removeAuthorizedDirectory=remove;await service.close();advance(600000);
 const restored=await new ScratchService(ctx,new ScratchStore({stateDir}),{clock,restoreActivity:async()=>created}).init();assert.deepEqual((await restored.sweep()).completed,[r.id]);assert.equal(await exists(r.path),false);await restored.close();
}));
test('automatic and manual concurrency serialize; sweep is non-reentrant',()=>fixture(async({service,advance})=>{
 await enable(service);const r=await service.create();advance(HOUR);const first=service.sweep(),second=service.sweep();assert.equal(first,second);const manual=service.complete(r.id,{user:true});await first;assert.equal((await manual).completed,true);assert.equal(await exists(r.path),false);
 await assert.rejects(service.complete(r.id,{automatic:true}),/用户/);await assert.rejects(service._complete(r.id,{automatic:true}),/用户/);
}));
test('close cancels queued sweep before any removal',()=>fixture(async({service,advance})=>{
 await enable(service);const r=await service.create();advance(HOUR);let release;const held=new Promise(resolve=>release=resolve);const work=service.serial(()=>held);const sweeping=service.sweep();const closing=service.close();release();await work;assert.deepEqual((await sweeping).completed,[]);await closing;assert.ok(await exists(r.path));
}));
test('close during deletion authorization cancels unstarted automatic and manual removal',async()=>{
 for(const manual of [false,true])await fixture(async({service,store,advance,archived})=>{
  await enable(service);const r=await service.create();advance(HOUR);let release,entered;const paused=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);const persist=store._persist.bind(store);let once=false;
  store._persist=async next=>{await persist(next);if(!once&&next.deletionAuthorizations.length){once=true;entered();await held;}};
  const operation=manual?service.complete(r.id,{user:true}):service.sweep();const result=operation.then(value=>({value}),error=>({error}));await paused;const closing=service.close();release();const outcome=await result;await closing;
  assert.ok(await exists(r.path));assert.equal((await store.get(r.id)).phase,'active');assert.equal(service.isBlocked({id:r.sessionId}),false);assert.equal(archived.has(r.sessionId),false);
  if(manual)assert.equal(outcome.error.code,'SCRATCH_CLOSED');else assert.deepEqual(outcome.value.completed,[]);
 });
});
test('close drains admitted sweep and event writes, rejects new operations',()=>fixture(async({service,store,advance,clock})=>{
 await enable(service);const r=await service.create();advance(2000);await service.noteActivity(r.sessionId);const closing=service.close();await closing;assert.equal(Date.parse((await store.get(r.id)).lastActivityAt),clock.now());await assert.rejects(service.create(),/closed/);await assert.rejects(service.sweep(),/closed/);await service.noteActivity(r.sessionId);assert.equal(await exists(r.path),true);
}));
