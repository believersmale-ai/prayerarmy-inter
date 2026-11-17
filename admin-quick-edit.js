/* Simple content editor: mirrors existing settings fields and delegates saving
   to the established authenticated, revision-checked admin workflow. */
(()=>{
'use strict';
const root=document.getElementById('view-quick-edit'),section=document.getElementById('qe-section'),search=document.getElementById('qe-search'),list=document.getElementById('qe-fields'),status=document.getElementById('qe-status');
if(!root||!section||!search||!list)return;
const groups=[
 ['view-hero','Homepage hero & slides'],
 ['view-general','Church details & logo'],
 ['view-about','About, mission & vision'],
 ['view-sermons','Sermons & videos'],
 ['view-events','Events & programmes'],
 ['view-announcements','Announcements'],
 ['view-give','Giving & donations'],
 ['view-prayer','Prayer ministry'],
 ['view-social','Social media links'],
 ['view-live','Livestream'],
 ['view-extras','Other website content']
];
for(const [id,title] of groups){if(document.getElementById(id))section.add(new Option(title,id))}
const friendly=id=>id.replace(/^field-/,'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const labelOf=el=>{const explicit=document.querySelector('label[for="'+el.id+'"]');const wrapping=el.closest('label');return (explicit||wrapping)?.textContent?.replace(/\s+/g,' ').trim()||friendly(el.id)};
const eligible=el=>el.id&&el.id.startsWith('field-')&&!el.disabled&&!['hidden','password','file','submit','button'].includes(el.type)&&!el.matches('[readonly], [contenteditable]')&&el.id!=='field-page-content'&&el.closest('.tab-view')?.id!=='view-quick-edit'&&!/token|secret|passkey|password|json|html|css|script/i.test(el.id);
const fieldsFor=id=>[...(document.getElementById(id)?.querySelectorAll('input,textarea,select')||[])].filter(eligible);
const makeField=original=>{
 const box=document.createElement('div');box.className='qe-field';
 const label=document.createElement('label');label.textContent=labelOf(original);box.append(label);
 const help=document.createElement('small');help.textContent=original.placeholder||'';if(help.textContent)box.append(help);
 let input;
 if(original.type==='checkbox'){input=document.createElement('input');input.type='checkbox';input.checked=original.checked;box.classList.add('qe-checkbox')}
 else if(original.tagName==='TEXTAREA'){input=document.createElement('textarea');input.rows=3;input.value=original.value}
 else if(original.tagName==='SELECT'){input=document.createElement('select');for(const o of original.options)input.add(new Option(o.text,o.value));input.value=original.value}
 else{input=document.createElement('input');input.type=['url','email','number','tel','date','color'].includes(original.type)?original.type:'text';input.value=original.value;if(original.maxLength>0)input.maxLength=original.maxLength}
 label.htmlFor='qe-'+original.id;input.id='qe-'+original.id;
 const write=()=>{if(original.type==='checkbox')original.checked=input.checked;else original.value=input.value;original.dispatchEvent(new Event('input',{bubbles:true}));original.dispatchEvent(new Event('change',{bubbles:true}));status.textContent='Unsaved edits — use Save Changes to publish.'};
 input.addEventListener(original.type==='checkbox'||original.tagName==='SELECT'?'change':'input',write);
 box.append(input);
 const jump=document.createElement('button');jump.type='button';jump.className='qe-jump';jump.textContent='Advanced options ↗';jump.addEventListener('click',()=>{const id=original.closest('.tab-view')?.id;document.querySelector('.sidebar-btn[data-view="'+id+'"]')?.click();original.scrollIntoView({block:'center',behavior:'smooth'});original.focus({preventScroll:true})});box.append(jump);
 return box;
};
function render(){
 const id=section.value,q=search.value.trim().toLowerCase();list.replaceChildren();
 const fields=fieldsFor(id).filter(el=>!q||(labelOf(el)+' '+el.id+' '+el.placeholder).toLowerCase().includes(q));
 if(!fields.length){const p=document.createElement('p');p.className='qe-empty';p.textContent='No simple fields found. Try another section or use the full editor in the left menu.';list.append(p);return}
 for(const el of fields)list.append(makeField(el));
}
section.addEventListener('change',()=>{search.value='';render()});search.addEventListener('input',render);
document.getElementById('qe-save')?.addEventListener('click',()=>{const button=document.getElementById('btn-save-all');if(!button||button.hidden||button.style.display==='none'){status.textContent='Your account does not have permission to publish settings.';return}status.textContent='Saving… check the notification for confirmation.';button.click()});
document.getElementById('qe-preview')?.addEventListener('click',()=>document.getElementById('btn-preview')?.click());
document.querySelector('.sidebar-btn[data-view="view-quick-edit"]')?.addEventListener('click',()=>{render();status.textContent=''});
document.addEventListener('pai:admin-ready',()=>{render()});
if(section.options.length)render();
})();