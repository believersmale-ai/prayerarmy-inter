import {randomBytes} from 'node:crypto';
import {Router} from 'express';
import {check,route} from './node-common.js';
const id=v=>{const s=String(v??'');check(/^[1-9][0-9]{0,18}$/.test(s),400,'Invalid identifier');return s};
export function createAcademyCertificateRouter(db){
 const router=Router();
 router.use((req,res,next)=>process.env.PAI_ACADEMY_CERTIFICATES_ENABLED==='true'?next():res.status(404).json({error:'Certificates unavailable'}));
 router.post('/courses/:id/complete',route(async(req,res)=>{
  const courseId=id(req.params.id),accountId=req.publicAccount.id;
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT e.id,e.status FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.account_id=? AND e.status IN ('active','completed') AND c.status='published' FOR UPDATE",[courseId,accountId]);
   check(rows.length===1,403,'Active enrollment required');
   const enrollmentId=rows[0].id;
   const [lessons]=await conn.execute('SELECT COUNT(*) AS total FROM academy_lessons WHERE course_id=? AND published=1',[courseId]);
   const total=Number(lessons[0].total);
   check(total>0,409,'Course has no published lessons');
   const [done]=await conn.execute("SELECT COUNT(*) AS total FROM academy_lesson_progress p JOIN academy_lessons l ON l.id=p.lesson_id WHERE p.enrollment_id=? AND l.course_id=? AND l.published=1",[enrollmentId,courseId]);
   check(Number(done[0].total)===total,409,'Complete all lessons first');
   const [assessments]=await conn.execute("SELECT a.id,a.passing_percent FROM academy_assessments a WHERE a.course_id=? AND a.status IN ('active','closed')",[courseId]);
   for(const assessment of assessments){
    const [passed]=await conn.execute("SELECT 1 FROM academy_attempts WHERE assessment_id=? AND account_id=? AND status='graded' AND possible_points>0 AND earned_points*100>=possible_points*? LIMIT 1",[assessment.id,accountId,assessment.passing_percent]);
    check(passed.length===1,409,'Pass every required assessment first');
   }
   if(rows[0].status==='active')await conn.execute("UPDATE academy_enrollments SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?",[enrollmentId]);
   const token=randomBytes(32).toString('hex');
   await conn.execute("INSERT INTO academy_certificates(enrollment_id,verification_token,issued_at) VALUES (?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE id=id",[enrollmentId,token]);
   const [certificates]=await conn.execute("SELECT verification_token,issued_at,revoked_at FROM academy_certificates WHERE enrollment_id=?",[enrollmentId]);
   await conn.commit();
   res.json({completed:true,certificate:certificates[0].revoked_at?null:{verification_token:certificates[0].verification_token,issued_at:certificates[0].issued_at}});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 router.get('/my-certificates',route(async(req,res)=>{
  const [rows]=await db.execute("SELECT c.title,c.slug,cert.verification_token,cert.issued_at FROM academy_certificates cert JOIN academy_enrollments e ON e.id=cert.enrollment_id JOIN academy_courses c ON c.id=e.course_id WHERE e.account_id=? AND e.status='completed' AND cert.revoked_at IS NULL ORDER BY cert.issued_at DESC",[req.publicAccount.id]);
  res.json({certificates:rows});
 }));
 return router;
}
