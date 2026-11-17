// Media captions are separate from the media bytes and live in the existing MySQL database.
import path from 'node:path';
import fs from 'node:fs';
export function registerMediaPosts(app,{db,staff,sameOrigin,uploadDir,mediaTypeOf}){
 const valid=(name)=>typeof name==='string'&&name.length<=255&&name===path.basename(name)&&!name.startsWith('.')&&Boolean(mediaTypeOf(name));
 const fail=(res,err)=>{console.error('Media posts:',err.code||err.message);res.status(503).json({error:'Media captions database unavailable. Apply migration 004.'});};
 app.get('/api/public/media-posts',async(req,res)=>{
   try{
     const [rows]=await db.execute("SELECT filename,caption,alt_text,created_at FROM site_media_posts WHERE published=1 ORDER BY created_at DESC LIMIT 60");
     const posts=rows.filter(r=>valid(r.filename)&&fs.existsSync(path.join(uploadDir,r.filename))).map(r=>({...r,type:mediaTypeOf(r.filename),url:'/assets/uploads/'+encodeURIComponent(r.filename)}));
     res.setHeader('Cache-Control','no-store');res.json({posts});
   }catch(e){fail(res,e);}
 });
 app.get('/api/admin/media-posts',...staff.permit('media'),async(req,res)=>{
   try{const [posts]=await db.execute('SELECT filename,caption,alt_text,published,created_at FROM site_media_posts ORDER BY created_at DESC LIMIT 500');res.setHeader('Cache-Control','no-store');res.json({posts});}catch(e){fail(res,e);}
 });
 app.put('/api/admin/media-posts/:filename',...staff.permit('media'),sameOrigin,async(req,res)=>{
   const filename=req.params.filename;
   if(!valid(filename)||!fs.existsSync(path.join(uploadDir,filename)))return res.status(400).json({error:'Select an existing uploaded media file'});
   const caption=req.body?.caption,alt=req.body?.alt_text,published=req.body?.published;
   if(typeof caption!=='string'||caption.length>500||typeof alt!=='string'||alt.length>255||typeof published!=='boolean')return res.status(400).json({error:'Invalid caption, alternative text or publish setting'});
   try{
     await db.execute('INSERT INTO site_media_posts (filename,caption,alt_text,published) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE caption=VALUES(caption),alt_text=VALUES(alt_text),published=VALUES(published)',[filename,caption.trim(),alt.trim(),published?1:0]);
     res.json({success:true});
   }catch(e){fail(res,e);}
 });
 app.delete('/api/admin/media-posts/:filename',...staff.permit('media'),sameOrigin,async(req,res)=>{
   if(!valid(req.params.filename))return res.status(400).json({error:'Invalid filename'});
   try{await db.execute('DELETE FROM site_media_posts WHERE filename=?',[req.params.filename]);res.json({success:true});}catch(e){fail(res,e);}
 });
}
