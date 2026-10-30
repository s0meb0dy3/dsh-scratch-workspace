import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { ScratchStore } from './core.js';
import { ScratchService } from './service.js';
import { restoreActivity, ACTIVITY_EVENTS } from './activity.js';
import { createUserHandler } from './user-api.js';

export const inject = ['connection','webServer','workspaceRegistry','sessionController','sessionPersistence','sessions','workingDirectory','tools','terminalController','timer'];
export async function apply(ctx) {
  const identity = process.env.DSH_PROFILE_DIR || process.env.DSH_PROFILE || 'default';
  const hash = createHash('sha256').update(identity).digest('hex').slice(0,12);
  const store = new ScratchStore({stateDir:path.join(os.homedir(),'.local','share','deepseek-harness','scratch-workspace',hash)});
  const service = await new ScratchService(ctx,store,{restoreActivity:record=>restoreActivity(ctx,record)}).init();
  await service.refreshBlockedPaths();
  ctx.effect(()=>ctx.provide('scratchWorkspace',service),'scratch-workspace: service');
  ctx.on('connection/request', (req,res,next)=>service.requestGate(req,res,next));
  const recordActivity=(id,time)=>{service.noteActivity(id,time).catch(error=>ctx.logger.warn(`scratch activity: ${error.message}`));};
  ctx.on('session/event',(session,event)=>{if(ACTIVITY_EVENTS.has(event.type))recordActivity(session.id,event.time);});
  ctx.on('agent/status',({agent,status})=>{if(status==='running'||status==='idle')recordActivity(agent.id,Date.now());});
  const sweep=()=>service.sweep().catch(error=>ctx.logger.warn(`scratch cleanup: ${error.message}`));
  const stopSweep=ctx.interval(sweep,60000);
  const firstSweep=ctx.timeout(sweep,1000);
  ctx.effect(()=>async()=>{stopSweep();firstSweep();await service.close();},'scratch-workspace: scheduler lifetime');
  ctx.on('agent/pre-step', async ({agent},next) => service.isBlocked(agent) ? {kind:'reject'} : next());
  ctx.effect(()=>ctx.tools.guard(exec => exec.agent && service.isBlocked(exec.agent) ? '临时工作区正在清理或已完成，禁止继续执行工具。' : undefined),'scratch-workspace: cleanup fence');
  const handle = createUserHandler(service);
  // Primary: the canonical Connection RPC channel. It is transport aware, so the
  // Desktop shell carrier and the browser HTTP carrier both reach it, and the
  // Host's own admission fence authenticates the caller.
  let channelRegistered = false;
  try {
    ctx.effect(()=>ctx.connection.rpc.handle('/scratch-workspace', handle),'scratch-workspace: rpc channel');
    channelRegistered = true;
  } catch (error) {
    ctx.logger.warn(`scratch-workspace: RPC channel unavailable, falling back to HTTP route: ${error.message}`);
  }
  if (!channelRegistered) {
    const webServer=ctx.webServer;
    ctx.effect(()=>webServer.register({kind:'prefix',path:'/scratch-workspace',handler:async(req,res)=>{
      const admission=ctx.connection.admit(req);
      if ('rejection' in admission) {res.writeHead(admission.rejection);res.end();return;}
      if(req.method!=='POST'||!String(req.headers['content-type']||'').startsWith('application/json')){res.writeHead(415);res.end();return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{res.writeHead(400);res.end();return;}
      const expected=new URL(req.url,'http://localhost').pathname.slice('/scratch-workspace/'.length);
      if(body?.type!=='client-request'||typeof body.rpcId!=='string'||body.method!==expected){res.writeHead(400);res.end();return;}
      const result=await handle(body.method,body.payload,new AbortController().signal,admission.peer);
      res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({type:'server-response',rpcId:body.rpcId,result}));
    }}),'scratch-workspace: authenticated user route (fallback)');
  }
  ctx.effect(()=>ctx.tools.register({
    name:'scratch_workspace',
    description:'Inspect temporary workspace settings and task identifiers, configure the root directory/prefix, or create an empty temporary workspace and session. Creation does not switch this agent’s directory. Completion/deletion and changing deletion confirmation are user-only UI actions.',
    deferLoading:true,
    parameters:{type:'object',properties:{action:{type:'string',enum:['status','configure','create']},rootDirectory:{type:'string',description:'For configure: absolute path or ~/ path; empty clears configuration.'},directoryPrefix:{type:'string',description:'For configure: one safe folder-name prefix, 1–40 letters, digits, underscores or hyphens.'}},required:['action'],additionalProperties:false},
    output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
    execute:async args=>{
      if (args.action === 'status') return service.status();
      if (args.action === 'create') return service.create();
      if (args.action === 'configure') {
        const patch = {};
        if (args.rootDirectory !== undefined) patch.rootDirectory=args.rootDirectory;
        if (args.directoryPrefix !== undefined) patch.directoryPrefix=args.directoryPrefix;
        return service.configure(patch);
      }
      throw new Error('未知操作。');
    },
  }),'scratch-workspace: agent operations');
}
