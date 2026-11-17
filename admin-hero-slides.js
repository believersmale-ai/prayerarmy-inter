(()=>{
 const list=document.getElementById('hero-slide-list'),url=document.getElementById('hero-slide-new-url'),enabled=document.getElementById('hero-slider-enabled'),duration=document.getElementById('hero-slide-duration');
 if(!list||!url||!enabled||!duration)return;
 let slides=[];
 const valid=(v)=>{try{const u=new URL(v,location.origin);return ['https:','http:'].includes(u.protocol)&&!v.startsWith('//')&&/\.(?:png|jpe?g|webp|gif|avif|mp4|webm)(?:[?#]|$)/i.test(u.pathname)}catch{return false}};
 const safe=(v)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sync=()=>{window.paiHeroSlidesDraft={slides:slides.map(x=>({url:x.url,alt:x.alt||''})),enabled:enabled.checked,duration:Math.max(4,Math.min(30,Number(duration.value)||7))}};
 const render=()=>{
  list.innerHTML=slides.length?slides.map((item,i)=>`<div class="hero-slide-row" data-i="${i}">
   <span class="hero-slide-index">${i+1}</span><div class="hero-slide-details"><strong>${safe(item.url.split('/').pop())}</strong>
   <input class="hero-slide-caption" aria-label="Description for slide ${i+1}" maxlength="180" placeholder="Accessible description / caption" value="${safe(item.alt||'')}"></div>
   <button type="button" data-act="up" aria-label="Move slide up" ${i===0?'disabled':''}>↑</button>
   <button type="button" data-act="down" aria-label="Move slide down" ${i===slides.length-1?'disabled':''}>↓</button>
   <button type="button" data-act="remove" aria-label="Remove slide">Remove</button></div>`).join(''):'<p class="hero-slide-empty">No rotation slides yet. The existing hero background will remain until you add one.</p>';
  sync();
 };
 window.addEventListener('pai:hero-settings-loaded',e=>{const h=e.detail.hero||{};slides=(Array.isArray(h.slides)?h.slides:[]).filter(x=>x&&valid(x.url)).slice(0,60).map(x=>({url:x.url,alt:String(x.alt||'').slice(0,180)}));enabled.checked=h.sliderEnabled!==false;duration.value=Math.max(4,Math.min(30,Number(h.slideDuration)||7));render()});
 document.getElementById('hero-slide-add-btn').addEventListener('click',()=>{const v=url.value.trim();if(!valid(v)){alert('Enter a valid image or MP4/WebM URL from the Media Uploader.');return}if(slides.length>=60){alert('Maximum 60 slides');return}slides.push({url:v,alt:''});url.value='';render()});
 list.addEventListener('click',e=>{const b=e.target.closest('button[data-act]');if(!b)return;const i=Number(b.closest('[data-i]').dataset.i);if(b.dataset.act==='remove')slides.splice(i,1);else if(b.dataset.act==='up'&&i>0)[slides[i-1],slides[i]]=[slides[i],slides[i-1]];else if(b.dataset.act==='down'&&i<slides.length-1)[slides[i+1],slides[i]]=[slides[i],slides[i+1]];render()});
 list.addEventListener('input',e=>{if(!e.target.matches('.hero-slide-caption'))return;slides[Number(e.target.closest('[data-i]').dataset.i)].alt=e.target.value;sync()});
 const slidePicker=document.getElementById('hero-slide-media-picker'),logoPicker=document.getElementById('logo-media-picker');
 const loadChoices=async()=>{
  if(!slidePicker||!logoPicker)return;
  try{
   const response=await fetch('/api/media',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   const items=(data.media||[]).filter(x=>x.isUpload&&valid(x.url));
   for(const select of [slidePicker,logoPicker]){
    select.replaceChildren(new Option(select===logoPicker?'Choose uploaded logo image…':'Choose uploaded media…',''));
    for(const item of items){if(select===logoPicker&&/\\.(mp4|webm)(?:[?#]|$)/i.test(item.url))continue;select.add(new Option(item.filename||item.url,item.url))}
   }
  }catch(err){console.warn('Media choices unavailable:',err.message)}
 };
 slidePicker?.addEventListener('change',()=>{if(slidePicker.value)url.value=slidePicker.value});
 logoPicker?.addEventListener('change',()=>{if(logoPicker.value){const field=document.getElementById('field-logo-url');if(field){field.value=logoPicker.value;field.dispatchEvent(new Event('input',{bubbles:true}))}const preview=document.getElementById('logo-preview');if(preview)preview.src=logoPicker.value}});
 document.addEventListener('pai:media-uploaded',loadChoices);
 document.addEventListener('pai:admin-ready',loadChoices);
 loadChoices();
 enabled.addEventListener('change',sync);duration.addEventListener('change',sync);
})();