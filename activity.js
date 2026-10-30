import path from 'node:path';

export const ACTIVITY_EVENTS = new Set(['user/message','turn/start','turn/end','tool/call','tool/result','assistant/message']);
const contains=(root,value)=>{if(!value)return false;const rel=path.relative(root,value);return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));};

/** Recover the latest committed activity without activating any session.
 * Only reads backwards in bounded pages until a relevant event is found.
 * Unknown legacy length falls back to an unbounded read once; failures propagate
 * so the automatic cleaner can conservatively postpone instead of guessing.
 */
export async function restoreActivity(ctx,record) {
  let newest=Date.parse(record.lastActivityAt||record.createdAt);
  const snapshots=await ctx.sessionPersistence.list();
  const ids=new Map();
  for(const snapshot of snapshots)if(snapshot.header.id===record.sessionId||contains(record.path,snapshot.header.cwd))ids.set(snapshot.header.id,snapshot);
  if(record.sessionId&&!ids.has(record.sessionId))throw new Error('Cannot verify stored temporary session activity');
  for(const session of ctx.sessions.list()) {
    const cwd=ctx.workingDirectory.get(session);
    if(session.id!==record.sessionId&&!contains(record.path,cwd)&&!contains(record.path,session.header.cwd))continue;
    ids.set(session.id,ids.get(session.id)||{header:session.header});
  }
  for(const [id,snapshot] of ids) {
    const live=ctx.sessions.get(id);
    if(live) {
      const events=live.snapshotEvents();
      for(let i=events.length-1;i>=0;i--)if(ACTIVITY_EVENTS.has(events[i].type)){newest=Math.max(newest,events[i].time);break;}
      continue;
    }
    const handle=await ctx.sessionPersistence.open(id,'read');
    try {
      if(Number.isSafeInteger(snapshot.eventCount)&&snapshot.eventCount>=0) {
        let end=snapshot.eventCount;
        while(end>0) {
          const start=Math.max(0,end-128);
          const {events}=await handle.read(start,end-start);
          const event=[...events].reverse().find(e=>ACTIVITY_EVENTS.has(e.type));
          if(event){newest=Math.max(newest,event.time);break;}
          end=start;
        }
      } else {
        const {events}=await handle.read();
        const event=[...events].reverse().find(e=>ACTIVITY_EVENTS.has(e.type));
        if(event)newest=Math.max(newest,event.time);
      }
    } finally {await handle.close();}
  }
  if(!Number.isFinite(newest))throw new Error('Cannot verify temporary activity timestamp');
  return newest;
}
