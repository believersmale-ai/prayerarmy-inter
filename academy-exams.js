import {Router} from 'express';
import {check,route} from './node-common.js';
const id=v=>{const s=String(v??'');check(/^[1-9][0-9]{0,18}$/.test(s),400,'Invalid ID');return s};
const enabled=(req,res,next)=>process.env.PAI_ACADEMY_EXAMS_ENABLED==='true'?next():res.status(404).json({error:'Assessments are unavailable'});
export function createAcademyExamRouter(db){
 const router=Router();router.use(enabled);
 const enrolled=async(conn,courseId,accountId)=>{
  const [rows]=await conn.execute("SELECT 1 FROM academy_enrollments e JOIN academy_courses c ON c.id=e.course_id WHERE e.course_id=? AND e.account_id=? AND e.status IN ('active','completed') AND c.status='published' LIMIT 1",[courseId,accountId]);
  check(rows.length===1,403,'Enrollment required');
 };
 router.get('/courses/:id/assessments',route(async(req,res)=>{
  const courseId=id(req.params.id);await enrolled(db,courseId,req.publicAccount.id);
  const [rows]=await db.execute("SELECT id,title,kind,opens_at,closes_at,duration_minutes,max_attempts,passing_percent FROM academy_assessments WHERE course_id=? AND status='active' AND opens_at<=UTC_TIMESTAMP() AND closes_at>UTC_TIMESTAMP() ORDER BY id",[courseId]);
  res.json({assessments:rows});
 }));
 router.post('/assessments/:id/start',route(async(req,res)=>{
  const assessmentId=id(req.params.id),accountId=req.publicAccount.id,conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [a]=await conn.execute("SELECT id,course_id,max_attempts,duration_minutes,kind FROM academy_assessments WHERE id=? AND status='active' AND opens_at<=UTC_TIMESTAMP() AND closes_at>UTC_TIMESTAMP() FOR UPDATE",[assessmentId]);
   check(a.length===1,404,'Assessment is not open');await enrolled(conn,a[0].course_id,accountId);
   const [prior]=await conn.execute("SELECT id,attempt_number,status,deadline_at FROM academy_attempts WHERE assessment_id=? AND account_id=? ORDER BY attempt_number DESC FOR UPDATE",[assessmentId,accountId]);
   const current=prior.find(x=>x.status==='in_progress'&&new Date(x.deadline_at).getTime()>Date.now());
   if(current){await conn.commit();return res.json({attempt_id:String(current.id),resumed:true})}
   check(prior.length<Number(a[0].max_attempts),409,'Attempt limit reached');
   const number=prior.length+1;
   const [result]=await conn.execute("INSERT INTO academy_attempts(assessment_id,account_id,attempt_number,started_at,deadline_at,status) VALUES (?,?,?,UTC_TIMESTAMP(),LEAST(DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),(SELECT closes_at FROM academy_assessments WHERE id=?)),'in_progress')",[assessmentId,accountId,number,a[0].duration_minutes,assessmentId]);
   await conn.commit();res.status(201).json({attempt_id:String(result.insertId),resumed:false});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 router.get('/attempts/:id',route(async(req,res)=>{
  const attemptId=id(req.params.id);
  const [rows]=await db.execute("SELECT t.id,t.status,t.deadline_at,t.submitted_at,a.title,a.id AS assessment_id FROM academy_attempts t JOIN academy_assessments a ON a.id=t.assessment_id WHERE t.id=? AND t.account_id=?",[attemptId,req.publicAccount.id]);
  check(rows.length===1,404,'Attempt not found');
  const attempt=rows[0];
  check(attempt.status==='in_progress',409,'Attempt already submitted');
  check(new Date(attempt.deadline_at).getTime()>Date.now(),409,'Time expired');
  const [questions]=await db.execute("SELECT id,question_text,question_type,points,position FROM academy_questions WHERE assessment_id=? ORDER BY position,id",[attempt.assessment_id]);
  for(const q of questions){const [opts]=await db.execute('SELECT id,option_text,position FROM academy_options WHERE question_id=? ORDER BY position,id',[q.id]);q.options=opts.map(o=>({id:String(o.id),text:o.option_text})) ;q.id=String(q.id)}
  res.json({attempt:{id:String(attempt.id),title:attempt.title,deadline_at:attempt.deadline_at},questions,server_time:new Date().toISOString()});
 }));
 router.post('/attempts/:id/submit',route(async(req,res)=>{
  const attemptId=id(req.params.id),answers=req.body?.answers;
  check(answers&&typeof answers==='object'&&!Array.isArray(answers)&&Object.keys(answers).length<=300,400,'Invalid answers');
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT t.*,a.result_policy,a.passing_percent FROM academy_attempts t JOIN academy_assessments a ON a.id=t.assessment_id WHERE t.id=? AND t.account_id=? FOR UPDATE",[attemptId,req.publicAccount.id]);
   check(rows.length===1,404,'Attempt not found');
   const attempt=rows[0];check(attempt.status==='in_progress',409,'Attempt already submitted');
   check(new Date(attempt.deadline_at).getTime()>=Date.now(),409,'Assessment time has expired');
   const [questions]=await conn.execute('SELECT id,question_type,points FROM academy_questions WHERE assessment_id=?',[attempt.assessment_id]);
   check(questions.length>0,409,'Assessment has no questions');
   let earned=0,possible=0;
   for(const q of questions){
    check(q.question_type!=='essay',409,'Essay grading is not available');
    const [options]=await conn.execute('SELECT id,is_correct FROM academy_options WHERE question_id=?',[q.id]);
    const allowed=new Set(options.map(o=>String(o.id)));
    const correct=options.filter(o=>o.is_correct).map(o=>String(o.id)).sort();
    const raw=answers[String(q.id)]??[];
    check(Array.isArray(raw)&&raw.length<=options.length&&raw.every(v=>typeof v==='string'&&allowed.has(v))&&new Set(raw).size===raw.length,400,'Invalid answer selection');
    check(q.question_type!=='single_choice'||raw.length<=1,400,'Select only one answer');
    const award=raw.slice().sort().join(',')===correct.join(',')?Number(q.points):0;
    earned+=award;possible+=Number(q.points);
    await conn.execute('INSERT INTO academy_answers(attempt_id,question_id,answer_json,points_awarded,graded_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',[attemptId,q.id,JSON.stringify(raw),award]);
   }
   await conn.execute("UPDATE academy_attempts SET status='graded',submitted_at=UTC_TIMESTAMP(),earned_points=?,possible_points=?,graded_at=UTC_TIMESTAMP() WHERE id=?",[earned,possible,attemptId]);
   await conn.commit();
   const percent=possible?Math.round(earned/possible*10000)/100:0;
   res.json({submitted:true,earned_points:earned,possible_points:possible,percentage:percent,passed:percent>=Number(attempt.passing_percent)});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 return router;
}
