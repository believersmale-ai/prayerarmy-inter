// Phase 2: staff-only draft course and lesson management.
// Disabled by default until migration 006 and staging QA are complete.
import {Router} from 'express';
import multer from 'multer';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {outlineFromText} from './academy-pdf-outline.js';
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
 router.get('/courses/:id/resources',route(async(req,res)=>{check(process.env.PAI_ACADEMY_RESOURCES_ENABLED==='true',404,'Resources unavailable');const courseId=numericId(req.params.id);const [resources]=await db.execute('SELECT id,title,kind,body,external_url,published,position FROM academy_resources WHERE course_id=? ORDER BY position,id',[courseId]);res.json({resources:resources.map(x=>({...x,id:String(x.id)}))})}));
 router.post('/courses/:id/resources',route(async(req,res)=>{check(process.env.PAI_ACADEMY_RESOURCES_ENABLED==='true',404,'Resources unavailable');const courseId=numericId(req.params.id),title=required(req.body?.title,200,'Resource title'),kind=String(req.body?.kind||'study_guide'),body=optional(req.body?.body,50000),url=String(req.body?.external_url||'').trim();check(['study_guide','scripture_reading','worksheet','reflection','reference_link'].includes(kind),400,'Invalid resource type');check(Boolean(body)||Boolean(url),400,'Provide learning text or a resource link');if(url){let parsed;try{parsed=new URL(url)}catch{}check(parsed?.protocol==='https:'&&!parsed.username&&!parsed.password&&url.length<=2048,400,'Only secure HTTPS resource links are accepted')}const [courses]=await db.execute('SELECT id FROM academy_courses WHERE id=?',[courseId]);check(courses.length===1,404,'Course not found');const [result]=await db.execute('INSERT INTO academy_resources(course_id,title,kind,body,external_url,published) VALUES (?,?,?,?,?,0)',[courseId,title,kind,body||null,url||null]);res.status(201).json({id:String(result.insertId),published:false})}));
 router.post('/resources/:id/publish',route(async(req,res)=>{check(process.env.PAI_ACADEMY_RESOURCES_ENABLED==='true',404,'Resources unavailable');const resourceId=numericId(req.params.id);const [result]=await db.execute('UPDATE academy_resources SET published=? WHERE id=?',[req.body?.published===true?1:0,resourceId]);check(result.affectedRows===1,404,'Resource not found');res.json({updated:true})}));
 router.get('/courses/:id/instructors',route(async(req,res)=>{
  const courseId=numericId(req.params.id);
  const [rows]=await db.execute("SELECT i.staff_id,u.email,i.assigned_at FROM academy_instructor_assignments i JOIN admin_users u ON CAST(u.id AS CHAR)=i.staff_id WHERE i.course_id=? ORDER BY i.assigned_at DESC",[courseId]);
  res.json({instructors:rows});
 }));
 router.post('/courses/:id/instructors',route(async(req,res)=>{
  check(req.staff?.via==='account'&&req.staff.user_id,403,'Use a personal administrator account');
  const courseId=numericId(req.params.id),staffId=numericId(req.body?.staff_id);
  const [staffRows]=await db.execute("SELECT id FROM admin_users WHERE id=? AND is_active=1",[staffId]);
  check(staffRows.length===1,404,'Active staff account not found');
  const [courses]=await db.execute('SELECT id FROM academy_courses WHERE id=?',[courseId]);
  check(courses.length===1,404,'Course not found');
  await db.execute('INSERT INTO academy_instructor_assignments(course_id,staff_id,assigned_at,assigned_by) VALUES (?,?,UTC_TIMESTAMP(),?) ON DUPLICATE KEY UPDATE id=id',[courseId,staffId,req.staff.user_id]);
  res.json({assigned:true,course_id:courseId,staff_id:staffId});
 }));
 router.delete('/courses/:id/instructors/:staffId',route(async(req,res)=>{
  check(req.staff?.via==='account'&&req.staff.user_id,403,'Use a personal administrator account');
  const courseId=numericId(req.params.id),staffId=numericId(req.params.staffId);
  const [result]=await db.execute('DELETE FROM academy_instructor_assignments WHERE course_id=? AND staff_id=?',[courseId,staffId]);
  res.json({removed:result.affectedRows>0});
 }));
 router.get('/overview',route(async(req,res)=>{
  const [courses]=await db.execute("SELECT status,COUNT(*) AS total FROM academy_courses GROUP BY status");
  const [enrollments]=await db.execute("SELECT status,COUNT(*) AS total FROM academy_enrollments GROUP BY status");
  const [assessments]=await db.execute("SELECT status,COUNT(*) AS total FROM academy_assessments GROUP BY status");
  const [attempts]=await db.execute("SELECT status,COUNT(*) AS total FROM academy_attempts GROUP BY status");
  const [recent]=await db.execute("SELECT c.id,c.title,c.status,COUNT(e.id) AS enrollments FROM academy_courses c LEFT JOIN academy_enrollments e ON e.course_id=c.id GROUP BY c.id,c.title,c.status ORDER BY c.id DESC LIMIT 8");
  const tally=rows=>Object.fromEntries(rows.map(r=>[r.status,Number(r.total)]));
  res.json({courses:tally(courses),enrollments:tally(enrollments),assessments:tally(assessments),attempts:tally(attempts),recent_courses:recent.map(c=>({id:String(c.id),title:c.title,status:c.status,enrollments:Number(c.enrollments)}))});
 }));
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


 // Extract text only. The PDF is held in memory and is never publicly served or saved.
 const pdfUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1}});
 router.post('/import/pdf/preview',pdfUpload.single('file'),route(async(req,res)=>{
  check(req.file?.buffer,400,'Choose a PDF file');
  check(req.file.buffer.subarray(0,5).toString('ascii')==='%PDF-',400,'Invalid PDF file');
  let document;
  try{
   document=await getDocument({data:new Uint8Array(req.file.buffer),useSystemFonts:true,disableFontFace:true,isEvalSupported:false}).promise;
   check(document.numPages<=100,413,'PDF exceeds 100 pages');
   const pages=[];
   for(let n=1;n<=document.numPages;n++){
    const page=await document.getPage(n);
    const content=await page.getTextContent();
    pages.push(content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':' ')).join('').slice(0,15000));
    page.cleanup();
   }
   const text=pages.join('\n\n').slice(0,150000);
   check(text.trim().length>0,422,'No selectable text found. Scanned PDFs need OCR before import.');
   res.json({pages:document.numPages,text,outline:outlineFromText(text),warning:'Review and edit extracted text before creating draft lessons, courses or questions. Nothing has been saved.'});
  }finally{if(document)await document.destroy()}
 }));


 // Review-first import into an existing draft course; atomic and never published.
 router.post('/courses/:id/import-outline',route(async(req,res)=>{
  const createNew=req.params.id==='new';
  const courseId=createNew?null:numericId(req.params.id);
  const course=createNew?draftCourse(req.body?.course):null;
  if(course)check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug),400,'Invalid course slug');
  const lessons=req.body?.lessons,questions=req.body?.questions||[];
  check(Array.isArray(lessons)&&Array.isArray(questions),400,'Invalid outline');
  check(lessons.length<=100&&questions.length<=200&&lessons.length+questions.length>0,400,'Import must contain 1–300 items');
  const assessmentId=questions.length?numericId(req.body?.assessment_id):null;
  const preparedLessons=lessons.map((item,i)=>({title:required(item?.title,200,'Lesson title'),content:optional(item?.content,50000),position:i}));
  const preparedQuestions=questions.map((item,i)=>{
   const type=String(item?.question_type||'essay');
   check(type==='essay',400,'Only essay question drafts are supported by this import; choice answer keys need manual review');
   const points=Number(item?.points??1);
   check(Number.isFinite(points)&&points>0&&points<=9999&&Number.isInteger(points*100),400,'Invalid points');
   return {text:required(item?.question_text,10000,'Question text'),type,points,position:i};
  });
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   let targetCourseId=courseId;
   if(createNew){
    const [created]=await conn.execute("INSERT INTO academy_courses(title,slug,description,status) VALUES (?,?,?,'draft')",[course.title,course.slug,course.description]);
    targetCourseId=String(created.insertId);
   }else{
    const [courses]=await conn.execute('SELECT status FROM academy_courses WHERE id=? FOR UPDATE',[courseId]);
    check(courses[0]?.status==='draft',409,'Import requires a draft course');
   }
   if(assessmentId){
    check(!createNew,400,'Create the new course before importing assessment questions');
    const [assessments]=await conn.execute('SELECT status FROM academy_assessments WHERE id=? AND course_id=? FOR UPDATE',[assessmentId,courseId]);
    check(assessments[0]?.status==='draft',409,'Choose a draft assessment belonging to this course');
   }
   for(const item of preparedLessons)await conn.execute('INSERT INTO academy_lessons(course_id,title,content,position,published) VALUES (?,?,?,?,0)',[targetCourseId,item.title,item.content,item.position]);
   for(const item of preparedQuestions)await conn.execute('INSERT INTO academy_questions(assessment_id,question_text,question_type,points,position) VALUES (?,?,?,?,?)',[assessmentId,item.text,item.type,item.points,item.position]);
   await conn.commit();
   res.status(201).json({success:true,course_id:targetCourseId,lessons:preparedLessons.length,questions:preparedQuestions.length,published:false});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));

 // Phase 2A: staff assessment authoring. All new assessments remain drafts.
 router.get('/courses/:id/assessments',route(async(req,res)=>{
  const courseId=numericId(req.params.id);
  const [rows]=await db.execute('SELECT id,course_id,title,kind,status,opens_at,closes_at,duration_minutes,max_attempts,result_policy,passing_percent FROM academy_assessments WHERE course_id=? ORDER BY id DESC LIMIT 200',[courseId]);
  res.json({assessments:rows});
 }));
 router.post('/courses/:id/assessments',route(async(req,res)=>{
  const courseId=numericId(req.params.id),title=required(req.body?.title,200,'Assessment title');
  const kind=String(req.body?.kind||'');
  check(['assignment','exam'].includes(kind),400,'Invalid assessment type');
  const duration=Number(req.body?.duration_minutes??(kind==='exam'?30:0));
  check(Number.isSafeInteger(duration)&&duration>=0&&duration<=1440,400,'Invalid duration');
  check(kind!=='exam'||duration>=1,400,'Exams require a duration');
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [courses]=await conn.execute('SELECT status FROM academy_courses WHERE id=? FOR UPDATE',[courseId]);
   check(courses[0]?.status==='draft',409,'Assessment authoring requires a draft course');
   const [result]=await conn.execute("INSERT INTO academy_assessments(course_id,title,kind,status,duration_minutes,result_policy) VALUES (?,?,?,'draft',?,'manual')",[courseId,title,kind,duration||null]);
   await conn.commit();
   res.status(201).json({id:String(result.insertId),status:'draft'});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 router.get('/assessments/:id/questions',route(async(req,res)=>{
  const assessmentId=numericId(req.params.id);
  const [questions]=await db.execute('SELECT id,assessment_id,question_text,question_type,points,position FROM academy_questions WHERE assessment_id=? ORDER BY position,id LIMIT 300',[assessmentId]);
  // Never send correct-answer keys through the student API. This is staff-only.
  res.json({questions});
 }));
 router.post('/assessments/:id/questions',route(async(req,res)=>{
  const assessmentId=numericId(req.params.id),questionText=required(req.body?.question_text,10000,'Question');
  const questionType=String(req.body?.question_type||'');
  check(['single_choice','multiple_choice','essay'].includes(questionType),400,'Invalid question type');
  const points=Number(req.body?.points??1),position=Number(req.body?.position??0);
  check(Number.isFinite(points)&&points>0&&points<=999999.99&&Math.round(points*100)===points*100,400,'Invalid points');
  check(Number.isSafeInteger(position)&&position>=0&&position<=100000,400,'Invalid question order');
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT a.status,c.status AS course_status FROM academy_assessments a JOIN academy_courses c ON c.id=a.course_id WHERE a.id=? FOR UPDATE",[assessmentId]);
   check(rows[0]?.status==='draft'&&rows[0]?.course_status==='draft',409,'Questions can only be added to draft assessments in draft courses');
   const [result]=await conn.execute('INSERT INTO academy_questions(assessment_id,question_text,question_type,points,position) VALUES (?,?,?,?,?)',[assessmentId,questionText,questionType,points,position]);
   await conn.commit();
   res.status(201).json({id:String(result.insertId)});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));

 // Staff-only answer key management. Draft assessments and draft courses only.
 router.get('/questions/:id/options',route(async(req,res)=>{
  const questionId=numericId(req.params.id);
  const [questions]=await db.execute("SELECT q.question_type,a.status AS assessment_status,c.status AS course_status FROM academy_questions q JOIN academy_assessments a ON a.id=q.assessment_id JOIN academy_courses c ON c.id=a.course_id WHERE q.id=?",[questionId]);
  check(questions.length===1,404,'Question not found');
  const [options]=await db.execute('SELECT id,option_text,is_correct,position FROM academy_options WHERE question_id=? ORDER BY position,id',[questionId]);
  res.json({question:questions[0],options:options.map(o=>({...o,is_correct:Boolean(o.is_correct)}))});
 }));
 router.put('/questions/:id/options',route(async(req,res)=>{
  const questionId=numericId(req.params.id),options=req.body?.options;
  check(Array.isArray(options)&&options.length>=2&&options.length<=12,400,'Provide 2 to 12 answer options');
  const prepared=options.map((o,i)=>({text:required(o?.text,10000,'Answer option'),correct:o?.is_correct===true?1:0,position:i}));
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT q.question_type,a.status AS assessment_status,c.status AS course_status FROM academy_questions q JOIN academy_assessments a ON a.id=q.assessment_id JOIN academy_courses c ON c.id=a.course_id WHERE q.id=? FOR UPDATE",[questionId]);
   check(rows.length===1,404,'Question not found');
   check(rows[0].assessment_status==='draft'&&rows[0].course_status==='draft',409,'Answer keys can only be edited in drafts');
   check(['single_choice','multiple_choice'].includes(rows[0].question_type),400,'Essay questions do not have answer options');
   const correct=prepared.filter(o=>o.correct).length;
   check(rows[0].question_type==='single_choice'?correct===1:correct>=1,400,'Select the required correct answer(s)');
   await conn.execute('DELETE FROM academy_options WHERE question_id=?',[questionId]);
   for(const option of prepared)await conn.execute('INSERT INTO academy_options(question_id,option_text,is_correct,position) VALUES (?,?,?,?)',[questionId,option.text,option.correct,option.position]);
   await conn.commit();res.json({success:true,count:prepared.length});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));


 router.post('/courses/:id/publish',route(async(req,res)=>{
  check(process.env.PAI_ACADEMY_PUBLISH_ENABLED==='true',503,'Course publishing is disabled');
  const courseId=numericId(req.params.id);
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [courses]=await conn.execute('SELECT status FROM academy_courses WHERE id=? FOR UPDATE',[courseId]);
   check(courses[0]?.status==='draft',409,'Only draft courses can be published');
   const [lessons]=await conn.execute('SELECT id FROM academy_lessons WHERE course_id=?',[courseId]);
   check(lessons.length>0,409,'Add at least one lesson before publishing');
   await conn.execute('UPDATE academy_lessons SET published=1 WHERE course_id=?',[courseId]);
   await conn.execute("UPDATE academy_courses SET status='published' WHERE id=?",[courseId]);
   await conn.commit();res.json({success:true,status:'published',lessons_published:lessons.length});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));

 // Activate only fully configured assessments, with explicit scheduling.
 router.post('/assessments/:id/activate',route(async(req,res)=>{
  check(process.env.PAI_ACADEMY_EXAMS_ENABLED==='true',503,'Assessment activation is disabled');
  const assessmentId=numericId(req.params.id);
  const duration=Number(req.body?.duration_minutes);
  const maxAttempts=Number(req.body?.max_attempts??1);
  const passing=Number(req.body?.passing_percent??50);
  const opens=String(req.body?.opens_at||''),closes=String(req.body?.closes_at||'');
  check(/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ$/.test(opens)&&/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ$/.test(closes),400,'Provide UTC ISO start and end times');
  const start=new Date(opens),end=new Date(closes);
  check(Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>start&&end>Date.now(),400,'Invalid assessment window');
  check(Number.isSafeInteger(duration)&&duration>=1&&duration<=1440,400,'Invalid exam duration');
  check(Number.isSafeInteger(maxAttempts)&&maxAttempts>=1&&maxAttempts<=10,400,'Invalid attempt limit');
  check(Number.isFinite(passing)&&passing>=0&&passing<=100,400,'Invalid passing percentage');
  const toSql=date=>date.toISOString().slice(0,19).replace('T',' ');
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [rows]=await conn.execute("SELECT a.kind,a.status,c.status AS course_status FROM academy_assessments a JOIN academy_courses c ON c.id=a.course_id WHERE a.id=? FOR UPDATE",[assessmentId]);
   check(rows[0]?.status==='draft'&&rows[0]?.course_status==='published',409,'Publish the course before activating its draft assessment');
   const [questions]=await conn.execute('SELECT id,question_type FROM academy_questions WHERE assessment_id=? FOR UPDATE',[assessmentId]);
   check(questions.length>0,409,'Add questions before activation');
   check(questions.every(q=>q.question_type!=='essay'),409,'Essay marking requires manual grading; activation currently supports choice questions only');
   for(const question of questions){
    const [options]=await conn.execute('SELECT is_correct FROM academy_options WHERE question_id=?',[question.id]);
    const correct=options.filter(o=>o.is_correct).length;
    check(options.length>=2&&(question.question_type==='single_choice'?correct===1:correct>=1),409,'Complete all answer keys before activation');
   }
   await conn.execute("UPDATE academy_assessments SET status='active',opens_at=?,closes_at=?,duration_minutes=?,max_attempts=?,passing_percent=?,result_policy='immediate' WHERE id=?",[toSql(start),toSql(end),duration,maxAttempts,passing,assessmentId]);
   await conn.commit();res.json({success:true,status:'active'});
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }));
 return router;
}
