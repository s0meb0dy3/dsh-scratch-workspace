import path from 'node:path';
import * as fs from 'node:fs/promises';

// Deliberately module-private: neither RPC/tool payloads nor a boolean option can
// grant automatic deletion. Only sweep() can enter this path.
const AUTOMATIC = Symbol('automatic-cleanup');
const AUTO_PHASES = new Set(['active','auto-error','auto-completing']);
const SAFE_PHASES = new Set(['created','active']);
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const issue = message => Object.assign(new Error(message), {code:'SCRATCH_BUSY'});

export class ScratchService {
  constructor(ctx, store, {clock = {now:()=>Date.now()}, restoreActivity, activityPersistMs=60000, retryMs=600000} = {}) {
    this.ctx=ctx; this.store=store; this.clock=clock; this.restoreActivity=restoreActivity;
    this.activityPersistMs=activityPersistMs; this.retryMs=retryMs;
    this.queue=Promise.resolve(); this.blocked=new Set(); this.blockedPaths=[];
    this.apiRequests=0; this.apiLocked=false; this.apiDrainers=new Set();
    this.records=new Map(); this.latestActivity=new Map(); this.persistedActivity=new Map(); this.titleCache=new Map();
    this.busyTasks=new Set(); this.restoreFailures=new Map(); this.closed=false; this.sweepPromise=null;
  }
  serial(fn) {
    if(this.closed) return Promise.reject(new Error('Temporary workspace service is closed'));
    const p=this.queue.then(fn); this.queue=p.catch(()=>{}); return p;
  }
  async drain() { for (;;) {const p=this.queue;await p;if(p===this.queue)break;} }
  close() {
    if(this.closePromise)return this.closePromise;
    this.closed=true;
    this.closePromise=(async()=>{await this.drain();await this._flushActivities();})();
    return this.closePromise;
  }
  async _update(id, patch) {
    const record=await this.store.updateRecord(id,patch);this.records.set(id,record);return record;
  }
  async init() {
    await this.store.init();
    for(const r of await this.store.list()) {
      this.records.set(r.id,r);this.latestActivity.set(r.id,time(r.lastActivityAt));this.persistedActivity.set(r.id,time(r.lastActivityAt));
      if(!SAFE_PHASES.has(r.phase) && r.sessionId)this.blocked.add(r.sessionId);
      if(r.cleanupPolicy.enabled&&AUTO_PHASES.has(r.phase)) {
        try {
          const recovered=this.restoreActivity?await this.restoreActivity(r):this.clock.now();
          if(!Number.isFinite(recovered))throw new Error('Activity recovery did not return a timestamp');
          const latest=Math.max(time(r.lastActivityAt),recovered);
          this.latestActivity.set(r.id,latest);
          if(latest>time(r.lastActivityAt)){await this._update(r.id,{lastActivityAt:new Date(latest).toISOString()});this.persistedActivity.set(r.id,latest);}
        } catch(error) {this.restoreFailures.set(r.id,String(error.message||error));}
      }
    }
    await this.refreshBlockedPaths();return this;
  }
  contains(root,value) {
    if(typeof value!=='string'||!path.isAbsolute(value))return false;
    const rel=path.relative(root,value);return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));
  }
  _belongs(record,sessionId) {
    if(record.sessionId===sessionId)return true;
    const s=this.ctx.sessions.get(sessionId);if(!s)return false;
    return this.contains(record.path,s.header?.cwd)||this.contains(record.path,this.ctx.workingDirectory.get(s));
  }
  noteActivity(sessionId,atMs=this.clock.now()) {
    if(this.closed||!Number.isFinite(atMs))return Promise.resolve();
    // This runs synchronously before any queued I/O: an admitted event cannot
    // lose a race to an already queued sweep's deadline check.
    let due=false;
    try {
      for(const r of this.records.values()) {
        if(r.phase==='completed'||!this._belongs(r,sessionId))continue;
        const latest=Math.max(this.latestActivity.get(r.id)||0,atMs);
        this.latestActivity.set(r.id,latest);
        if(latest-(this.persistedActivity.get(r.id)||0)>=this.activityPersistMs)due=true;
      }
    } catch(error) { return Promise.reject(error); }
    return due?this.serial(()=>this._flushActivities()):Promise.resolve();
  }
  async _flushActivities() {
    for(const [id,latest] of this.latestActivity) {
      if(latest>(this.persistedActivity.get(id)||0)) {
        await this._update(id,{lastActivityAt:new Date(latest).toISOString()});
        this.persistedActivity.set(id,latest);
      }
    }
  }
  async status() {
    return {settings:await this.store.getSettings(),tasks:(await this.store.list()).map(r=>({
      id:r.id,path:r.path,workspaceId:r.workspaceId,sessionId:r.sessionId,phase:r.phase,lastError:r.lastError,
      cleanupPolicy:r.cleanupPolicy,lastActivityAt:new Date(Math.max(time(r.lastActivityAt),this.latestActivity.get(r.id)||0)).toISOString(),
      cleanupRetryAt:r.cleanupRetryAt||null,cleanupIssue:this.restoreFailures.get(r.id)||r.lastError||null,
    }))};
  }
  configure(patch,{user=false,autoCleanupConsent=false}={}) {
    if(!user&&['confirmDelete','autoCleanupEnabled','idleHours'].some(key=>Object.hasOwn(patch,key)))return Promise.reject(new Error('删除确认和自动清理设置只能由用户在设置页修改。'));
    return this.serial(async()=>{
      const old=await this.store.getSettings();const next={...old,...patch};
      if(next.autoCleanupEnabled&&(!old.autoCleanupEnabled||next.idleHours!==old.idleHours)&&autoCleanupConsent!==true)throw new Error('启用自动清理或修改已启用的时长前，需要用户确认永久删除授权。');
      return this.store.saveSettings(patch);
    });
  }
  /** Measured size of one task folder, bounded so a huge tree cannot stall the UI.
   * Symlinks are counted as links and never followed. */
  async usage(id,{budgetMs=2500,maxEntries=200000}={}) {
    const r=await this.store.get(id);if(!r)return null;
    const started=Date.now();let bytes=0,files=0,dirs=0,truncated=false;
    const stack=[r.path];
    while(stack.length){
      if(Date.now()-started>budgetMs||files+dirs>maxEntries){truncated=true;break;}
      const current=stack.pop();let entries;
      try{entries=await fs.readdir(current,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
      for(const entry of entries){
        const target=path.join(current,entry.name);
        if(entry.isSymbolicLink()){files++;continue;}
        if(entry.isDirectory()){dirs++;stack.push(target);continue;}
        try{const info=await fs.lstat(target);bytes+=info.size;files++;}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }
    return {bytes,files,dirs,truncated};
  }
  /** Sessions that belong to one temporary workspace, with their titles.
   * Membership comes from the workspace registration plus any session whose
   * directory sits inside the folder (extra sessions created by hand). */
  async sessionsOf(id) {
    const r=await this.store.get(id);if(!r)return [];
    const ids=[];
    const workspace=r.workspaceId?this.ctx.workspaceRegistry.get(r.workspaceId):undefined;
    for(const sessionId of workspace?.sessionIds||[])ids.push(sessionId);
    if(r.sessionId)ids.push(r.sessionId);
    for(const s of this.ctx.sessions.list())if(this.contains(r.path,this.ctx.workingDirectory.get(s))||this.contains(r.path,s.header?.cwd))ids.push(s.id);
    const unique=[...new Set(ids)];
    const result=[];
    for(const sessionId of unique){
      if(!(workspace?.sessionIds||[]).includes(sessionId)&&sessionId!==r.sessionId&&!this.ctx.sessions.get(sessionId))continue;
      result.push({sessionId,title:await this._titleOf(sessionId),running:this.ctx.sessions.get(sessionId)?this.blocked.has(sessionId):false});
    }
    return result;
  }
  async _titleOf(sessionId) {
    const cached=this.titleCache.get(sessionId);
    if(cached&&this.clock.now()-cached.at<30000)return cached.title;
    const newest=(events)=>{let title=null;for(const event of events)if(event.type==='session/title')title=event.data?.title??event.data?.text??title;return typeof title==='string'&&title.trim()?title.trim():null;};
    let title=null;
    const live=this.ctx.sessions.get(sessionId);
    if(live)title=newest(live.snapshotEvents());
    else {
      const handle=await this.ctx.sessionPersistence.open(sessionId,'read');
      try{title=newest((await handle.read()).events);}finally{await handle.close();}
    }
    this.titleCache.set(sessionId,{title,at:this.clock.now()});
    return title;
  }
  /** Why this task could not be cleaned up right now (or that it is idle).
   * Reuses the same signals the cleanup path uses, so the list and the gate agree. */
  async taskState(id) {
    const r=await this.store.get(id);if(!r)return {state:'missing'};
    const ids=new Set(r.sessionId?[r.sessionId]:[]);
    for(const s of this.ctx.sessions.list())if(this._belongs(r,s.id))ids.add(s.id);
    const terminals=this.ctx.get?.('terminalController');
    if(!terminals)return {state:'unknown',reason:'无法检查终端占用'};
    let terminal=false;
    const known=new Set([...this.ctx.sessions.list().map(s=>s.id),...ids]);
    for(const sid of known)if(terminals.list(sid).some(info=>ids.has(sid)||this.contains(r.path,info.cwd)))terminal=true;
    if(terminal)return {state:'terminal'};
    for(const sessionId of ids){
      const busy=await this.ctx.waterfall('workspace/session-activity',{sessionId},async()=>[]);
      if(busy.length)return {state:'running'};
    }
    return {state:'idle'};
  }
  /** Reveal the task folder in the Host desktop file manager. The session
   * controller owns path verification and the platform-specific opener. */
  async reveal(id) {
    const r=await this.store.get(id);if(!r)throw new Error('临时任务不存在。');
    await fs.stat(r.path);
    // The Host API is signal-shaped: it reads `signal.aborted` immediately, so an
    // omitted argument throws instead of defaulting. Bound the native opener too.
    const signal=AbortSignal.timeout(15000);
    try{await this.ctx.sessionController.openWorkspacePath({path:r.path,action:'reveal'},signal);}
    catch(error){
      if(error?.name==='TimeoutError')throw new Error('打开目录超时，请稍后再试。');
      throw error;
    }
    return {revealed:true};
  }
  create() {
    return this.serial(async()=>{
      let r=await this.store.createDirectory({atMs:this.clock.now()});
      this.records.set(r.id,r);this.latestActivity.set(r.id,time(r.lastActivityAt));this.persistedActivity.set(r.id,time(r.lastActivityAt));
      try {
        const workspace=await this.ctx.workspaceRegistry.create(r.path,`临时 · ${r.directoryName}`);
        r=await this._update(r.id,{workspaceId:workspace.id});
        const value=await this.ctx.sessionController.create({workspaceId:workspace.id});
        r=await this._update(r.id,{sessionId:value.sessionId,phase:'active',lastError:null});
        return {id:r.id,path:r.path,workspaceId:r.workspaceId,sessionId:r.sessionId};
      } catch(error) {
        await this._update(r.id,{phase:'error',lastError:String(error.message||error)});
        throw new Error(`创建未完成，目录已保留，可从设置页重试清理：${error.message||error}`);
      }
    });
  }
  isBlocked(agent) {
    if(this.blocked.has(agent.id))return true;
    const s=this.ctx.sessions.get(agent.id);if(!s)return false;
    return this.blockedPaths.some(p=>this.contains(p,s.header?.cwd)||this.contains(p,this.ctx.workingDirectory.get(s)));
  }
  /** Which temporary task owns one session: its own recorded session first, then
   * any session whose directory sits inside a registered task folder. This lets
   * an extra hand-made session inside a temporary workspace offer the same
   * "complete" action instead of silently showing nothing. */
  async taskForSession(sessionId) {
    if(typeof sessionId!=='string')return null;
    const records=await this.store.list();
    const view=r=>({id:r.id,path:r.path,workspaceId:r.workspaceId,sessionId:r.sessionId,phase:r.phase,cleanupPolicy:r.cleanupPolicy});
    const direct=records.find(r=>r.sessionId===sessionId);
    if(direct)return view(direct);
    const s=this.ctx.sessions.get(sessionId);if(!s)return null;
    const cwds=[s.header?.cwd,this.ctx.workingDirectory.get(s)].filter(value=>typeof value==='string'&&value);
    const owner=records.find(r=>cwds.some(cwd=>this.contains(r.path,cwd)));
    return owner?view(owner):null;
  }
  async refreshBlockedPaths() {
    const records=await this.store.list();
    this.blocked=new Set(records.filter(r=>!SAFE_PHASES.has(r.phase)).map(r=>r.sessionId).filter(Boolean));
    this.blockedPaths=records.filter(r=>!SAFE_PHASES.has(r.phase)).map(r=>r.path);
  }
  async requestGate(_req,res,next) {
    if(this.apiLocked){res.writeHead(409,{'content-type':'text/plain; charset=utf-8'});res.end('Temporary workspace cleanup in progress; retry shortly.');return;}
    this.apiRequests++;
    try{return await next();}finally{this.apiRequests--;if(!this.apiRequests)for(const fn of [...this.apiDrainers])fn();}
  }
  async lockApi() {
    this.apiLocked=true;if(!this.apiRequests)return;
    try{await new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer);this.apiDrainers.delete(done);resolve();};
      const timer=setTimeout(()=>{this.apiDrainers.delete(done);reject(issue('其他界面操作尚未结束，请稍后重试完成。'));},5000);
      this.apiDrainers.add(done);
    });}catch(error){this.apiLocked=false;throw error;}
  }
  _deadline(record) {return Math.max(time(record.lastActivityAt),this.latestActivity.get(record.id)||0)+record.cleanupPolicy.idleHours*3600000;}
  async _restore(record) {
    if(!this.restoreActivity){if(this.restoreFailures.has(record.id))throw new Error(this.restoreFailures.get(record.id));return;}
    const value=await this.restoreActivity(record);
    if(!Number.isFinite(value))throw new Error('Activity recovery did not return a timestamp');
    this.restoreFailures.delete(record.id);
    this.latestActivity.set(record.id,Math.max(this.latestActivity.get(record.id)||0,value));
  }
  sweep() {
    if(this.closed)return Promise.reject(new Error('Temporary workspace service is closed'));
    if(this.sweepPromise)return this.sweepPromise;
    const pending=this.serial(async()=>{
      const result={completed:[],skipped:[],failed:[]};
      if(this.closed)return result;
      await this._flushActivities();
      for(const r of await this.store.list()) {
        if(this.closed)break;
        if(!r.cleanupPolicy.enabled||!AUTO_PHASES.has(r.phase))continue;
        if(time(r.cleanupRetryAt)>this.clock.now())continue;
        if(r.phase==='active'&&!this.busyTasks.has(r.id)&&this.clock.now()<this._deadline(r))continue;
        // A busy task is inspected again each sweep; observing the end starts a
        // full idle period instead of deleting immediately after long work.
        try {
          const value=await this._complete(r.id,{automatic:AUTOMATIC});
          result[value.completed?'completed':'skipped'].push(r.id);
        }catch(error){result.failed.push({id:r.id,error:String(error.message||error)});}
      }
      await this._flushActivities();return result;
    });
    this.sweepPromise=pending;
    pending.finally(()=>{if(this.sweepPromise===pending)this.sweepPromise=null;}).catch(()=>{});
    return pending;
  }
  complete(id,{user=false}={}) {
    if(!user)return Promise.reject(new Error('完成并删除只能由用户点击按钮执行。'));
    return this.serial(()=>this._complete(id,{user:true}));
  }
  async _complete(id,{user=false,automatic}={}) {
    const auto=automatic===AUTOMATIC;
    if(!auto&&!user)throw new Error('完成并删除只能由用户点击按钮执行。');
    const r=await this.store.get(id);if(!r)throw new Error('临时任务不存在。');
    if(r.phase==='completed')return {completed:true,sessionId:r.sessionId};
    if(auto&&(!r.cleanupPolicy.enabled||!AUTO_PHASES.has(r.phase)))throw new Error('Task has no automatic cleanup authorization');
    let committed=false,removed=false,archived=false;const archivedSiblings=[];
    const checkOpen=()=>{if(this.closed)throw Object.assign(new Error('临时工作区插件正在关闭，已取消尚未开始的清理。'),{code:'SCRATCH_CLOSED'});};
    const skip=async(message)=>{
      this.latestActivity.set(id,Math.max(this.latestActivity.get(id)||0,this.clock.now()));
      this.busyTasks.add(id);
      // Never thaw an already failed/partially deleted automatic cleanup.
      if(r.phase==='active')await this._update(id,{phase:'active',lastError:message,cleanupRetryAt:null});
      else await this._update(id,{phase:r.phase,lastError:message,cleanupRetryAt:new Date(this.clock.now()+this.retryMs).toISOString()});
      if(archived)await this.ctx.workspaceRegistry.unarchiveSession(r.sessionId);
      await this.refreshBlockedPaths();return {completed:false,skipped:true,reason:message};
    };
    try {
      checkOpen();
      // Lock before scanning shared sessions and terminal allocations.
      await this.lockApi();
      const headers=await this.ctx.sessionPersistence.list();
      // Sessions that merely live inside this temporary workspace are part of the
      // same temp task: they are archived with it rather than blocking cleanup. A
      // session running elsewhere but pointing into this folder still refuses.
      const siblings=new Set();
      for(const {header} of headers) {
        if(header.id===r.sessionId||header.origin==='subagent')continue;
        if(this.contains(r.path,header.cwd))siblings.add(header.id);
      }
      for(const s of this.ctx.sessions.list()) {
        if(s.id===r.sessionId||s.header.origin==='subagent')continue;
        if(this.contains(r.path,this.ctx.workingDirectory.get(s))||this.contains(r.path,s.header?.cwd))siblings.add(s.id);
      }
      for(const w of this.ctx.workspaceRegistry.list())if(w.id!==r.workspaceId&&this.contains(r.path,w.path))throw issue('目录中有其他已登记工作区，拒绝删除。');
      const activity=async()=>{
        const ids=new Set(r.sessionId?[r.sessionId]:[]);
        for(const id of siblings)ids.add(id);
        for(const s of this.ctx.sessions.list())if(this._belongs(r,s.id))ids.add(s.id);
        const terminals=this.ctx.get?.('terminalController');
        if(!terminals)throw issue('无法检查终端占用，暂不清理。');
        const allIds=new Set([...headers.map(x=>x.header.id),...this.ctx.sessions.list().map(s=>s.id),...ids]);
        for(const sid of allIds)if(terminals.list(sid).some(info=>ids.has(sid)||this.contains(r.path,info.cwd)))throw issue('请先关闭这个临时任务的全部终端，再点击完成。');
        for(const sessionId of ids)if((await this.ctx.waterfall('workspace/session-activity',{sessionId},async()=>[])).length)throw issue('任务、子任务或定时工作仍在运行，请先停止后再点击完成。');
      };
      await activity();
      if(auto) {
        if(this.busyTasks.delete(id)){this.latestActivity.set(id,Math.max(this.latestActivity.get(id)||0,this.clock.now()));return {completed:false,skipped:true,reason:'Activity just ended'};}
        await this._restore(r);
        if(this.clock.now()<this._deadline(r))return {completed:false,skipped:true,reason:'Not idle long enough'};
      }
      if(r.sessionId)this.blocked.add(r.sessionId);this.blockedPaths.push(r.path);
      for(const sibling of siblings)this.blocked.add(sibling);
      await activity();
      const checkDeadline=()=>{checkOpen();if(auto&&this.clock.now()<this._deadline(r))throw issue('检测到新的任务活动，已跳过自动清理。');};
      checkDeadline();
      committed=true;
      await this._update(id,{phase:auto?'auto-completing':'completing',lastError:null,cleanupRetryAt:null});
      if(r.sessionId){await this.ctx.workspaceRegistry.archiveSession(r.sessionId);archived=true;}
      // Archive the extra sessions living inside the same temporary workspace, so
      // their history survives after the shared folder is deleted.
      for(const sibling of siblings){await this.ctx.workspaceRegistry.archiveSession(sibling);archivedSiblings.push(sibling);}
      await activity();checkDeadline();
      await this.store.removeDirectory(id,{beforeRemove:checkDeadline,finalPhase:auto?'auto-completing':'files-deleted'});removed=true;
      // The core commits automatic provenance with the delete result itself,
      // closing the crash gap between journal completion and registry removal.
      if(r.workspaceId){const w=this.ctx.workspaceRegistry.get(r.workspaceId);if(w&&w.path!==r.path)throw new Error('工作区登记路径改变，拒绝移除登记。');await this.ctx.workspaceRegistry.delete(r.workspaceId);}
      await this._update(id,{phase:'completed',lastError:null,cleanupRetryAt:null});
      this.busyTasks.delete(id);return {completed:true,sessionId:r.sessionId};
    }catch(error){
      if(error.code==='SCRATCH_CLOSED'&&!removed) {
        // Restore the original phase only; never thaw a prior partial delete.
        if(committed)await this._update(id,{phase:r.phase,lastError:r.lastError||null,cleanupRetryAt:r.cleanupRetryAt||null});
        if(archived&&SAFE_PHASES.has(r.phase))await this.ctx.workspaceRegistry.unarchiveSession(r.sessionId);
        for(const sibling of archivedSiblings)await this.ctx.workspaceRegistry.unarchiveSession(sibling);
        await this.refreshBlockedPaths();
        if(auto)return {completed:false,skipped:true,reason:error.message};
        throw error;
      }
      if(auto&&error.code==='SCRATCH_BUSY'&&!removed) return await skip(String(error.message||error));
      if(auto) {
        this.restoreFailures.delete(id);
        await this._update(id,{phase:committed?'auto-error':r.phase,lastError:String(error.message||error),cleanupRetryAt:new Date(this.clock.now()+this.retryMs).toISOString()});
      }else if(committed)await this._update(id,{phase:'error',lastError:String(error.message||error)});
      await this.refreshBlockedPaths();
      if(auto)throw error;
      if(!committed)throw error;
      throw new Error(`清理未完成，可再次点击完成重试。为避免继续写入，任务暂时冻结：${error.message||error}`);
    }finally{this.apiLocked=false;}
  }
}
