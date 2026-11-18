import {Router} from 'express';
import {randomBytes,createHash,scrypt as scryptCb} from 'node:crypto';
import {promisify} from 'node:util';
import nodemailer from 'nodemailer';
import {sameOrigin} from './node-auth.js';
const scrypt=promisify(scryptCb),hash=t=>createHash('sha256').update(t).digest('hex');
const id=v=>/^[1-9][0-9]{0,18}$/.test(String(v||''))?String(v):null;
const enabled=()=>process.env.PAI_ACADEMY_ADMISSIONS_ENABLED==='true';
const base=()=>{const u=new URL(process.env.PAI_PUBLIC_BASE_URL||'');if(u.protocol!=='https:')throw Error('HTTPS base URL required');return u};
const mail=async(to,subject,body)=>{if(!process.env.PAI_SMTP_HOST||!process.env.PAI_SMTP_USER||!process.env.PAI_SMTP_PASS||!process.env.PAI_MAIL_FROM)throw Error('Admissions email is not configured');const port=Number(process.env.PAI_SMTP_PORT||587);const transport=nodemailer.createTransport({host:process.env.PAI_SMTP_HOST,port,secure:port===465,requireTLS:port!==465,connectionTimeout:5000,socketTimeout:10000,auth:{user:process.env.PAI_SMTP_USER,pass:process.env.PAI_SMTP_PASS}});await transport.sendMail({from:process.env.PAI_MAIL_FROM,to,subject,text:body})};
export function createAcademyAdmissionsRouter({db,staff}){
 const publicRouter=Router(),adminRouter=Router();
 for(const router of [publicRouter,adminRouter])router.use((req,res,next)=>{res.set('Cache-Control','no-store');return enabled()?next():res.status(404).json({error:'Admissions unavailable'})});
 publicRouter.use((req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():sameOrigin(req,res,next));
 const buckets=new Map();
 publicRouter.post('/apply',async(req,res)=>{
  const now=Date.now(),key=String(req.ip||'unknown'),hits=(buckets.get(key)||[]).filter(t=>now-t<3600000);hits.push(now);buckets.set(key,hits);if(buckets.size>10000)buckets.clear();if(hits.length>6)return res.status(429).json({error:'Too many applications. Try again later.'});
  const course=id(req.body?.course_id),name=String(req.body?.full_name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),phone=String(req.body?.phone||'').trim(),motivation=String(req.body?.motivation||'').trim();
  if(!course||name.length<2||name.length>150||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length>35||motivation.length<20||motivation.length>3000)return res.status(400).json({error:'Please provide valid application details and at least 20 characters about your interest.'});
  try{const [courses]=await db.execute("SELECT id FROM academy_courses WHERE id=? AND status='published'",[course]);if(!courses.length)return res.status(404).json({error:'Course unavailable'});
   await db.execute("INSERT INTO academy_applications(course_id,full_name,email,phone,motivation) VALUES (?,?,?,?,?)",[course,name,email,phone||null,motivation]);
   res.status(202).json({message:'Your application has been received. The Academy will contact you by email after review.'});
  }catch(err){if(err.code==='ER_DUP_ENTRY')return res.status(202).json({message:'If an application exists for this course, it is already on record.'});console.error('Academy application:',err.code||err.message);res.status(503).json({error:'Application service temporarily unavailable'})}
 });
 publicRouter.post('/activate',async(req,res)=>{
  const token=String(req.body?.token||''),password=req.body?.password;
  if(!/^[0-9a-f]{64}$/.test(token)||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'Invalid invitation or password (minimum 12 characters)'});
  const connection=await db.getConnection();
  try{await connection.beginTransaction();const [invites]=await connection.execute("SELECT i.id,i.application_id,a.course_id,a.email,a.full_name,a.status FROM academy_admission_invites i JOIN academy_applications a ON a.id=i.application_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>UTC_TIMESTAMP() FOR UPDATE",[hash(token)]);
   if(!invites.length||invites[0].status!=='admitted'){await connection.rollback();return res.status(400).json({error:'Invitation invalid or expired'})}
   const a=invites[0];const [existing]=await connection.execute('SELECT id FROM public_accounts WHERE email=? FOR UPDATE',[a.email]);let accountId;
   if(existing.length){await connection.rollback();return res.status(409).json({error:'This email already has an account. Please sign in or contact Academy administration.'})}
   const salt=randomBytes(16).toString('hex'),encoded='scrypt:'+salt+':'+(await scrypt(password,salt,64)).toString('hex');
   const [created]=await connection.execute("INSERT INTO public_accounts(email,password_hash,display_name,status,email_verified_at) VALUES (?,?,?,'active',UTC_TIMESTAMP())",[a.email,encoded,a.full_name]);accountId=created.insertId;
   await connection.execute("INSERT INTO public_account_roles(account_id,role) VALUES (?,'student')",[accountId]);
   await connection.execute("INSERT INTO academy_enrollments(course_id,account_id,status) VALUES (?,?,'active')",[a.course_id,accountId]);
   await connection.execute("UPDATE academy_applications SET account_id=? WHERE id=?",[accountId,a.application_id]);
   await connection.execute("UPDATE academy_admission_invites SET used_at=UTC_TIMESTAMP() WHERE id=?",[a.id]);
   await connection.commit();res.json({message:'Account activated. You can now sign in.',login:'/academy/login/student'});
  }catch(err){await connection.rollback();console.error('Academy activation:',err.code||err.message);res.status(503).json({error:'Account activation temporarily unavailable'})}finally{connection.release()}
 });
 adminRouter.use(staff.authorize);
 adminRouter.use((req,res,next)=>req.staff?.permissions?.includes('security')&&req.staff?.via==='account'&&req.staff?.user_id?next():res.status(403).json({error:'Personal administrator account required'}));
 adminRouter.use((req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():sameOrigin(req,res,next));
 adminRouter.get('/applications',async(req,res)=>{try{const [rows]=await db.execute("SELECT a.id,a.full_name,a.email,a.phone,a.motivation,a.status,a.created_at,c.title AS course_title FROM academy_applications a JOIN academy_courses c ON c.id=a.course_id ORDER BY a.created_at DESC LIMIT 150");res.json({applications:rows.map(x=>({...x,id:String(x.id)}))})}catch(err){console.error('Admissions list:',err.code||err.message);res.status(503).json({error:'Applications unavailable'})}});
 adminRouter.post('/applications/:id/decision',async(req,res)=>{
  const applicationId=id(req.params.id),decision=String(req.body?.decision||'');if(!applicationId||!['admit','reject'].includes(decision))return res.status(400).json({error:'Invalid decision'});
  try{
   const [rows]=await db.execute("SELECT a.id,a.email,a.full_name,a.status,a.course_id,c.title AS course_title FROM academy_applications a JOIN academy_courses c ON c.id=a.course_id WHERE a.id=?",[applicationId]);
   if(!rows.length)return res.status(404).json({error:'Application not found'});const a=rows[0];if(a.status!=='pending')return res.status(409).json({error:'Application already reviewed'});
   if(decision==='reject'){const [changed]=await db.execute("UPDATE academy_applications SET status='rejected',reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status='pending'",[String(req.staff.user_id),applicationId]);if(!changed.affectedRows)return res.status(409).json({error:'Already reviewed'});return res.json({status:'rejected'})}
   const [accounts]=await db.execute('SELECT id FROM public_accounts WHERE email=? LIMIT 1',[a.email]);if(accounts.length)return res.status(409).json({error:'Applicant already has an account. Account linking requires administrator review; no duplicate login will be created.'});
   base();const token=randomBytes(32).toString('hex'),link=new URL('/academy/activate',base());link.searchParams.set('token',token);
   const connection=await db.getConnection();try{await connection.beginTransaction();const [changed]=await connection.execute("UPDATE academy_applications SET status='admitted',reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status='pending'",[String(req.staff.user_id),applicationId]);if(!changed.affectedRows){await connection.rollback();return res.status(409).json({error:'Already reviewed'})}
    await connection.execute("INSERT INTO academy_admission_invites(application_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 72 HOUR))",[applicationId,hash(token)]);
    await mail(a.email,'Prayer Army Academy — Admission offer',`Congratulations ${a.full_name}. You have been admitted to ${a.course_title}.\n\nSet your own secure password and activate your student account within 72 hours:\n${link.href}\n\nNever share this link. Your login email is ${a.email}.\nIf you did not apply, contact the Academy administrator.`);
    await connection.commit();res.json({status:'admitted',message:'Admission email sent. Applicant must create their own password.'});
   }catch(err){await connection.rollback();throw err}finally{connection.release()}
  }catch(err){console.error('Admissions decision:',err.code||err.message);res.status(503).json({error:'Could not complete admission and email delivery'})}
 });
 return {publicRouter,adminRouter};
}
