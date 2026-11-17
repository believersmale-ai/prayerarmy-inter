(()=>{
 const section=document.getElementById('gallery');if(!section)return;
 const container=section.querySelector('.container');if(!container)return;
 const wrap=document.createElement('div');wrap.className='mp-public';wrap.hidden=true;
 const heading=document.createElement('h3');heading.textContent='Latest ministry moments';
 const grid=document.createElement('div');grid.className='mp-public-grid';
 wrap.append(heading,grid);container.append(wrap);
 fetch('/api/public/media-posts',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
  for(const post of data.posts||[]){
   const figure=document.createElement('figure');
   const media=document.createElement(post.type==='video'?'video':'img');
   media.src=post.url;
   if(post.type==='video'){media.controls=true;media.preload='metadata';media.playsInline=true;}
   else{media.loading='lazy';media.alt=post.alt_text||post.caption||'Prayer Army International ministry moment';}
   figure.append(media);
   if(post.caption){const caption=document.createElement('figcaption');caption.textContent=post.caption;figure.append(caption);}
   grid.append(figure);
  }
  wrap.hidden=!grid.children.length;
 }).catch(()=>{wrap.hidden=true;});
})();
