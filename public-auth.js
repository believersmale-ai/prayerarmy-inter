// Shared public identity API. Deliberately separate from staff admin sessions.
// Routes stay disabled until staging migration, email verification and QA are ready.
import { Router } from 'express';
import { randomBytes, createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
const scrypt = promisify(scryptCb);
const digest = token => createHash('sha256').update(token).digest();
const normalize = value => String(value ?? '').trim();
const publicView = row => ({ id: String(row.id), displayName: row.display_name, email: row.email, roles: row.roles || [] });
const passwordHash = async password => {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password,salt,64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
};
const mailReady = () => Boolean(process.env.PAI_SMTP_HOST && process.env.PAI_SMTP_USER && process.env.PAI_SMTP_PASS && process.env.PAI_MAIL_FROM && process.env.PAI_PUBLIC_BASE_URL);
async function sendVerification(email,token) {
  const base = new URL(process.env.PAI_PUBLIC_BASE_URL);
  if (base.protocol !== 'https:') throw Error('Public base URL must use HTTPS');
  const link = new URL('/api/public/verify-email',base);
  link.searchParams.set('token',token);
  const transport = nodemailer.createTransport({
    host:process.env.PAI_SMTP_HOST,
    port:Number(process.env.PAI_SMTP_PORT || 587),
    secure:Number(process.env.PAI_SMTP_PORT || 587)===465,
    auth:{user:process.env.PAI_SMTP_USER,pass:process.env.PAI_SMTP_PASS}
  });
  await transport.sendMail({from:process.env.PAI_MAIL_FROM,to:email,subject:'Verify your Prayer Army International account',
    text:`Please verify your email address using this link (expires in 24 hours):\n${link.href}\nIf you did not register, ignore this email.`});
}
const checkPassword = async (password, encoded) => {
  const parts = String(encoded || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const actual = await scrypt(password, parts[1], 64);
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
};
const cookie = (token, secure, maxAge) => `pai_public_session=${token}; Path=/api/public; HttpOnly; SameSite=Strict; ${secure ? 'Secure; ' : ''}Max-Age=${maxAge}`;
const tokenFrom = req => {
  const pair = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('pai_public_session='));
  return pair ? pair.slice('pai_public_session='.length) : '';
};
export function createPublicAccountRouter(db) {
  const router = Router();
  // Prevent a partial feature from being exposed on a public staging deployment.
  router.use((req,res,next) => process.env.PAI_PUBLIC_ACCOUNTS_ENABLED === 'true' ? next() : res.status(404).json({error:'Not found'}));
  router.use((req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const host = req.get('host');
      // Origin required for cookie-based state changes, even before login.
      if (!origin || !host) return res.status(403).json({error:'Origin required'});
      try {
        const url = new URL(origin);
        if (url.host !== host || !['https:', 'http:'].includes(url.protocol)) return res.status(403).json({error:'Origin mismatch'});
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return res.status(403).json({error:'HTTPS required'});
      } catch { return res.status(403).json({error:'Invalid origin'}); }
    }
    res.setHeader('Cache-Control','no-store');
    next();
  });
  const buckets = new Map();
  const throttle = (req,res,next) => {
    const key = req.ip || 'unknown', now = Date.now();
    const hits = (buckets.get(key) || []).filter(t=>now-t<15*60*1000);
    hits.push(now); buckets.set(key,hits);
    if (buckets.size>20000) buckets.clear();
    if (hits.length>20) return res.status(429).json({error:'Too many requests; try later'});
    next();
  };
  router.post('/register',throttle,async(req,res)=>{
    if (!mailReady() || process.env.PAI_PUBLIC_REGISTRATION_ENABLED !== 'true')
      return res.status(503).json({error:'Registration is not open yet'});
    const email=normalize(req.body?.email).toLowerCase(),name=normalize(req.body?.displayName),password=req.body?.password;
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length>254 || name.length<2 || name.length>150 ||
      typeof password!=='string' || password.length<12 || password.length>128)
      return res.status(400).json({error:'Invalid registration details'});
    const message={message:'If the address is eligible, a verification email will be sent'};
    try {
      const [found]=await db.execute('SELECT id FROM public_accounts WHERE email=? LIMIT 1',[email]);
      if(found.length) return res.status(202).json(message);
      const hash=await passwordHash(password),token=randomBytes(32).toString('hex');
      const connection=await db.getConnection();
      try {
        await connection.beginTransaction();
        const [created]=await connection.execute('INSERT INTO public_accounts (email,password_hash,display_name,status) VALUES (?,?,?,?)',[email,hash,name,'pending']);
        await connection.execute("INSERT INTO public_auth_tokens (account_id,token_hash,purpose,expires_at) VALUES (?,?,'verify_email',DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))",[created.insertId,digest(token)]);
        await sendVerification(email,token);
        await connection.commit();
      } catch(err){await connection.rollback();throw err;} finally{connection.release();}
      return res.status(202).json(message);
    } catch(err) {
      if(err.code==='ER_DUP_ENTRY')return res.status(202).json(message);
      console.error('Public registration failed:',err.code||err.message);
      return res.status(503).json({error:'Registration temporarily unavailable'});
    }
  });
  router.get('/verify-email',throttle,async(req,res)=>{
    const token=String(req.query.token||'');
    if(!/^[0-9a-f]{64}$/.test(token))return res.status(400).type('text/plain').send('Invalid verification link');
    const connection=await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]=await connection.execute("SELECT account_id FROM public_auth_tokens WHERE token_hash=? AND purpose='verify_email' AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE",[digest(token)]);
      if(!rows.length){await connection.rollback();return res.status(400).type('text/plain').send('Verification link is invalid or expired');}
      await connection.execute("UPDATE public_accounts SET status='active',email_verified_at=UTC_TIMESTAMP() WHERE id=? AND status='pending'",[rows[0].account_id]);
      await connection.execute("UPDATE public_auth_tokens SET consumed_at=UTC_TIMESTAMP() WHERE token_hash=?",[digest(token)]);
      await connection.commit();
      res.type('text/plain').send('Email verified. You can now sign in.');
    } catch(err){await connection.rollback();console.error('Email verification failed:',err.code||err.message);res.status(503).type('text/plain').send('Verification temporarily unavailable');}
    finally{connection.release();}
  });
  router.post('/login',throttle,async(req,res)=>{
    const email=normalize(req.body?.email).toLowerCase(),password=req.body?.password;
    if (!email || email.length>254 || typeof password!=='string' || password.length>128) return res.status(400).json({error:'Invalid credentials'});
    try {
      const [rows]=await db.execute('SELECT id,email,display_name,password_hash,status,email_verified_at FROM public_accounts WHERE email=? LIMIT 1',[email]);
      const account=rows[0];
      // Always execute a password KDF, including unknown accounts.
      const fallback='scrypt:00000000000000000000000000000000:'+ '0'.repeat(128);
      const valid=await checkPassword(password,account?.password_hash||fallback);
      if (!account || !valid || account.status!=='active' || !account.email_verified_at) return res.status(401).json({error:'Invalid credentials'});
      const token=randomBytes(32).toString('hex'),hash=digest(token);
      await db.execute('INSERT INTO public_auth_tokens (account_id,token_hash,purpose,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))',[account.id,hash,'session']);
      await db.execute('UPDATE public_accounts SET last_login_at=UTC_TIMESTAMP() WHERE id=?',[account.id]);
      res.setHeader('Set-Cookie',cookie(token,req.secure,604800));
      res.json({account:publicView(account)});
    } catch(err){console.error('Public login error:',err.code||err.message);res.status(503).json({error:'Login temporarily unavailable'});}
  });
  const current=async(req)=>{
    const token=tokenFrom(req);
    if(!/^[0-9a-f]{64}$/.test(token))return null;
    const [rows]=await db.execute(`SELECT a.id,a.email,a.display_name FROM public_auth_tokens t
      JOIN public_accounts a ON a.id=t.account_id
      WHERE t.token_hash=? AND t.purpose='session' AND t.consumed_at IS NULL
      AND t.expires_at>UTC_TIMESTAMP() AND a.status='active' AND a.email_verified_at IS NOT NULL LIMIT 1`,[digest(token)]);
    if(!rows.length)return null;
    const [roles]=await db.execute('SELECT role FROM public_account_roles WHERE account_id=?',[rows[0].id]);
    return {...rows[0],roles:roles.map(x=>x.role)};
  };
  router.get('/me',async(req,res)=>{
    try {const account=await current(req);if(!account)return res.status(401).json({error:'Sign in required'});res.json({account:publicView(account)});}
    catch(err){console.error('Public session error:',err.code||err.message);res.status(503).json({error:'Session temporarily unavailable'});}
  });
  router.post('/logout',async(req,res)=>{
    try {
      const token=tokenFrom(req);
      if(/^[0-9a-f]{64}$/.test(token))await db.execute("UPDATE public_auth_tokens SET consumed_at=UTC_TIMESTAMP() WHERE token_hash=? AND purpose='session'",[digest(token)]);
      res.setHeader('Set-Cookie',cookie('',req.secure,0));
      res.json({success:true});
    } catch(err){console.error('Public logout error:',err.code||err.message);res.status(503).json({error:'Logout temporarily unavailable'});}
  });
  return router;
}
