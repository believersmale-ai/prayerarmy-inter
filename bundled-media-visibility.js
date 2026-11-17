// Bundled media visibility is metadata only: no files are ever removed.
import fs from 'node:fs';
import path from 'node:path';
export function registerBundledMediaVisibility(app,{db,staff,sameOrigin,imagesDir}){
 const protectedNames=new Set(['prayer-army-logo.png']);
 const valid=(filename)=>typeof filename==='string'&&filename.length<=255&&filename===path.basename(filename)&&!filename.startsWith('.')&&fs.existsSync(path.join(imagesDir,filename))&&fs.statSync(path.join(imagesDir,filename)).isFile();
 const fail=(res,err)=>{console.error('Bundled media visibility:',err.code||err.message);res.status(503).json({error:'Bundled media visibility database unavailable. Apply migration 005.'});};
 app.get('/api/admin/hidden-assets',...staff.permit('media'),async(req,res)=>{
  try{const [rows]=await db.execute('SELECT filename FROM site_hidden_assets ORDER BY hidden_at DESC');res.setHeader('Cache-Control','no-store');res.json({filenames:rows.map(r=>r.filename)});}catch(e){fail(res,e);}
 });
 app.put('/api/admin/hidden-assets/:filename',...staff.permit('media'),sameOrigin,async(req,res)=>{
  const filename=req.params.filename;
  if(!valid(filename))return res.status(400).json({error:'Not a bundled church asset'});
  if(protectedNames.has(filename.toLowerCase()))return res.status(403).json({error:'This official church logo is protected and cannot be hidden'});
  if(typeof req.body?.hidden!=='boolean')return res.status(400).json({error:'Expected hidden true or false'});
  try{
   if(req.body.hidden)await db.execute('INSERT IGNORE INTO site_hidden_assets (filename) VALUES (?)',[filename]);
   else await db.execute('DELETE FROM site_hidden_assets WHERE filename=?',[filename]);
   res.json({success:true,hidden:req.body.hidden});
  }catch(e){fail(res,e);}
 });
}
