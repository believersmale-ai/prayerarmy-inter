import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
// Explicit integration check: creates and removes its own isolated database.
// PAI_TEST_DB_HOST/PORT/USER/PASSWORD configure a disposable local test server.
const root = fileURLToPath(new URL('../', import.meta.url));
const database = `pai_regression_${Date.now()}_${process.pid}`;
const config = { host: process.env.PAI_TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.PAI_TEST_DB_PORT || 3306), user: process.env.PAI_TEST_DB_USER || 'root',
  password: process.env.PAI_TEST_DB_PASSWORD || '', multipleStatements: true };
const db=await mysql.createConnection(config);
await db.query(`CREATE DATABASE \`${database}\`; USE \`${database}\`;`);
let server;
try {
for (const file of ['001_public_identity.sql','002_membership_configuration.sql']) await db.query(await readFile(root+'migrations/'+file,'utf8'));
await db.query(`CREATE TABLE IF NOT EXISTS site_content_messages (id INT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(200),description TEXT,link TEXT,media_url TEXT,media_type VARCHAR(10),notes_url TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_content_testimonies (id INT PRIMARY KEY AUTO_INCREMENT,name VARCHAR(80),location VARCHAR(80),testimony TEXT,is_approved TINYINT DEFAULT 0,show_name TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_content_wall_prayers (id INT PRIMARY KEY AUTO_INCREMENT,name VARCHAR(80),request TEXT,prayed_count INT DEFAULT 0,is_approved TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO site_content_testimonies(name,testimony,is_approved,show_name) VALUES ('Private name','Approved anonymous testimony',1,0),('Unapproved name','Not approved',0,1);`);
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const base=`http://127.0.0.1:${port}`;
async function start(){server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DB_HOST:config.host,DB_PORT:String(config.port),DB_USER:config.user,DB_PASSWORD:config.password,DB_NAME:database,PAI_DATA_DIR:'',ADMIN_EMAIL:'owner@example.test',ADMIN_INITIAL_PASSWORD:'local-test-password',PAI_PUBLIC_ACCOUNTS_ENABLED:'true',PAI_PUBLIC_REGISTRATION_ENABLED:'true'},stdio:'ignore'});for(let i=0;i<100;i++){try {if((await fetch(base)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('startup failed');}
const get=(p,init={})=>fetch(base+p,init);
const send=(p,b,opts={})=>get(p,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...opts.headers},body:JSON.stringify(b),...Object.fromEntries(Object.entries(opts).filter(([k])=>k!=='headers'))});
await start();
let r=await send('/api/admin/login',{email:'owner@example.test',password:'local-test-password'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
r=await get('/api/admin/session',{headers:{Cookie:cookie}});assert.equal((await r.json()).user.email,'owner@example.test');
r=await get('/api/settings');assert.equal(r.status,200);const settings=await r.json();const revision=Number(r.headers.get('X-Settings-Revision'));settings.general.churchName='Local regression';settings.passkey='must-not-save';settings.notifications={email:'private@example.test'};
r=await send('/api/settings',settings,{headers:{Cookie:cookie,'If-Match-Settings-Revision':String(revision)}});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.revision,revision+1);assert.equal(saved.settings.general.churchName,'Local regression');assert.equal(saved.settings.passkey,undefined);assert.equal(saved.settings.notifications,undefined);
r=await send('/api/settings',settings,{headers:{Cookie:cookie,'If-Match-Settings-Revision':String(revision)}});assert.equal(r.status,409);
r=await get('/api/form-token');const token=(await r.json()).token;await new Promise(r=>setTimeout(r,2100));
r=await send('/api/rest/v1/prayer_requests',{name:'Tester',contact:'phone123',request:'Local private prayer',is_private:true,_ft:token});assert.equal(r.status,201);
r=await send('/api/rest/v1/connect_requests',{name:'Tester',email:'test@example.test',kind:'visitor',note:'Local enquiry',_ft:token});assert.equal(r.status,201);
const manage=(action,payload={})=>send('/api/functions/v1/manage-content',{action,payload},{headers:{Cookie:cookie}});
r=await manage('list_prayer_requests');assert.equal(r.status,200);let row=(await r.json()).requests[0];assert.equal(row.contact,'phone123');assert.equal(row.is_private,true);assert.equal(row.is_read,false);
r=await manage('set_prayer_followup',{id:row.id,follow_up:'in_progress',admin_note:'Local note'});assert.equal(r.status,200);r=await manage('list_prayer_requests');row=(await r.json()).requests[0];assert.equal(row.is_read,true);assert.equal(row.admin_note,'Local note');assert.equal(row.follow_up,'in_progress');
r=await manage('list_connect_requests');row=(await r.json()).requests[0];assert.equal(row.note,'Local enquiry');assert.equal(row.kind,'visitor');await manage('mark_connect_contacted',{id:row.id,is_contacted:true});r=await manage('list_connect_requests');assert.equal((await r.json()).requests[0].is_contacted,true);
r=await get('/api/rest/v1/testimonies');const rows=await r.json();assert.ok(rows.length);assert.ok(rows.every(r=>r.name==='Anonymous'));assert.ok(rows.every(r=>r.testimony!=='Not approved'));
r=await send('/api/admin/membership/configuration',{approvalMode:'automatic',requireEmailVerification:false},{method:'PUT',headers:{Cookie:cookie}});assert.equal(r.status,400);
r=await send('/api/admin/membership/configuration',{approvalMode:'manual',requireEmailVerification:false},{method:'PUT',headers:{Cookie:cookie}});assert.equal(r.status,200);
r=await send('/api/public/register',{email:'member'+Date.now()+'@example.test',displayName:'Local member',password:'local-member-password'});assert.equal(r.status,202);
r=await get('/api/admin/membership/applications',{headers:{Cookie:cookie}});const member=(await r.json()).applications[0];assert.ok(member);r=await send('/api/admin/membership/applications/'+member.id+'/decision',{decision:'approve'},{headers:{Cookie:cookie}});assert.equal(r.status,200);
r=await send('/api/public/login',{email:member.email,password:'local-member-password'});assert.equal(r.status,200);const memberCookie=r.headers.get('set-cookie').split(';')[0];r=await get('/api/public/me',{headers:{Cookie:memberCookie}});assert.deepEqual((await r.json()).account.roles,['member']);
await new Promise(resolve=>{server.once('exit',resolve);server.kill();});await start();r=await get('/api/settings');assert.equal((await r.json()).general.churchName,'Local regression');
console.log('PASS Node integration: authentication, settings revision conflict, private forms, follow-up, anonymous testimonies, membership approval, persistence across restart');
}finally{
  if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  await db.query(`DROP DATABASE \`${database}\``);
  await db.end();
}
