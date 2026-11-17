/* Progressive admin workspace: presentation only; all actions delegate to existing navigation. */
(()=>{
 const dashboard=document.getElementById('view-dashboard'),body=document.getElementById('dash-body');
 const form=document.getElementById('settings-form'),save=document.getElementById('btn-save-all');
 if(!dashboard||!body||!form||!save)return;
 const intro=document.createElement('div');intro.className='ux-dashboard-intro';
 intro.innerHTML='<div><span class="ux-eyebrow">MANAGEMENT OVERVIEW</span><h3>Welcome to your workspace</h3><p>Review church activity and open the tools you need. Counts reflect available staging records only.</p></div>';
 const shortcuts=document.createElement('div');shortcuts.className='ux-dashboard-shortcuts';
 const tasks=[['📡','Manage livestream','view-live','Update broadcast details'],['📖','Sermons & videos','view-messages','Manage messages'],['📅','Events & programs','view-events','Edit upcoming services'],['📣','Announcements','view-announcements','Publish church news'],['📁','Media library','view-media','Upload and organize files'],['👥','Member approvals','view-team','Review membership tools']];
 tasks.forEach(([icon,name,view,description])=>{
   const b=document.createElement('button');b.type='button';b.className='ux-task';b.dataset.view=view;
   const symbol=document.createElement('span');symbol.className='ux-task-icon';symbol.textContent=icon;
   const text=document.createElement('span');text.className='ux-task-text';
   const strong=document.createElement('strong');strong.textContent=name;
   const small=document.createElement('small');small.textContent=description;
   text.append(strong,small);
   const arrow=document.createElement('span');arrow.className='ux-task-arrow';arrow.textContent='›';
   b.append(symbol,text,arrow);
   b.addEventListener('click',()=>{
     const target=document.querySelector('.sidebar-btn[data-view="'+view+'"]');
     if(target)target.click();
   });
   shortcuts.append(b);
 });
 document.addEventListener('pai:admin-ready',()=>{
   shortcuts.querySelectorAll('[data-view]').forEach(b=>{
     const target=document.querySelector('.sidebar-btn[data-view="'+b.dataset.view+'"]');
     b.hidden=!target || target.style.display==='none';
   });
 });
 const title=document.createElement('h3');title.className='ux-section-title';title.textContent='Quick actions';
 const note=document.createElement('p');note.className='ux-dashboard-note';note.textContent='Some tools are still being connected to the staging backend. Review the result of each save before relying on it.';
 intro.append(title,shortcuts,note);
 body.before(intro);
 const metricsTitle=document.createElement('h3');metricsTitle.className='ux-section-title';metricsTitle.textContent='Church activity';
 body.before(metricsTitle);
 const saveState=document.createElement('span');saveState.id='ux-save-state';saveState.className='ux-save-state';saveState.setAttribute('role','status');saveState.setAttribute('aria-live','polite');saveState.textContent='No edits yet';
 save.parentNode.insertBefore(saveState,save);
 let dirty=false,saving=false,editVersion=0,savingVersion=0;
 const setState=(state)=>{
   saveState.dataset.state=state;
   saveState.textContent=state==='dirty'?'● Unsaved edits':state==='saving'?'◌ Saving…':state==='saved'?'✓ Changes saved':state==='error'?'! Save failed — retry':'No edits yet';
 };
 const markDirty=(e)=>{
   if(!e.target.closest('#settings-form'))return;
   if(e.target.matches('button,[type="file"],[type="submit"]'))return;
   dirty=true;editVersion++;if(!saving)setState('dirty');
 };
 form.addEventListener('input',markDirty);
 form.addEventListener('change',markDirty);
 document.addEventListener('pai:settings-save',e=>{
   const state=e.detail?.state;
   if(state==='saving'){saving=true;savingVersion=editVersion;setState('saving');}
   if(state==='saved'){saving=false;dirty=editVersion!==savingVersion;setState(dirty?'dirty':'saved');}
   if(state==='error'){saving=false;setState('error');}
 });
 window.addEventListener('beforeunload',e=>{
   if(!dirty)return;
   e.preventDefault();
   e.returnValue='';
 });
})();
