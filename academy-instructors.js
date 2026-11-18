import {Router} from 'express';
import {check,route} from './node-common.js';
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
 router.get('/courses',route(async(req,res)=>{
  const [rows]=await db.execute("SELECT c.id,c.title,c.description,c.status,COUNT(DISTINCT e.id) AS enrollment_count,COUNT(DISTINCT a.id) AS assessment_count FROM academy_courses c JOIN academy_instructor_assignments i ON i.course_id=c.id LEFT JOIN academy_enrollments e ON e.course_id=c.id LEFT JOIN academy_assessments a ON a.course_id=c.id WHERE i.staff_id=? GROUP BY c.id,c.title,c.description,c.status ORDER BY c.id DESC",[req.staff.user_id]);
  res.json({courses:rows.map(r=>({...r,id:String(r.id),enrollment_count:Number(r.enrollment_count),assessment_count:Number(r.assessment_count)}))});
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
