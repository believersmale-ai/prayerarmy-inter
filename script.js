/* ========= SITE SETTINGS — fill these in; anything left blank is hidden or falls back gracefully ========= */
const SITE = {
  links: { live:'https://www.youtube.com/@prophetsugloprosper/live', sermons:'https://www.youtube.com/@prophetsugloprosper/videos', latestSermon:'https://www.youtube.com/@prophetsugloprosper/videos', events:'', event:'', gallery:'', give:'', contact:'' },
  social: { youtube:'https://www.youtube.com/@prophetsugloprosper', facebook:'', instagram:'', tiktok:'', x:'' },
  phone:'', whatsapp:'', email:'', address:'',
  prayerEndpoint:'',            // e.g. a Formspree / Supabase edge-function URL (receives JSON via POST)
  eventStart:'2026-11-23T00:00:00Z', eventEnd:'2026-11-28T00:00:00Z'   // Manifests Conference 2026 (Ghana = UTC)
};
/* ============================================================================================================ */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
document.documentElement.classList.add('js');

// Header, mobile menu
const header=$('.site-header'), nav=$('.nav'), toggle=$('.menu-toggle');
const setMenu=o=>{nav.classList.toggle('open',o);toggle.setAttribute('aria-expanded',o);toggle.textContent=o?'✕':'☰';toggle.setAttribute('aria-label',o?'Close menu':'Open menu')};
toggle?.addEventListener('click',()=>setMenu(!nav.classList.contains('open')));
$$('.nav a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
addEventListener('keydown',e=>{if(e.key==='Escape')setMenu(false)});
const onScroll=()=>header.classList.toggle('scrolled',scrollY>30);onScroll();addEventListener('scroll',onScroll,{passive:true});

// Scroll-spy
const navLinks=$$('.nav a[href^="#"]');
const spy=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)navLinks.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+e.target.id))}),{rootMargin:'-45% 0px -50% 0px'});
navLinks.forEach(a=>{const s=$(a.getAttribute('href'));s&&spy.observe(s)});

// Reveal on scroll
const rv=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rv.unobserve(e.target)}}),{threshold:.12});
$$('.reveal').forEach(el=>rv.observe(el));

// Configurable links (hide if unset unless a fallback is given)
$$('[data-link]').forEach(a=>{const u=SITE.links[a.dataset.link];
  if(u){a.href=u;if(/^https?:/.test(u)){a.target='_blank';a.rel='noopener'}}
  else if(a.dataset.fallback)a.href=a.dataset.fallback; else a.hidden=true});

// Footer contact + socials
const names={youtube:'YouTube',facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',x:'X'};
const soc=$('#socials');
Object.entries(SITE.social).filter(([,u])=>u).forEach(([k,u])=>{const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';a.textContent=names[k];soc?.append(a)});
const cl=$('#contact-lines'),lines=[];
if(SITE.address)lines.push(SITE.address);
if(SITE.phone)lines.push(`<a href="tel:${SITE.phone.replace(/\s/g,'')}">${SITE.phone}</a>`);
if(SITE.whatsapp)lines.push(`<a href="https://wa.me/${SITE.whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>`);
if(SITE.email)lines.push(`<a href="mailto:${SITE.email}">${SITE.email}</a>`);
if(lines.length&&cl)cl.innerHTML=lines.join('<br>');
$('#year').textContent=new Date().getFullYear();

// Event countdown
const cd=$('#countdown');
if(cd){const s=new Date(SITE.eventStart),e=new Date(SITE.eventEnd);
  const tick=()=>{const n=new Date(),d=s-n;
    if(n>=e){cd.hidden=true;return}
    if(d<=0){cd.innerHTML='<strong class="live-now">Happening now</strong>';return}
    const v=[Math.floor(d/864e5),Math.floor(d/36e5)%24,Math.floor(d/6e4)%60];
    cd.innerHTML=['Days','Hrs','Min'].map((l,i)=>`<div><b>${String(v[i]).padStart(2,'0')}</b><small>${l}</small></div>`).join('');
    cd.setAttribute('aria-label',`${v[0]} days, ${v[1]} hours until the conference`)};
  tick();setInterval(tick,3e4)}

// Gallery lightbox
const lb=$('#lightbox'),figs=$$('.gallery-grid figure');let cur=0;
const show=i=>{cur=(i+figs.length)%figs.length;const im=$('img',figs[cur]);$('img',lb).src=im.src;$('img',lb).alt=im.alt;$('figcaption',lb).textContent=im.alt;$('.lb-count',lb).textContent=`${cur+1} / ${figs.length}`};
figs.forEach((f,i)=>{f.tabIndex=0;f.setAttribute('role','button');f.setAttribute('aria-label','Enlarge: '+$('img',f).alt);
  const open=()=>{show(i);lb.showModal()};f.addEventListener('click',open);f.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})});
$('.lb-close',lb).onclick=()=>lb.close();$('.lb-prev',lb).onclick=()=>show(cur-1);$('.lb-next',lb).onclick=()=>show(cur+1);
lb.addEventListener('click',e=>{if(e.target===lb)lb.close()});
lb.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(cur-1);if(e.key==='ArrowRight')show(cur+1)});

// Prayer form
const form=$('#prayer-form'),note=$('#prayer-note');
form?.addEventListener('submit',async e=>{e.preventDefault();
  const data=Object.fromEntries(new FormData(form)),btn=$('button[type=submit]',form);
  const done=m=>{note.textContent=m;note.className='form-note ok';form.reset()};
  try{
    if(SITE.prayerEndpoint){btn.disabled=true;btn.classList.add('loading');
      const r=await fetch(SITE.prayerEndpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});
      if(!r.ok)throw 0;done('Thank you — your request has been received and we are standing with you in prayer.')}
    else if(SITE.email){location.href=`mailto:${SITE.email}?subject=${encodeURIComponent('Prayer request')}&body=${encodeURIComponent(`Name: ${data.name}\nContact: ${data.contact||'-'}\nConfidential: ${data.private?'Yes':'No'}\n\n${data.request}`)}`;done('Your email app is opening so you can send your request.')}
    else{console.info('Prayer form: set SITE.prayerEndpoint or SITE.email in script.js');done('Thank you. Your request has been noted.')}
  }catch{note.textContent='Sorry, something went wrong. Please try again in a moment.';note.className='form-note err'}
  btn.disabled=false;btn.classList.remove('loading')});
