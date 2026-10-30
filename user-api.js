/** Shared authenticated UI dispatcher. No automatic deletion operation is
 * accepted over the wire: only the service-owned timer can invoke sweep(). */
export function createUserHandler(service) {
  return async function handle(method,payload,signal,peer) {
    try {
      if(peer?.principal?.kind!=='owner'||peer.interactions!=='answer')throw new Error('此操作仅对已认证的交互用户开放。');
      if(signal.aborted)throw new Error('操作已取消。');
      const value=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
      let result;
      if(method==='status')result=await service.status();
      else if(method==='resolve') {
        if(typeof value.sessionId!=='string')throw new Error('缺少会话标识。');
        result=await service.taskForSession(value.sessionId);
      } else if(method==='usage') {
        if(typeof value.id!=='string')throw new Error('缺少临时任务标识。');
        result=await service.usage(value.id);
      } else if(method==='sessions') {
        if(typeof value.id!=='string')throw new Error('缺少临时任务标识。');
        result=await service.sessionsOf(value.id);
      } else if(method==='state') {
        if(typeof value.id!=='string')throw new Error('缺少临时任务标识。');
        result=await service.taskState(value.id);
      } else if(method==='reveal') {
        if(typeof value.id!=='string')throw new Error('缺少临时任务标识。');
        result=await service.reveal(value.id);
      } else if(method==='configure') {
        const {autoCleanupConsent,...patch}=value;
        result=await service.configure(patch,{user:true,autoCleanupConsent:autoCleanupConsent===true});
      } else if(method==='create')result=await service.create();
      else if(method==='complete') {
        if(typeof value.id!=='string')throw new Error('缺少临时任务标识。');
        result=await service.complete(value.id,{user:true});
      } else throw new Error('未知临时工作区操作。');
      return {ok:true,value:result};
    } catch(error) {
      return {ok:false,error:{code:'scratch-workspace/error',message:String(error.message||error),details:{}}};
    }
  };
}
