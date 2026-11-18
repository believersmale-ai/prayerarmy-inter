// Student Academy access uses the existing public-account session middleware.
// Courses must be explicitly published by a future staff workflow.
import {Router} from 'express';
import {createAcademyExamRouter} from './academy-exams.js';
import {createAcademyCertificateRouter} from './academy-certificates.js';
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

 router.get('/courses/:id/progress',route(async(req,res)=>{
  const courseId=id(req.params.id);
  const [enrollments]=await db.execute("SELECT e.id,e.status FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.account_id=? AND e.status IN ('active','completed') AND c.status='published'",[courseId,req.publicAccount.id]);
  check(enrollments.length===1,403,'Active enrollment required');
  const [lessons]=await db.execute("SELECT l.id,l.title,CASE WHEN p.id IS NULL THEN 0 ELSE 1 END AS completed,p.completed_at FROM academy_lessons l LEFT JOIN academy_lesson_progress p ON p.lesson_id=l.id AND p.enrollment_id=? WHERE l.course_id=? AND l.published=1 ORDER BY l.position,l.id",[enrollments[0].id,courseId]);
  const [assessments]=await db.execute("SELECT a.id,a.title,a.kind,a.passing_percent,MAX(CASE WHEN t.status='graded' AND t.possible_points>0 AND t.earned_points*100>=t.possible_points*a.passing_percent THEN 1 ELSE 0 END) AS passed FROM academy_assessments a LEFT JOIN academy_attempts t ON t.assessment_id=a.id AND t.account_id=? WHERE a.course_id=? AND a.status IN ('active','closed') GROUP BY a.id,a.title,a.kind,a.passing_percent ORDER BY a.id",[req.publicAccount.id,courseId]);
  const completed=lessons.filter(l=>l.completed).length;
  const passed=assessments.filter(a=>Number(a.passed)===1).length;
  res.json({course_id:courseId,enrollment_status:enrollments[0].status,lessons:{completed,total:lessons.length,items:lessons.map(l=>({id:String(l.id),title:l.title,completed:Boolean(l.completed),completed_at:l.completed_at}))},assessments:{passed,total:assessments.length,items:assessments.map(a=>({id:String(a.id),title:a.title,kind:a.kind,passed:Boolean(a.passed)}))},eligible_for_completion:lessons.length>0&&completed===lessons.length&&passed===assessments.length});
 }));
 router.post('/lessons/:id/complete',route(async(req,res)=>{
  const lessonId=id(req.params.id);
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT l.id,e.id AS enrollment_id FROM academy_lessons l JOIN academy_courses c ON c.id=l.course_id JOIN academy_enrollments e ON e.course_id=c.id AND e.account_id=? WHERE l.id=? AND l.published=1 AND c.status='published' AND e.status IN ('active','completed') FOR UPDATE",[req.publicAccount.id,lessonId]);
   check(rows.length===1,403,'Published lesson and active enrollment required');
   await conn.execute('INSERT IGNORE INTO academy_lesson_progress(enrollment_id,lesson_id,completed_at) VALUES (?,?,UTC_TIMESTAMP())',[rows[0].enrollment_id,lessonId]);
   await conn.commit();res.json({success:true,lesson_id:lessonId,completed:true});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 router.use(createAcademyCertificateRouter(db));
 router.use(createAcademyExamRouter(db));
 return router;
}
