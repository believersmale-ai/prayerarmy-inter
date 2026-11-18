import {Router} from 'express';
import {check,route} from './node-common.js';
import {sameOrigin} from './node-auth.js';
const id=v=>{const s=String(v??'');check(/^[1-9][0-9]{0,18}$/.test(s),400,'Invalid identifier');return s};
export function createAcademyInstructorRouter({db,staff}){
 const router=Router();
 router.use(staff.authorize);
 router.use(route(async(req,res,next)=>{
  check(process.env.PAI_ACADEMY_INSTRUCTORS_ENABLED==='true',404,'Instructor workspace unavailable');
  check(req.staff?.via==='account'&&req.staff.user_id,403,'A personal staff account is required');
  const [assignments]=await db.execute('SELECT course_id FROM academy_instructor_assignments WHERE staff_id=? LIMIT 100',[req.staff.user_id]);
  check(assignments.length>0,403,'No Academy instructor assignments');
  req.academyCourseIds=new Set(assignments.map(a=>String(a.course_id)));
  res.set('Cache-Control','no-store');next();
 }));
 router.get('/courses/:id/announcements',route(async(req,res)=>{
  const courseId=id(req.params.id);check(req.academyCourseIds.has(courseId),403,'Course is not assigned to you');
  const [rows]=await db.execute('SELECT id,title,body,published_at FROM academy_announcements WHERE course_id=? ORDER BY published_at DESC,id DESC LIMIT 50',[courseId]);
  res.json({announcements:rows.map(x=>({...x,id:String(x.id)}))});
 }));
 router.post('/courses/:id/announcements',sameOrigin,route(async(req,res)=>{
  check(process.env.PAI_ACADEMY_ANNOUNCEMENTS_ENABLED==='true',404,'Announcements are unavailable');
  const courseId=id(req.params.id);check(req.academyCourseIds.has(courseId),403,'Course is not assigned to you');
  const title=typeof req.body?.title==='string'?req.body.title.trim():'';
  const body=typeof req.body?.body==='string'?req.body.body.trim():'';
  check(title.length>=3&&title.length<=180,400,'Title must be 3–180 characters');
  check(body.length>=3&&body.length<=5000,400,'Message must be 3–5000 characters');
  const [courses]=await db.execute("SELECT id FROM academy_courses WHERE id=? AND status='published'",[courseId]);
  check(courses.length===1,409,'Course must be published');
  const [result]=await db.execute('INSERT INTO academy_announcements(course_id,author_staff_id,title,body,published_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',[courseId,req.staff.user_id,title,body]);
  res.status(201).json({id:String(result.insertId),published:true});
 }));
 router.get('/courses',route(async(req,res)=>{
  const [rows]=await db.execute("SELECT c.id,c.title,c.description,c.status,COUNT(DISTINCT e.id) AS enrollment_count,COUNT(DISTINCT a.id) AS assessment_count FROM academy_courses c JOIN academy_instructor_assignments i ON i.course_id=c.id LEFT JOIN academy_enrollments e ON e.course_id=c.id LEFT JOIN academy_assessments a ON a.course_id=c.id WHERE i.staff_id=? GROUP BY c.id,c.title,c.description,c.status ORDER BY c.id DESC",[req.staff.user_id]);
  res.json({courses:rows.map(r=>({...r,id:String(r.id),enrollment_count:Number(r.enrollment_count),assessment_count:Number(r.assessment_count)}))});
 }));
 router.get('/courses/:id/analytics',route(async(req,res)=>{
  const courseId=id(req.params.id);
  check(req.academyCourseIds.has(courseId),403,'Course is not assigned to you');
  const [lessonCount]=await db.execute('SELECT COUNT(*) AS total FROM academy_lessons WHERE course_id=? AND published=1',[courseId]);
  const [learners]=await db.execute("SELECT e.id,e.status,e.enrolled_at,e.completed_at,a.display_name,COUNT(DISTINCT p.lesson_id) AS lessons_completed FROM academy_enrollments e JOIN public_accounts a ON a.id=e.account_id LEFT JOIN academy_lesson_progress p ON p.enrollment_id=e.id WHERE e.course_id=? GROUP BY e.id,e.status,e.enrolled_at,e.completed_at,a.display_name ORDER BY e.enrolled_at DESC LIMIT 200",[courseId]);
  const [outcomes]=await db.execute("SELECT x.id,x.title,COUNT(DISTINCT t.id) AS attempts,COUNT(DISTINCT CASE WHEN t.status='graded' AND t.possible_points>0 AND t.earned_points*100>=t.possible_points*x.passing_percent THEN t.account_id END) AS learners_passed FROM academy_assessments x LEFT JOIN academy_attempts t ON t.assessment_id=x.id WHERE x.course_id=? AND x.status IN ('active','closed') GROUP BY x.id,x.title ORDER BY x.id DESC LIMIT 100",[courseId]);
  res.json({course_id:courseId,total_lessons:Number(lessonCount[0].total),learners:learners.map(l=>({name:l.display_name,status:l.status,enrolled_at:l.enrolled_at,completed_at:l.completed_at,lessons_completed:Number(l.lessons_completed)})),assessments:outcomes.map(a=>({title:a.title,attempts:Number(a.attempts),learners_passed:Number(a.learners_passed)}))});
 }));
 router.get('/courses/:id/summary',route(async(req,res)=>{
  const courseId=id(req.params.id);
  check(req.academyCourseIds.has(courseId),403,'Course is not assigned to you');
  const [enrollments]=await db.execute('SELECT status,COUNT(*) AS total FROM academy_enrollments WHERE course_id=? GROUP BY status',[courseId]);
  const [assessments]=await db.execute('SELECT id,title,kind,status,opens_at,closes_at FROM academy_assessments WHERE course_id=? ORDER BY id DESC LIMIT 100',[courseId]);
  res.json({course_id:courseId,enrollments:Object.fromEntries(enrollments.map(r=>[r.status,Number(r.total)])),assessments:assessments.map(a=>({...a,id:String(a.id)}))});
 }));
 return router;
}
