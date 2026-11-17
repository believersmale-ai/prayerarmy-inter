(()=>{
 const host=document.getElementById('hero-media'),hero=document.getElementById('hero-section');if(!host||!hero)return;
 let slides=[],index=0,timer=null,activeVideo=null,enabled=true,duration=7000;
 const isVideo=u=>/\.(mp4|webm)(?:[?#]|$)/i.test(u);
 const valid=u=>{try{const v=new URL(u,location.origin);return ['https:','http:'].includes(v.protocol)&&!String(u).startsWith('//')&&/\.(?:png|jpe?g|webp|gif|avif|mp4|webm)(?:[?#]|$)/i.test(v.pathname)}catch{return false}};
 const controls=document.createElement('div');controls.className='hero-carousel-controls';controls.setAttribute('aria-label','Hero slideshow controls');controls.innerHTML='<button type="button" data-action="prev" aria-label="Previous slide">‹</button><span class="hero-carousel-count" aria-live="polite"></span><button type="button" data-action="next" aria-label="Next slide">›</button><button type="button" data-action="pause" aria-label="Pause slideshow">Ⅱ</button>';hero.append(controls);
 const stop=()=>{if(timer){clearTimeout(timer);timer=null}};
 const schedule=()=>{stop();if(!enabled||slides.length<2||document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;timer=setTimeout(()=>show(index+1),duration)};
 const show=n=>{
  if(!slides.length)return;stop();if(activeVideo){activeVideo.pause();activeVideo=null}
  index=(n+slides.length)%slides.length;const item=slides[index];host.querySelectorAll('.hero-slide-layer').forEach(el=>el.remove());host.style.backgroundImage='none';
  const layer=document.createElement('div');layer.className='hero-slide-layer';
  if(isVideo(item.url)){const video=document.createElement('video');video.src=item.url;video.muted=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-hidden','true');video.addEventListener('ended',()=>show(index+1),{once:true});video.addEventListener('error',()=>schedule(),{once:true});layer.append(video);activeVideo=video;video.play().catch(()=>schedule())}
  else{const image=document.createElement('img');image.src=item.url;image.alt='';image.decoding='async';image.addEventListener('error',()=>schedule(),{once:true});layer.append(image)}
  host.append(layer);host.setAttribute('aria-label',item.alt||'Prayer Army International worship');controls.querySelector('.hero-carousel-count').textContent=`${index+1} / ${slides.length}`;schedule();
 };
 controls.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;if(b.dataset.action==='prev')show(index-1);else if(b.dataset.action==='next')show(index+1);else{enabled=!enabled;b.textContent=enabled?'Ⅱ':'▶';b.setAttribute('aria-label',enabled?'Pause slideshow':'Play slideshow');if(enabled)schedule();else stop()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();activeVideo?.pause()}else{activeVideo?.play().catch(()=>{});schedule()}});
 async function init(){
  try{
   const response=await fetch('/api/settings',{cache:'no-store'});if(!response.ok)return;
   const data=await response.json(),h=data.hero||{},logo=String(data.general?.logoUrl||'').split('?')[0].toLowerCase();
   slides=(Array.isArray(h.slides)?h.slides:[]).filter(x=>x&&valid(x.url)&&String(x.url).split('?')[0].toLowerCase()!==logo).slice(0,60);
   if(!slides.length)return;
   enabled=h.sliderEnabled!==false;duration=Math.max(4,Math.min(30,Number(h.slideDuration)||7))*1000;
   controls.hidden=slides.length<2;show(0);
   if(!enabled){controls.querySelector('[data-action="pause"]').textContent='▶';controls.querySelector('[data-action="pause"]').setAttribute('aria-label','Play slideshow')}
  }catch(err){console.warn('Hero rotation unavailable:',err.message)}
 }
 init();
})();