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
 router.get('/dashboard',route(async(req,res)=>{
  const accountId=req.publicAccount.id;
  const [enrollments]=await db.execute("SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM academy_enrollments WHERE account_id=?",[accountId]);
  const [progress]=await db.execute("SELECT COUNT(*) AS completed_lessons FROM academy_lesson_progress p JOIN academy_enrollments e ON e.id=p.enrollment_id WHERE e.account_id=?",[accountId]);
  const [attempts]=await db.execute("SELECT COUNT(*) AS total,SUM(CASE WHEN status='graded' THEN 1 ELSE 0 END) AS graded FROM academy_attempts WHERE account_id=?",[accountId]);
  const [nextLessons]=await db.execute("SELECT c.id AS course_id,c.title AS course_title,l.id AS lesson_id,l.title AS lesson_title FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id JOIN academy_lessons l ON l.course_id=c.id AND l.published=1 LEFT JOIN academy_lesson_progress p ON p.enrollment_id=e.id AND p.lesson_id=l.id WHERE e.account_id=? AND e.status='active' AND c.status='published' AND p.id IS NULL ORDER BY e.enrolled_at DESC,l.position,l.id LIMIT 5",[accountId]);
  res.json({enrollments:Number(enrollments[0].total),completed_courses:Number(enrollments[0].completed||0),completed_lessons:Number(progress[0].completed_lessons),exam_attempts:Number(attempts[0].total),graded_attempts:Number(attempts[0].graded||0),continue_learning:nextLessons.map(l=>({course_id:String(l.course_id),course_title:l.course_title,lesson_id:String(l.lesson_id),lesson_title:l.lesson_title}))});
 }));
 router.get('/courses/:id/announcements',route(async(req,res)=>{
  check(process.env.PAI_ACADEMY_ANNOUNCEMENTS_ENABLED==='true',404,'Announcements are unavailable');
  const courseId=id(req.params.id);
  const [enrolled]=await db.execute("SELECT 1 FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.account_id=? AND e.status IN ('active','completed') AND c.status='published' LIMIT 1",[courseId,req.publicAccount.id]);
  check(enrolled.length===1,403,'Enrollment required');
  const [rows]=await db.execute('SELECT id,title,body,published_at FROM academy_announcements WHERE course_id=? ORDER BY published_at DESC,id DESC LIMIT 50',[courseId]);
  res.json({announcements:rows.map(a=>({...a,id:String(a.id)}))});
 }));
 router.get('/courses',route(async(req,res)=>{
  const [courses]=await db.execute("SELECT id,title,slug,description FROM academy_courses WHERE status='published' ORDER BY id DESC LIMIT 100");
  res.json({courses});
 }));
 router.get('/my-courses',route(async(req,res)=>{
  const [courses]=await db.execute("SELECT c.id,c.title,c.slug,e.status AS enrollment_status,e.enrolled_at,e.completed_at FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.account_id=? ORDER BY e.enrolled_at DESC LIMIT 100",[req.publicAccount.id]);
  res.json({courses});
 }));
 router.post('/courses/:id/enroll',(req,res,next)=>process.env.PAI_ACADEMY_ADMISSIONS_ENABLED==='true'?res.status(403).json({error:'Apply for admission to this course. Enrollment is granted only after approval.'}):next(),route(async(req,res)=>{
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
