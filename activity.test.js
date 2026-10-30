import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreActivity} from './activity.js';
const record={sessionId:'main',path:'/tmp/task',createdAt:'2026-01-01T00:00:00.000Z',lastActivityAt:'2026-01-01T00:00:00.000Z'};
const base=Date.parse(record.createdAt);
function context({snapshots,live=[],logs={},error=false}) {
 let reads=0,closes=0;
 return {ctx:{sessionPersistence:{list:async()=>snapshots,open:async(id,access)=>{assert.equal(access,'read');if(error)throw Error('storage unavailable');return{read:async(offset=0,length)=>{reads++;return{events:logs[id].slice(offset,length===undefined?undefined:offset+length)};},close:async()=>{closes++;}};}},sessions:{list:()=>live,get:id=>live.find(s=>s.id===id)},workingDirectory:{get:s=>s.header.cwd}},reads:()=>reads,closes:()=>closes};
}
test('activity recovery reads live recorded history without persistence activation',async()=>{
 const live=[{id:'main',header:{id:'main',cwd:'/tmp/task'},snapshotEvents:()=>[{type:'user/message',time:base+1000},{type:'request/header',time:base+2000}]}];
 const x=context({snapshots:[{header:live[0].header}],live});assert.equal(await restoreActivity(x.ctx,record),base+1000);assert.equal(x.reads(),0);
});
test('activity recovery scans bounded tail pages and includes nested subagent',async()=>{
 const logs={main:[...Array.from({length:200},(_,i)=>({type:'request/header',time:base+i})),{type:'turn/end',time:base+5000}],child:[{type:'tool/result',time:base+9000}],unrelated:[{type:'turn/end',time:base+99999}]};
 const snapshots=Object.keys(logs).map(id=>({header:{id,cwd:id==='main'?'/tmp/task':id==='child'?'/tmp/task/nested':'/tmp/task-other',origin:id==='child'?'subagent':undefined},eventCount:logs[id].length}));
 const x=context({snapshots,logs});assert.equal(await restoreActivity(x.ctx,record),base+9000);assert.equal(x.reads(),2);assert.equal(x.closes(),2);
});
test('activity read failure propagates rather than authorizing cleanup',async()=>{
 const x=context({snapshots:[{header:{id:'main',cwd:'/tmp/task'},eventCount:1}],error:true});await assert.rejects(restoreActivity(x.ctx,record),/storage/);
 const y=context({snapshots:[]});await assert.rejects(restoreActivity(y.ctx,record),/Cannot verify/);
});
test('activity recovery closes handles even when reading fails',async()=>{
 let closed=false;const ctx={sessionPersistence:{list:async()=>[{header:{id:'main',cwd:'/tmp/task'},eventCount:1}],open:async()=>({read:async()=>{throw Error('read failed');},close:async()=>closed=true})},sessions:{list:()=>[],get:()=>undefined},workingDirectory:{get:()=>''}};
 await assert.rejects(restoreActivity(ctx,record),/read failed/);assert.equal(closed,true);
});
