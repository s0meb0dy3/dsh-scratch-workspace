import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserHandler} from './user-api.js';
const signal=new AbortController().signal;
const owner={principal:{kind:'owner'},interactions:'answer'};
test('user dispatcher separates auto consent from stored settings',async()=>{
 let observed;
 const handle=createUserHandler({configure:async(patch,options)=>{observed={patch,options};return patch;}});
 const result=await handle('configure',{autoCleanupEnabled:true,idleHours:24,autoCleanupConsent:true},signal,owner);
 assert.equal(result.ok,true);assert.deepEqual(observed,{patch:{autoCleanupEnabled:true,idleHours:24},options:{user:true,autoCleanupConsent:true}});
 await handle('configure',{autoCleanupEnabled:true,autoCleanupConsent:'true'},signal,owner);assert.equal(observed.options.autoCleanupConsent,false);
});
test('noninteractive or missing peer cannot configure or delete',async()=>{
 const handle=createUserHandler({configure:()=>assert.fail('no authority'),complete:()=>assert.fail('no authority')});
 for(const peer of [undefined,{principal:{kind:'owner'},interactions:'none'},{principal:{kind:'other'},interactions:'answer'}])for(const method of ['configure','complete'])assert.equal((await handle(method,{id:'x'},signal,peer)).ok,false);
});
test('timer sweep is not a user endpoint and arbitrary payload never grants auto deletion',async()=>{
 let received;const handle=createUserHandler({complete:async(...args)=>{received=args;return{completed:true};}});
 assert.equal((await handle('sweep',{},signal,owner)).ok,false);
 assert.equal((await handle('complete',{id:'task',automatic:true,autoCleanupConsent:true},signal,owner)).ok,true);
 assert.deepEqual(received,['task',{user:true}]);
});
test('aborted user action returns failure without side effects',async()=>{
 const controller=new AbortController();controller.abort();const handle=createUserHandler({create:()=>assert.fail('aborted')});
 assert.equal((await handle('create',{},controller.signal,owner)).ok,false);
});
