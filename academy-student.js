// Student Academy access uses the existing public-account session middleware.
// Courses must be explicitly published by a future staff workflow.
import {Router} from 'express';
import {check,route} from './node-common.js';
const id=value=>{const v=String(value??'');check(/^[1-9][0-9]{0,18}$/.test(v),400,'Invalid course ID');return v;};
export function createAcademyStudentRouter(db){
 const router=Router();
 router.use((req,res,next)=>process.env.PAI_ACADEMY_STUDENTS_ENABLED==='true'?next():res.status(404).json({error:'Not found'}));
 router.use((req,res,next)=>{
  if(!req.publicAccount?.roles?.some(role=>role==='student'||role==='member'))return res.status(403).json({error:'An approved member or student account is required'});
  res.set('Cache-Control','no-store');next();
 });
 router.get('/courses',route(async(req,res)=>{
  const [courses]=await db.execute("SELECT id,title,slug,description FROM academy_courses WHERE status='published' ORDER BY id DESC LIMIT 100");
  res.json({courses});
 }));
 router.get('/my-courses',route(async(req,res)=>{
  const [courses]=await db.execute("SELECT c.id,c.title,c.slug,e.status AS enrollment_status,e.enrolled_at,e.completed_at FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.account_id=? ORDER BY e.enrolled_at DESC LIMIT 100",[req.publicAccount.id]);
  res.json({courses});
 }));
 router.post('/courses/:id/enroll',route(async(req,res)=>{
  const courseId=id(req.params.id);
  const connection=await db.getConnection();
  try{
   await connection.beginTransaction();
   const [courses]=await connection.execute("SELECT id FROM academy_courses WHERE id=? AND status='published' FOR UPDATE",[courseId]);
   check(courses.length===1,404,'Course unavailable');
   const [existing]=await connection.execute('SELECT status FROM academy_enrollments WHERE course_id=? AND account_id=? FOR UPDATE',[courseId,req.publicAccount.id]);
   if(existing.length){await connection.commit();return res.json({enrollmentStatus:existing[0].status,alreadyEnrolled:true});}
   await connection.execute("INSERT INTO academy_enrollments(course_id,account_id,status) VALUES (?,?,'active')",[courseId,req.publicAccount.id]);
   await connection.commit();res.status(201).json({enrollmentStatus:'active',alreadyEnrolled:false});
  }catch(err){await connection.rollback();if(err.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Enrollment already exists'});throw err}finally{connection.release()}
 }));
 router.get('/courses/:id/lessons',route(async(req,res)=>{
  const courseId=id(req.params.id);
  const [enrollment]=await db.execute("SELECT 1 FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.account_id=? AND e.status IN ('active','completed') AND c.status='published' LIMIT 1",[courseId,req.publicAccount.id]);
  check(enrollment.length===1,403,'Active enrollment required');
  const [lessons]=await db.execute('SELECT id,title,content,position FROM academy_lessons WHERE course_id=? AND published=1 ORDER BY position,id LIMIT 300',[courseId]);
  res.json({lessons});
 }));
 return router;
}
