(()=>{
 const view=document.getElementById('view-media');if(!view)return;
 const panel=document.createElement('section');panel.className='mp-panel';
 panel.innerHTML='<div class="mp-head"><div><h3>Publish media to the website</h3><p>Add captions to uploaded photos or videos, then publish them to the homepage gallery.</p></div><button type="button" id="mp-refresh">Refresh</button></div><p class="mp-status" id="mp-status" role="status" aria-live="polite"></p><div class="mp-list" id="mp-list"></div>';
 const anchor=view.querySelector('.upload-progress-box');(anchor||view.querySelector('.upload-dropzone'))?.after(panel);
 const status=panel.querySelector('#mp-status'),list=panel.querySelector('#mp-list');
 async function refresh(){
  status.textContent='Loading uploaded media…';
  try{
   const [a,b]=await Promise.all([fetch('/api/media',{credentials:'same-origin',cache:'no-store'}),fetch('/api/admin/media-posts',{credentials:'same-origin',cache:'no-store'})]);
   if(!a.ok||!b.ok)throw Error((await (a.ok?b:a).json().catch(()=>({}))).error||'Could not load media publishing');
   const media=(await a.json()).media.filter(m=>m.isUpload&&(m.type==='image'||m.type==='video'));
   const records=new Map((await b.json()).posts.map(p=>[p.filename,p]));
   list.replaceChildren();
   for(const item of media){
    const record=records.get(item.filename)||{};
    const card=document.createElement('form');card.className='mp-item';
    const preview=document.createElement(item.type==='video'?'video':'img');
    preview.src='/assets/uploads/'+encodeURIComponent(item.filename);
    if(item.type==='video'){preview.controls=true;preview.preload='metadata';}
    else{preview.loading='lazy';preview.alt=record.alt_text||item.filename;}
    const fields=document.createElement('div');fields.className='mp-fields';
    const heading=document.createElement('strong');heading.textContent=item.filename;
    const cap=document.createElement('textarea');cap.maxLength=500;cap.rows=2;cap.placeholder='Caption shown on the public website';cap.value=record.caption||'';cap.setAttribute('aria-label','Caption for '+item.filename);
    const alt=document.createElement('input');alt.maxLength=255;alt.placeholder='Describe the photo or video for accessibility';alt.value=record.alt_text||'';alt.setAttribute('aria-label','Alternative text for '+item.filename);
    const publish=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(record.published);publish.append(check,document.createTextNode(' Show on homepage'));
    const save=document.createElement('button');save.type='submit';save.textContent='Save media details';
    const msg=document.createElement('span');msg.className='mp-item-message';msg.setAttribute('role','status');
    fields.append(heading,cap,alt,publish,save,msg);card.append(preview,fields);list.append(card);
    card.addEventListener('submit',async e=>{
      e.preventDefault();save.disabled=true;msg.textContent='Saving…';
      try{
       const res=await fetch('/api/admin/media-posts/'+encodeURIComponent(item.filename),{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({caption:cap.value,alt_text:alt.value,published:check.checked})});
       const data=await res.json();if(!res.ok||!data.success)throw Error(data.error||'Save failed');
       msg.textContent='Saved. Published items appear in the homepage gallery.';
      }catch(err){msg.textContent=err.message;}finally{save.disabled=false;}
    });
   }
   status.textContent=media.length?media.length+' uploaded photos/videos available to publish.':'No uploaded photos or videos yet. Upload above first.';
  }catch(err){status.textContent=err.message;}
 }
 panel.querySelector('#mp-refresh').addEventListener('click',refresh);
 document.addEventListener('pai:admin-ready',refresh);
 document.addEventListener('pai:media-uploaded',refresh);
 // Reload when returning to Media Uploader after uploading.
 const button=document.querySelector('.sidebar-btn[data-view="view-media"]');
 button?.addEventListener('click',()=>{setTimeout(refresh,150);});
})();
