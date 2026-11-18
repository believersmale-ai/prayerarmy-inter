// Phase 2: staff-only draft course and lesson management.
// Disabled by default until migration 006 and staging QA are complete.
import {Router} from 'express';
import {sameOrigin} from './node-auth.js';
import {check,required,optional,clean,route} from './node-common.js';
const numericId=value=>{const v=String(value??'');check(/^[1-9]\d{0,18}$/.test(v),400,'Invalid identifier');return v};
const draftCourse=body=>({
 title:required(body?.title,200,'Course title'),
 slug:required(body?.slug,200,'Course slug').toLowerCase(),
 description:optional(body?.description,10000)
});
export function createAcademyStaffRouter({db,staff}){
 const router=Router();
 router.use(staff.authorize);
 router.use(route(async(req,res,next)=>{
  check(req.staff?.permissions?.includes('security'),403,'Academy management requires a system administrator');
  check(process.env.PAI_ACADEMY_STAFF_ENABLED==='true',503,'Academy is not enabled');
  res.setHeader('Cache-Control','no-store');next();
 }));
 router.use((req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():sameOrigin(req,res,next));
 router.get('/courses',route(async(req,res)=>{
  const [rows]=await db.execute('SELECT id,title,slug,description,status,created_at,updated_at FROM academy_courses ORDER BY id DESC LIMIT 200');
  res.json({courses:rows});
 }));
 router.post('/courses',route(async(req,res)=>{
  const course=draftCourse(req.body);
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug),400,'Slug must use lowercase letters, numbers and hyphens');
  const [result]=await db.execute('INSERT INTO academy_courses(title,slug,description,status) VALUES (?,?,?,\'draft\')',[course.title,course.slug,course.description]);
  res.status(201).json({id:String(result.insertId),status:'draft'});
 }));
 router.put('/courses/:id',route(async(req,res)=>{
  const id=numericId(req.params.id),course=draftCourse(req.body);
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug),400,'Invalid course slug');
  const [result]=await db.execute('UPDATE academy_courses SET title=?,slug=?,description=? WHERE id=? AND status=\'draft\'',[course.title,course.slug,course.description,id]);
  check(result.affectedRows===1,409,'Course not found or no longer a draft');
  res.json({success:true});
 }));
 router.get('/courses/:id/lessons',route(async(req,res)=>{
  const id=numericId(req.params.id);
  const [rows]=await db.execute('SELECT id,course_id,title,content,position,published FROM academy_lessons WHERE course_id=? ORDER BY position,id LIMIT 300',[id]);
  res.json({lessons:rows});
 }));
 router.post('/courses/:id/lessons',route(async(req,res)=>{
  const courseId=numericId(req.params.id),title=required(req.body?.title,200,'Lesson title');
  const content=optional(req.body?.content,50000);
  const position=Number(req.body?.position??0);
  check(Number.isSafeInteger(position)&&position>=0&&position<=100000,400,'Invalid lesson order');
  // Lock course row and insert within one transaction; never mutate a published course.
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute('SELECT status FROM academy_courses WHERE id=? FOR UPDATE',[courseId]);
   check(rows[0]?.status==='draft',409,'Lessons can only be added to draft courses');
   const [result]=await conn.execute('INSERT INTO academy_lessons(course_id,title,content,position,published) VALUES (?,?,?,?,0)',[courseId,title,content,position]);
   await conn.commit();
   res.status(201).json({id:String(result.insertId),published:false});
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
 }));
 return router;
}
