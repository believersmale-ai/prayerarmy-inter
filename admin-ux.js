/* Navigation enhancement only: retains original data-view buttons and admin.js handlers. */
(() => {
  const sidebar=document.querySelector('.sidebar'),main=document.querySelector('.main-area');
  if(!sidebar||!main)return;
  const groups=[],titles=[...sidebar.querySelectorAll('.nav-group-title')];
  titles.forEach((title,index)=>{
    const group=document.createElement('section');group.className='ux-nav-group';
    const heading=document.createElement('button');heading.type='button';heading.className='ux-group-heading';
    heading.textContent=title.textContent.trim();heading.setAttribute('aria-expanded','true');
    const content=document.createElement('div');content.className='ux-group-items';
    let next=title.nextElementSibling;
    while(next&&!next.classList.contains('nav-group-title')){const moving=next;next=next.nextElementSibling;content.appendChild(moving);}
    title.replaceWith(group);group.append(heading,content);
    heading.addEventListener('click',()=>{const open=heading.getAttribute('aria-expanded')!=='true';heading.setAttribute('aria-expanded',String(open));content.hidden=!open;});
    groups.push({heading,content,group});
  });
  const tools=document.createElement('div');tools.className='ux-sidebar-tools';
  const label=document.createElement('label');label.htmlFor='ux-nav-search';label.className='ux-search-label';label.textContent='Find a section';
  const search=document.createElement('input');search.id='ux-nav-search';search.type='search';search.placeholder='Search pages…';search.autocomplete='off';search.setAttribute('aria-keyshortcuts','/');
  const hint=document.createElement('div');hint.className='ux-search-hint';hint.textContent='Press / to search · Esc to clear';
  tools.append(label,search,hint);sidebar.prepend(tools);
  const top=document.createElement('div');top.className='ux-workspace-bar';
  const crumbs=document.createElement('div');crumbs.className='ux-crumbs';crumbs.setAttribute('aria-live','polite');
  const quick=document.createElement('div');quick.className='ux-quick-links';
  [['Dashboard','view-dashboard'],['Edit homepage','view-hero'],['Media','view-media'],['Events','view-events']].forEach(([name,id])=>{
    const b=document.createElement('button');b.type='button';b.className='ux-quick-link';b.textContent=name;
    b.addEventListener('click',()=>sidebar.querySelector('[data-view="'+id+'"]')?.click());quick.append(b);
  });
  top.append(crumbs,quick);main.prepend(top);
  function refresh(){
    const active=sidebar.querySelector('.sidebar-btn.active')||sidebar.querySelector('[data-view="view-dashboard"]');
    if(!active)return;
    const heading=active.closest('.ux-nav-group')?.querySelector('.ux-group-heading');
    const label=active.textContent.trim().replace(/\s+/g,' ');
    crumbs.textContent=(heading?.textContent||'Overview')+' / '+label;
    const group=active.closest('.ux-nav-group');
    if(group && !search.value){const h=group.querySelector('.ux-group-heading'),c=group.querySelector('.ux-group-items');h.setAttribute('aria-expanded','true');c.hidden=false;}
  }
  function filter(){
    const term=search.value.toLocaleLowerCase().trim();
    groups.forEach(({heading,content,group})=>{
      let shown=0;
      content.querySelectorAll('.sidebar-btn').forEach(b=>{
        const matches=b.textContent.toLocaleLowerCase().includes(term);
        b.hidden=Boolean(term)&&!matches;if(matches)shown++;
      });
      group.hidden=Boolean(term)&&!shown;
      if(term){content.hidden=false;heading.setAttribute('aria-expanded','true');}
    });
  }
  search.addEventListener('input',filter);
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=sidebar.querySelector('.sidebar-btn:not([hidden])');if(first){first.click();search.value='';filter();search.blur();}}if(e.key==='Escape'){search.value='';filter();search.blur();}});
  document.addEventListener('keydown',e=>{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!document.activeElement?.isContentEditable){e.preventDefault();search.focus();}
  });
  sidebar.addEventListener('click',e=>{if(e.target.closest('.sidebar-btn'))requestAnimationFrame(refresh);});
  const observer=new MutationObserver(refresh);
  sidebar.querySelectorAll('.sidebar-btn').forEach(b=>observer.observe(b,{attributes:true,attributeFilter:['class']}));
  refresh();
})();
