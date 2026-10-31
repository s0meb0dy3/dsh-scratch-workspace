window.__ModuleLoader__.load({
  id: '@s0meb0dy3/dsh-scratch-workspace',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useRef, useId, useSyncExternalStore } = React;
    const h = React.createElement;
    const NS = 'local.scratchWorkspace';
    const zh = {
      title:'临时工作区', start:'临时任务', starting:'正在创建…', temporary:'临时', completed:'已完成', done:'✓ 完成', retry:'重试清理', on:'已开启', off:'已关闭', completeMenu:'完成并清理临时工作区',
      managerTitle:'临时工作区', managerIntro:'所有进行中的临时工作区。清理会永久删除目录文件，聊天记录保留并归档。', managerFoot:'关闭自动清理时，只有在这里手动清理才会删除文件；DSH 原生的“删除工作区”只移除登记，不删磁盘文件。', managerEmpty:'还没有进行中的临时工作区。', managerSummary:'{count} 个进行中 · 已测量 {total}',
      open:'打开', cleanUp:'清理', cleanAll:'全部清理', cleanAllTitle:'清理全部临时工作区？', cleanAllBody:'将永久删除以下 {count} 个临时工作区的全部文件，并归档聊天记录。请先另存需要的成果。',
      cleanAllConfirm:'全部清理', measuring:'正在测量…', dueNow:'已到清理时间', leftHours:'{hours} 小时 {minutes} 分钟后清理', leftMinutes:'{minutes} 分钟后清理', needsRetry:'上次清理未完成，可重试', untitledSession:'未命名会话',
      reveal:'打开目录', stateRunning:'运行中', stateTerminal:'终端打开', stateUnknown:'无法检查', stateUnknownHint:'终端服务不可用，清理时会被拒绝',
      refresh:'刷新', retryCleanup:'重试清理',
      cleanAllNote:'清理会逐个执行；正在运行或有终端占用的会被跳过。',
      working:'处理中…', root:'存放位置', rootHelp:'每个任务使用独立子文件夹。更改设置只影响新建任务。',
      prefix:'目录前缀', prefixHelp:'1–40 个中文、英文字母、数字、下划线或连字符。', confirm:'手动删除前确认',
      confirmHelp:'关闭后，点击完成会直接永久删除任务文件。', auto:'自动清理', autoHelp:'默认关闭。开启后，新任务闲置到期自动清理。修改仅影响新任务，已创建任务沿用原规则。',
      hours:'闲置时间', hoursUnit:'小时', hoursHelp:'支持 1–8760 小时。运行中的任务或有终端占用时跳过。关闭 DSH 期间不执行，下次启动后检查。',
      save:'保存设置', saved:'设置已保存', choose:'选择文件夹', intro:'一个入口开始，做完一键清理。',
      settingsIntro:'配置临时工作区的存放位置、目录前缀与清理规则。进行中的工作区在左侧「临时工作区」面板里管理。',
      setupTitle:'临时任务放在哪里？', setupHelp:'之后自动使用这个位置，不再需要手动建文件夹。', saveStart:'保存并开始',
      cancel:'取消', deleteTitle:'完成并清理临时工作区？', deleteBody:'整个临时工作区目录及其中全部文件将永久删除，不进入废纸篓；工作区登记将移除，聊天记录保留并归档。此操作不只是结束当前聊天，请先另存需要的成果。',
      delete:'完成并删除', viewPath:'查看目录', closed:'文件已删除，聊天记录仅供查阅。', manualPolicy:'仅在点击完成后清理',
      autoPolicy:'闲置 {hours} 小时后自动清理', errors:'需要处理', loading:'正在加载…', close:'关闭',
      permanent:'删除不会进入废纸篓。自动清理规则只用于之后创建的任务。', busy:'请先停止任务并关闭终端，再完成。',
      loadFailed:'无法加载临时工作区', reload:'重试', placeholder:'/Users/你的用户名/DSH Scratch',
      consentTitle:'开启自动清理？', consentBody:'之后创建的临时任务，闲置 {hours} 小时后将永久删除全部文件，不再逐次确认；聊天保留并归档。现有任务不受影响。',
      consentAccept:'确认并保存', consentCheck:'我已了解自动清理会永久删除任务文件', failed:'清理未完成，可重试。',
    };
    const en = {
      title:'Temporary Workspaces', start:'Temporary task', starting:'Creating…', temporary:'Temporary', completed:'Completed', done:'✓ Complete', retry:'Retry cleanup', on:'On', off:'Off', completeMenu:'Complete and clean up temporary workspace',
      managerTitle:'Temporary workspaces', managerIntro:'All running temporary workspaces. Cleaning permanently deletes the folder files; the conversation is retained and archived.', managerFoot:'With automatic cleanup off, files are deleted only when you clean up here. The native “Delete workspace” removes the registration only and keeps files on disk.', managerEmpty:'No temporary workspace is running.', managerSummary:'{count} running · {total} measured',
      open:'Open', cleanUp:'Clean up', cleanAll:'Clean all', cleanAllTitle:'Clean up all temporary workspaces?', cleanAllBody:'This permanently deletes every file in these {count} temporary workspaces and archives their conversations. Export anything you need first.',
      cleanAllConfirm:'Clean all', measuring:'Measuring…', dueNow:'Due for cleanup', leftHours:'Cleanup in {hours}h {minutes}m', leftMinutes:'Cleanup in {minutes}m', needsRetry:'Previous cleanup did not finish; retry', untitledSession:'Untitled session',
      reveal:'Open folder', stateRunning:'Running', stateTerminal:'Terminal open', stateUnknown:'Unavailable', stateUnknownHint:'Terminal service unavailable; cleanup will be refused',
      refresh:'Refresh', retryCleanup:'Retry cleanup',
      cleanAllNote:'Cleanups run one by one; running tasks and open terminals are skipped.',
      working:'Working…', root:'Storage location', rootHelp:'Each task gets a separate subfolder. Settings affect new tasks only.',
      prefix:'Folder prefix', prefixHelp:'1–40 letters, digits, Han characters, underscores or hyphens.', confirm:'Confirm manual deletion',
      confirmHelp:'When off, Complete permanently deletes task files immediately.', auto:'Automatic cleanup', autoHelp:'Off by default. New tasks can be cleaned after an idle period. Existing tasks keep their original policy when settings change.',
      hours:'Idle time', hoursUnit:'hours', hoursHelp:'1–8760 hours. Running tasks and open terminals are skipped. Checked again after DSH restarts.',
      save:'Save settings', saved:'Settings saved', choose:'Choose folder', intro:'One entry to start. One click to finish.',
      settingsIntro:'Configure where temporary workspaces live, their folder prefix and cleanup rules. Running workspaces are managed from the Temporary workspaces panel in the sidebar.',
      setupTitle:'Where should temporary tasks go?', setupHelp:'New tasks will use this location without manual folder setup.', saveStart:'Save and start',
      cancel:'Cancel', deleteTitle:'Complete and clean up this temporary workspace?', deleteBody:'The entire temporary workspace folder and all its files will be permanently deleted, not moved to Trash. Its workspace registration will be removed; the conversation will be retained and archived. This does more than end the current chat. Export any results first.',
      delete:'Complete and delete', viewPath:'View folder', closed:'Files were deleted. The conversation is for reference only.', manualPolicy:'Clean up only when you click Complete',
      autoPolicy:'Auto-clean after {hours} idle hours', errors:'Needs attention', loading:'Loading…', close:'Close',
      permanent:'Files do not go to Trash. Automatic cleanup settings affect new tasks only.', busy:'Stop running work and close terminals before completing.',
      loadFailed:'Could not load temporary workspaces', reload:'Retry', placeholder:'/Users/you/DSH Scratch',
      consentTitle:'Enable automatic cleanup?', consentBody:'New temporary tasks will permanently lose all files after {hours} idle hours, without another confirmation. Conversations are retained and archived. Existing tasks are unaffected.',
      consentAccept:'Confirm and save', consentCheck:'I understand automatic cleanup permanently deletes task files', failed:'Cleanup is incomplete. Retry to finish.',
    };
    const css = `
.dsh-scratch{font:inherit;color:var(--dsw-alias-label-primary);box-sizing:border-box}
.dsh-scratch button,.dsh-scratch input{font:inherit;box-sizing:border-box}
.dsh-scratch button{cursor:pointer;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 12px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;gap:7px}
.dsh-scratch button:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-scratch button:focus-visible,.dsh-scratch input:focus-visible,.dsh-scratch summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-scratch button:disabled{opacity:.5;cursor:default}
.dsh-scratch .scratch-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-scratch .scratch-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsh-scratch .scratch-muted{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.dsh-scratch .scratch-error{font-size:13px;line-height:1.6;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dsh-scratch .scratch-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsh-scratch .scratch-path{margin-top:8px;font-size:12px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.dsh-scratch-page{padding:24px;max-width:720px;margin:0 auto;width:100%}
.dsh-scratch h2{font-size:20px;margin:0 0 8px;font-weight:600}
.dsh-scratch h3{font-size:17px;margin:0 0 12px;font-weight:600}
.dsh-scratch p{margin:0 0 16px}
.dsh-scratch-form{display:flex;flex-direction:column;gap:22px;margin-top:24px}
.dsh-scratch-field{display:flex;flex-direction:column;gap:7px}
.dsh-scratch-field label{font-size:14px;font-weight:500}
.dsh-scratch input[type=text],.dsh-scratch input[type=number]{width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:10px 12px}
.dsh-scratch-field .scratch-row input{flex:1}
.dsh-scratch .scratch-hours{width:100px;flex:none!important}
.dsh-scratch .scratch-switch{border:0;background:transparent;padding:0;justify-content:space-between;width:100%;text-align:left;min-height:24px}
.dsh-scratch .scratch-switch-state{display:inline-flex;align-items:center;gap:9px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-scratch .scratch-switch-state[data-on=true]{color:var(--dsw-alias-brand-primary)}
.dsh-scratch .scratch-track{display:inline-flex;align-items:center;flex-shrink:0;width:38px;height:22px;padding:2px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-sizing:border-box}
.dsh-scratch .scratch-track[data-on=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);justify-content:flex-end}
.dsh-scratch .scratch-thumb{display:block;flex-shrink:0;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary)}
.dsh-scratch .scratch-track[data-on=true] .scratch-thumb{background:var(--dsw-alias-bg-overlay)}
.dsh-scratch .scratch-menu{width:100%;min-height:36px;padding:8px 12px;border:0;border-radius:6px;background:transparent;justify-content:flex-start;font-size:14px}
.dsh-scratch .scratch-header-button{min-height:28px;padding:3px 9px;font-size:12px;white-space:nowrap;background:transparent}
.dsh-scratch .scratch-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:0 5px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.dsh-scratch-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto;background:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent)}
.dsh-scratch-dialog{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;width:460px;max-width:100%;max-height:calc(100vh - 48px);overflow:auto;padding:24px;box-sizing:border-box}
.dsh-scratch-dialog .scratch-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px;flex-wrap:wrap}
.dsh-scratch-dialog summary{font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-scratch-dialog .scratch-check{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.6;margin-top:16px}
.dsh-scratch-dialog .scratch-check input{margin-top:4px;flex-shrink:0}
.dsh-scratch-recovery{margin-top:24px;padding-top:20px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-scratch .scratch-list{display:flex;flex-direction:column;gap:10px}
.dsh-scratch .scratch-item{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-scratch .scratch-item-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dsh-scratch .scratch-item-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;min-width:0}
.dsh-scratch .scratch-item-title>span:first-of-type{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-scratch .scratch-item-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}
.dsh-scratch .scratch-item-meta{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;min-width:0}
.dsh-scratch .scratch-item-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;opacity:.85}
.dsh-scratch .scratch-dot{opacity:.45}
.dsh-scratch .scratch-mgr-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.dsh-scratch .scratch-mgr-tools{display:flex;align-items:center;gap:4px}
.dsh-scratch .scratch-mgr-summary{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:12px}
.dsh-scratch .scratch-quiet{border:0;background:transparent;color:var(--dsw-alias-label-secondary);min-height:28px;padding:2px 8px;font-size:12px}
.dsh-scratch .scratch-quiet:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-scratch .scratch-danger-text{color:var(--dsw-alias-state-error-primary)}
.dsh-scratch .scratch-danger-text:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-scratch .scratch-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 16px;border:1px dashed var(--dsw-alias-border-l1);border-radius:12px;color:var(--dsw-alias-label-secondary)}
.dsh-scratch .scratch-session-index{font-size:10px;opacity:.6;margin-right:4px}
.dsh-scratch .scratch-bullets{margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--dsw-alias-label-secondary);max-height:160px;overflow:auto}
.dsh-scratch .scratch-bullets li{overflow-wrap:anywhere}
.dsh-scratch .scratch-sessions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.dsh-scratch .scratch-session-link{min-height:24px;padding:2px 8px;font-size:12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-scratch .scratch-session-link:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-scratch .scratch-state{font-size:11px;line-height:18px;padding:0 6px;border-radius:5px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-scratch .scratch-state-running{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.dsh-scratch .scratch-state-terminal{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dsh-scratch .scratch-state-unknown{color:var(--dsw-alias-state-idle-primary)}
.dsh-scratch-issue{margin-top:12px;display:flex;flex-direction:column;gap:8px}
`;
    // Same metaphor as the package icon: a folder plus a clock (temporary → expires).
    // Line-only and currentColor so it matches the host's nav glyphs at 16–18px.
    function Icon({size=16}) {
      return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},
        h('path',{d:'M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.6 1.8h7.2A1.5 1.5 0 0 1 19 9.3v7.2A1.5 1.5 0 0 1 17.5 18h-13A1.5 1.5 0 0 1 3 16.5Z'}),
        h('circle',{cx:16.5,cy:15.5,r:3.6}),
        h('path',{d:'M16.5 13.9v1.7l1.2.8'}));
    }
    return { inject:['slots','locale','connection','uiWorkspace','layout'], apply(ctx) {
      ctx.effect(()=>ctx.locale.register(NS,{zh,en}),'scratch: locales');
      const t=ctx.locale.bind(NS);
      // Removing a workspace makes the shell leave the current session view; the
      // manager should stay open so several workspaces can be cleaned in a row.
      const stayOnManager=()=>{const reselect=()=>{try{ctx.layout?.selectPanel?.('scratch-workspaces');}catch{}};reselect();setTimeout(reselect,0);};
      const useLocale=()=>{useSyncExternalStore(fn=>ctx.locale.subscribe(fn),()=>ctx.locale.getSnapshot());return t;};
      const format=(key,args={})=>Object.entries(args).reduce((text,[k,v])=>text.replaceAll(`{${k}}`,String(v)),t(key));
      let snapshot=null,pending=null,disposed=false,dialog=null,creationPending=false;
      const listeners=new Set(),dialogListeners=new Set();
      const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
      const subscribeDialog=fn=>{dialogListeners.add(fn);return()=>dialogListeners.delete(fn);};
      const publish=value=>{if(!disposed){snapshot=value;for(const fn of listeners)fn();}};
      const setDialog=value=>{dialog=value;for(const fn of dialogListeners)fn();};
      const raw=async(method,args={})=>{const result=await ctx.connection.rpc.call('/scratch-workspace',method,args);if(!result.ok)throw new Error(result.error.message);return result.value;};
      const refresh=()=>{if(!pending)pending=raw('status').then(value=>{publish(value);return value;}).finally(()=>pending=null);return pending;};
      const mutate=async(method,args)=>{try{return await raw(method,args);}finally{if(pending)await pending.catch(()=>{});await refresh().catch(()=>{});}};
      const useData=()=>{
        const data=useSyncExternalStore(subscribe,()=>snapshot);const [error,setError]=useState('');
        useEffect(()=>{
          let live=true,timer;
          const attempt=()=>{refresh().then(()=>live&&setError('')).catch(e=>{if(!live)return;setError(e.message);timer=setTimeout(attempt,5000);});};
          attempt();
          return()=>{live=false;clearTimeout(timer);};
        },[]);
        return {data,error,reload:()=>{setError('');refresh().catch(e=>setError(e.message));}};
      };
      function ErrorText({error}) {return error?h('div',{className:'scratch-error',role:'alert'},error):null;}
      function Switch({label,checked,onChange,disabled}) {
        const t=useLocale();
        return h('button',{type:'button',className:'scratch-switch',role:'switch','aria-label':label,'aria-checked':checked,disabled,onClick:()=>onChange(!checked)},h('span',null,label),h('span',{className:'scratch-switch-state','data-on':checked,'aria-hidden':true},h('span',null,t(checked?'on':'off')),h('span',{className:'scratch-track','data-on':checked},h('span',{className:'scratch-thumb'}))));
      }
      async function createAndOpen() {
        if(creationPending)return;
        creationPending=true;
        try {const value=await mutate('create');if(!disposed)ctx.uiWorkspace.openSession(value.sessionId);return value;}
        finally {creationPending=false;}
      }
      async function launch() {
        try {
          const value=await refresh();
          if(!value.settings.rootDirectory){setDialog({kind:'setup'});return;}
          await createAndOpen();
        } catch(e) {setDialog({kind:'error',message:e.message});}
      }
      async function requestCompletion(task,trigger) {
        try {
          const value=await refresh();const current=value.tasks.find(x=>x.id===task.id);
          if(!current||current.phase==='completed')return;
          setDialog({kind:'complete',task:current,trigger,skipConfirmation:!value.settings.confirmDelete});
        } catch(e) {setDialog({kind:'error',message:e.message,trigger});}
      }
      // Resolved task per session: the plugin's own session, or any session that
      // simply lives inside a registered temporary workspace folder.
      const resolved=new Map();
      function useTask(props) {
        const {data}=useData();
        const key=props.useWorkspaces(s=>s);const running=props.useSession(s=>s.running);
        const [,bump]=useState(0);
        useEffect(()=>{refresh().catch(()=>{});},[key,props.sessionId,running]);
        const direct=data?.tasks.find(x=>x.sessionId===props.sessionId);
        const [fallback,setFallback]=useState(()=>resolved.get(props.sessionId)||null);
        useEffect(()=>{
          if(direct||!data){setFallback(resolved.get(props.sessionId)||null);return;}
          const cached=resolved.get(props.sessionId);
          if(cached&&data.tasks.some(x=>x.id===cached.id)){setFallback(cached);return;}
          let live=true;
          raw('resolve',{sessionId:props.sessionId}).then(task=>{
            if(!live)return;
            if(task)resolved.set(props.sessionId,task);
            setFallback(task||null);
          }).catch(()=>{});
          return()=>{live=false;};
        },[direct,data,props.sessionId]);
        const task=direct||(fallback&&data?.tasks.some(x=>x.id===fallback.id)?fallback:null);
        return {task,running};
      }
      function Badge(props) {
        const t=useLocale();const {task}=useTask(props);if(!task)return null;
        const policy=task.phase==='completed'?t('closed'):task.cleanupPolicy?.enabled?format('autoPolicy',{hours:task.cleanupPolicy.idleHours}):t('manualPolicy');
        return h('span',{className:'dsh-scratch'},h('span',{className:'scratch-badge',title:policy},h(Icon,{size:12}),t(task.phase==='completed'?'completed':'temporary')));
      }
      // Shared management view: the sidebar panel page and the Settings page both
      // render it, so there is one authoritative list of temporary workspaces.
      function workspaceRows(data){return (data?.tasks||[]).filter(t=>t.phase!=='completed');}
      function idleText(t,task){
        if(task.phase!=='active')return t(task.phase==='auto-error'?'needsRetry':'needsRetry');
        if(!task.cleanupPolicy?.enabled)return t('manualPolicy');
        const deadline=Date.parse(task.lastActivityAt)+task.cleanupPolicy.idleHours*3600000;
        const left=deadline-Date.now();
        if(left<=0)return t('dueNow');
        const hours=Math.floor(left/3600000),minutes=Math.round((left%3600000)/60000);
        return hours>0?format('leftHours',{hours,minutes}):format('leftMinutes',{hours:0,minutes});
      }
      function formatBytes(bytes){
        if(!Number.isFinite(bytes))return '';
        const units=['B','KB','MB','GB','TB'];let value=bytes,index=0;
        while(value>=1024&&index<units.length-1){value/=1024;index++;}
        return `${value<10&&index>0?value.toFixed(1):Math.round(value)} ${units[index]}`;
      }
      function StateChip({state,t}){
        if(!state||state==='idle')return null;
        const label=state==='running'?t('stateRunning'):state==='terminal'?t('stateTerminal'):state==='unknown'?t('stateUnknown'):null;
        if(!label)return null;
        return h('span',{className:`scratch-state scratch-state-${state}`,title:state==='unknown'?t('stateUnknownHint'):undefined},label);
      }
      function WorkspaceManager({compact=false}){
        const t=useLocale();const {data,error,reload}=useData();
        const [sizes,setSizes]=useState({});const [sessionMap,setSessionMap]=useState({});const [states,setStates]=useState({});const [busy,setBusy]=useState('');
        const tasks=workspaceRows(data);
        const loadSizes=React.useCallback(async rows=>{
          for(const row of rows){
            try{const value=await raw('usage',{id:row.id});setSizes(current=>({...current,[row.id]:value}));}catch{}
            try{const list=await raw('sessions',{id:row.id});setSessionMap(current=>({...current,[row.id]:list}));}catch{}
            try{const state=await raw('state',{id:row.id});setStates(current=>({...current,[row.id]:state}));}catch{}
          }
        },[data]);
        useEffect(()=>{if(tasks.length)loadSizes(tasks);},[data]);
        if(!data)return h('div',null,h('p',{className:'scratch-muted'},t(error?'loadFailed':'loading')),h(ErrorText,{error}),error&&h('button',{onClick:reload},t('reload')));
        return h('div',{className:'dsh-scratch scratch-mgr'},
          h('div',{className:'scratch-mgr-bar'},
            h('button',{type:'button',className:'scratch-primary',disabled:!!busy,onClick:async()=>{setBusy('create');try{await launch();}finally{setBusy('');}}},busy==='create'?t('starting'):`＋ ${t('start')}`),
            h('div',{className:'scratch-mgr-tools'},
              h('button',{type:'button',className:'scratch-quiet',disabled:!!busy,onClick:async()=>{setBusy('refresh');try{await refresh();await loadSizes(tasks);}finally{setBusy('');}}},t('refresh')),
              tasks.length>1&&h('button',{type:'button',className:'scratch-quiet scratch-danger-text',disabled:!!busy,onClick:()=>setDialog({kind:'cleanAll',tasks})},t('cleanAll')))),
          h('div',{className:'scratch-mgr-summary'},format('managerSummary',{count:tasks.length,total:formatBytes(Object.values(sizes).reduce((sum,v)=>sum+(v?.bytes||0),0))})),
          tasks.length===0?h('div',{className:'scratch-empty'},h(Icon,{size:22}),h('p',{className:'scratch-muted'},t('managerEmpty')),h('button',{type:'button',className:'scratch-primary',onClick:()=>launch()},`＋ ${t('start')}`)):
            h('div',{className:'scratch-list'},tasks.map(task=>h('article',{key:task.id,className:'scratch-item'},
              h('header',{className:'scratch-item-head'},
                h('div',{className:'scratch-item-title'},h(Icon,{size:15}),h('span',null,friendlyName(t,task.path)),StateChip({state:states[task.id]?.state,t})),
                h('div',{className:'scratch-item-actions'},
                  h('button',{type:'button',className:'scratch-quiet',title:task.path,onClick:async e=>{const button=e.currentTarget;button.disabled=true;try{await raw('reveal',{id:task.id});}catch(err){setDialog({kind:'error',message:err.message,trigger:button});}finally{button.disabled=false;}}},t('reveal')),
                  task.sessionId&&h('button',{type:'button',className:'scratch-quiet',onClick:()=>ctx.uiWorkspace.openSession(task.sessionId)},t('open')),
                  h('button',{type:'button',className:'scratch-quiet scratch-danger-text',disabled:!!busy,onClick:()=>requestCompletion(task)},task.phase==='error'||task.phase==='auto-error'?t('retryCleanup'):t('cleanUp')))),
              h('div',{className:'scratch-item-meta'},h('span',null,idleText(t,task)),h('span',{className:'scratch-dot'},'·'),h('span',null,sizes[task.id]?formatBytes(sizes[task.id].bytes):t('measuring')),h('span',{className:'scratch-dot'},'·'),h('span',{className:'scratch-item-path',title:task.path},pathName(task.path))),
              (sessionMap[task.id]||[]).length>0&&h('div',{className:'scratch-sessions'},sessionMap[task.id].map((item,index)=>h('button',{
                key:item.sessionId,type:'button',className:'scratch-session-link',title:item.sessionId,
                onClick:()=>ctx.uiWorkspace.openSession(item.sessionId),
              },h('span',{className:'scratch-session-index'},index+1),item.title||t('untitledSession'))))))));
      }
      // `task-20261030-141757-uuid` -> `临时任务 · 10-30 14:17` (local time), so the
      // card leads with something a person can recognize; the folder stays in meta.
      function friendlyName(t,value){
        const name=pathName(value)||'';
        const match=/^(.*)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(name);
        if(!match)return name;
        const [,prefix,year,month,day,hour,minute]=match;
        const local=new Date(Date.UTC(+year,+month-1,+day,+hour,+minute));
        if(Number.isNaN(local.getTime()))return name;
        const pad=n=>String(n).padStart(2,'0');
        return `${prefix} · ${pad(local.getMonth()+1)}-${pad(local.getDate())} ${pad(local.getHours())}:${pad(local.getMinutes())}`;
      }
      function pathName(value){const parts=String(value||'').split(/[\\/]/);return parts[parts.length-1]||value;}
      function ManagerPanel(){
        const t=useLocale();const {data}=useData();
        return h('section',{className:'dsh-scratch dsh-scratch-page'},
          h('h2',null,t('title')),
          h('p',{className:'scratch-muted'},t('managerIntro')),
          h(WorkspaceManager,{}),
          h('p',{className:'scratch-muted',style:{marginTop:20}},t('managerFoot')));
      }
      function SettingsForm() {
        const t=useLocale();const {data,error,reload}=useData();const id=useId();
        const [form,setForm]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState('');
        useEffect(()=>{if(data&&!form)setForm({autoCleanupEnabled:false,idleHours:24,...data.settings});},[data]);
        if(!form)return h('div',null,h('p',null,t(error?'loadFailed':'loading')),h(ErrorText,{error}),error&&h('button',{onClick:reload},t('reload')));
        const change=(key,value)=>{setForm(f=>({...f,[key]:value}));setNotice('');setFailure('');};
        const save=async(consent=false)=>{
          setBusy(true);setFailure('');setNotice('');
          try {const value=await mutate('configure',{...form,idleHours:Number(form.idleHours),...(consent?{autoCleanupConsent:true}:{})});setForm(value);setNotice(t('saved'));}
          catch(e){setFailure(e.message);throw e;}finally{setBusy(false);}
        };
        const field=(key,label,help)=>h('div',{className:'dsh-scratch-field'},h('label',{htmlFor:`${id}-${key}`},t(label)),h('div',{className:'scratch-row'},h('input',{id:`${id}-${key}`,type:'text',value:form[key],disabled:busy,placeholder:key==='rootDirectory'?t('placeholder'):undefined,onChange:e=>change(key,e.target.value)}),key==='rootDirectory'&&h('button',{type:'button',disabled:busy,onClick:async()=>{try{const p=await ctx.uiWorkspace.pickDirectory();if(p)change(key,p);}catch(e){setFailure(e.message);}}},t('choose'))),h('div',{className:'scratch-muted'},t(help)));
        return h('form',{className:'dsh-scratch-form',onSubmit:async e=>{
          e.preventDefault();if(busy)return;const latest=await refresh().catch(e=>{setFailure(e.message);return null;});if(!latest)return;
          if(form.autoCleanupEnabled&&(!Number.isInteger(Number(form.idleHours))||Number(form.idleHours)<1||Number(form.idleHours)>8760)){setFailure(t('hoursHelp'));return;}
          const needsConsent=form.autoCleanupEnabled&&(!latest.settings.autoCleanupEnabled||Number(form.idleHours)!==latest.settings.idleHours);
          if(needsConsent){setDialog({kind:'consent',hours:form.idleHours,save:()=>save(true),trigger:e.nativeEvent?.submitter});return;}
          await save().catch(()=>{});
        }},field('rootDirectory','root','rootHelp'),field('directoryPrefix','prefix','prefixHelp'),
          h('div',{className:'dsh-scratch-field'},h(Switch,{label:t('confirm'),checked:form.confirmDelete,disabled:busy,onChange:v=>change('confirmDelete',v)}),h('div',{className:'scratch-muted'},t('confirmHelp'))),
          h('div',{className:'dsh-scratch-field'},h(Switch,{label:t('auto'),checked:form.autoCleanupEnabled,disabled:busy,onChange:v=>change('autoCleanupEnabled',v)}),h('div',{className:'scratch-muted'},t('autoHelp'))),
          form.autoCleanupEnabled&&h('div',{className:'dsh-scratch-field'},h('label',{htmlFor:`${id}-hours`},t('hours')),h('div',{className:'scratch-row'},h('input',{id:`${id}-hours`,className:'scratch-hours',type:'number',min:1,max:8760,step:1,required:true,value:form.idleHours,onChange:e=>change('idleHours',e.target.value),disabled:busy}),h('span',{className:'scratch-muted'},t('hoursUnit'))),h('div',{className:'scratch-muted'},t('hoursHelp'))),
          h(ErrorText,{error:failure}),notice&&h('div',{role:'status',className:'scratch-muted'},notice),h('div',null,h('button',{type:'submit',className:'scratch-primary',disabled:busy},t(busy?'working':'save'))));
      }
      // Settings carries configuration only. Temporary workspaces themselves live
      // in the sidebar panel, so this page never duplicates that list.
      function SettingsPage() {
        const t=useLocale();
        return h('section',{className:'dsh-scratch dsh-scratch-page'},
          h('h2',null,t('title')),
          h('p',{className:'scratch-muted'},t('settingsIntro')),
          h(SettingsForm,{}),
          h('p',{className:'scratch-muted',style:{marginTop:20}},t('permanent')));
      }
      function Dialog({value}) {
        const t=useLocale();const box=useRef(null);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[location,setLocation]=useState(''),[ack,setAck]=useState(false);const submitted=useRef(false);const dialogId=useId();
        const close=()=>{if(!busy){setDialog(null);value.trigger?.focus?.();}};
        const complete=async()=>{
          if(submitted.current)return;submitted.current=true;setBusy(true);setError('');
          try{await mutate('complete',{id:value.task.id});setDialog(null);stayOnManager();}
          catch(e){setError(e.message);await refresh().catch(()=>{});submitted.current=false;}
          finally{setBusy(false);}
        };
        useEffect(()=>{const node=box.current;node?.querySelector('input, [data-cancel], button')?.focus();if(value.kind==='complete'&&value.skipConfirmation)complete();return()=>{};},[]);
        const keyDown=e=>{
          if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
          if(e.key==='Tab'){
            const nodes=[...box.current.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')];
            if(!nodes.length){e.preventDefault();box.current.focus();return;}
            const index=nodes.indexOf(document.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&index===nodes.length-1){e.preventDefault();nodes[0].focus();}
          }
        };
        const title=value.kind==='setup'?'setupTitle':value.kind==='complete'?'deleteTitle':value.kind==='consent'?'consentTitle':value.kind==='cleanAll'?'cleanAllTitle':'loadFailed';
        const cancel=h('button',{type:'button','data-cancel':true,onClick:close,disabled:busy},t('cancel'));
        let content;
        if(value.kind==='setup')content=h('form',{onSubmit:async e=>{e.preventDefault();if(submitted.current)return;submitted.current=true;setBusy(true);setError('');try{await mutate('configure',{rootDirectory:location});await createAndOpen();setDialog(null);}catch(e){setError(e.message);submitted.current=false;}finally{setBusy(false);}}},
          h('p',{className:'scratch-muted'},t('setupHelp')),h('div',{className:'dsh-scratch-field'},h('label',{htmlFor:`${dialogId}-root`},t('root')),h('input',{id:`${dialogId}-root`,value:location,type:'text',required:true,placeholder:t('placeholder'),onChange:e=>setLocation(e.target.value),disabled:busy}),h('div',null,h('button',{type:'button',disabled:busy,onClick:async()=>{try{const p=await ctx.uiWorkspace.pickDirectory();if(p)setLocation(p);}catch(e){setError(e.message);}}},t('choose')))),h(ErrorText,{error}),h('div',{className:'scratch-actions'},cancel,h('button',{className:'scratch-primary',type:'submit',disabled:busy||!location.trim()},t(busy?'working':'saveStart'))));
        else if(value.kind==='complete')content=h(React.Fragment,null,h('p',{className:'scratch-muted'},t('deleteBody')),h('details',null,h('summary',null,t('viewPath')),h('div',{className:'scratch-path'},value.task.path)),h(ErrorText,{error}),h('div',{className:'scratch-actions'},cancel,h('button',{className:'scratch-danger',type:'button',disabled:busy,onClick:complete},t(busy?'working':'delete'))));
        else if(value.kind==='consent')content=h(React.Fragment,null,h('p',{className:'scratch-muted'},format('consentBody',{hours:value.hours})),h('label',{className:'scratch-check'},h('input',{type:'checkbox',checked:ack,onChange:e=>setAck(e.target.checked),disabled:busy}),h('span',null,t('consentCheck'))),h(ErrorText,{error}),h('div',{className:'scratch-actions'},cancel,h('button',{className:'scratch-danger',type:'button',disabled:busy||!ack,onClick:async()=>{if(submitted.current)return;submitted.current=true;setBusy(true);try{await value.save();setDialog(null);}catch(e){setError(e.message);submitted.current=false;}finally{setBusy(false);}}},t(busy?'working':'consentAccept'))));
        else if(value.kind==='cleanAll')content=h(React.Fragment,null,
          h('p',{className:'scratch-muted'},format('cleanAllBody',{count:value.tasks.length})),
          h('ul',{className:'scratch-bullets'},value.tasks.map(task=>h('li',{key:task.id},pathName(task.path)))),
          h(ErrorText,{error}),
          h('div',{className:'scratch-actions'},cancel,h('button',{className:'scratch-danger',type:'button',disabled:busy,onClick:async()=>{
            if(submitted.current)return;submitted.current=true;setBusy(true);setError('');
            const failures=[];
            for(const task of value.tasks){
              try{await mutate('complete',{id:task.id});}
              catch(e){failures.push(`${pathName(task.path)}: ${e.message}`);}
            }
            setBusy(false);submitted.current=false;
            // Every pass may remove the selected workspace, so re-assert the panel
            // once per removed task, not only at the end.
            stayOnManager();
            if(failures.length){setError(failures.join('\n'));await refresh().catch(()=>{});}
            else setDialog(null);
          }},t(busy?'working':'cleanAllConfirm'))));
        else content=h(React.Fragment,null,h(ErrorText,{error:value.message}),h('div',{className:'scratch-actions'},h('button',{onClick:close},t('close'))));
        return h('div',{className:'dsh-scratch dsh-scratch-overlay',onKeyDown:keyDown},h('section',{className:'dsh-scratch-dialog',role:'dialog','aria-modal':true,'aria-labelledby':dialogId,ref:box,tabIndex:-1},h('h3',{id:dialogId},t(title)),content));
      }
      function Overlay() {const value=useSyncExternalStore(subscribeDialog,()=>dialog);return h(React.Fragment,null,h('style',null,css),value&&h(Dialog,{key:value.kind+(value.task?.id||''),value}));}
      function PanelIcon({size=18,active=false}) {return h('span',{style:{display:'inline-flex',color:active?'var(--dsw-alias-brand-primary)':'currentColor'}},h(Icon,{size}));}
      const register=(name,id,Component,options={})=>ctx.slots.inject(name,()=>ctx.slots.register({name,id,order:5,...options},Component));
      register('settings.section','scratch-workspace',SettingsPage,{label:()=>t('title')});
      ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'@s0meb0dy3/dsh-scratch-workspace'},props=>props.view==='page'?h(SettingsPage):null));
      register('conversation.session.header.actions','scratch-workspace-badge',Badge,{order:0});
      // The management page lives beside the other global panels; the same view is
      // embedded in Settings, so ending work is a workspace-level action only.
      ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'scratch-workspaces',order:20,label:()=>t('managerTitle')},PanelIcon));
      ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'scratch-workspaces'},ManagerPanel));
      register('shell.overlay','scratch-workspace-dialog',Overlay);
      ctx.on('connection/reset',()=>refresh().catch(()=>{}));
      ctx.effect(()=>{disposed=false;refresh().catch(()=>{});return()=>{disposed=true;listeners.clear();dialogListeners.clear();dialog=null;};},'scratch: client lifetime');
    }};
  }
});

