// Shared public identity API. Deliberately separate from staff admin sessions.
// Routes stay disabled until staging migration, email verification and QA are ready.
import { Router } from 'express';
import { randomBytes, createHash, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCb);
const digest = token => createHash('sha256').update(token).digest();
const normalize = value => String(value ?? '').trim();
const publicView = row => ({ id: String(row.id), displayName: row.display_name, email: row.email, roles: row.roles || [] });
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
  // Do not accept registrations before email verification delivery is implemented.
  // A pending account without a delivered verification link cannot be activated.
  router.post('/register',throttle,(req,res)=>{
    res.status(503).json({error:'Registration is not open yet'});
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
