import http from 'node:http';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { newRoom, demoRoom, fixedDemoPairs, suggest, warnings, validateGroups } from './pairing.js';

const scryptAsync = promisify(scrypt);
const hash = text => createHash('sha256').update(text).digest('hex');
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const safeUser = u => ({ id: u.id, name: u.name, role: u.role, email: u.email, profile: u.profile, memberCode: u.memberCode });
const active = room => room.roster.filter(p => p.present && !p.skip);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const cleanName = value => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) fail(400, 'Enter a name of 1–60 characters.'); return value.trim(); };
function profile(input) {
  if (!input || ![1,2,3].includes(input.level) || ![1,2,3].includes(input.intensity) || !['same','above','any'].includes(input.preference)) fail(400, 'Choose skill, intensity, and preferred partner.');
  return { level: input.level, intensity: input.intensity, preference: input.preference };
}
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, 'Use a password with 10–128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString('hex')}`;
}
async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 128 || !stored) return false;
  const [salt, key] = stored.split(':');
  return timingSafeEqual(Buffer.from(key, 'hex'), await scryptAsync(password, salt, 64));
}

export function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const directory = options.directory || process.env.DATA_DIR || './data';
  const store = options.store || createStore({mode: options.mode || process.env.STORAGE_MODE || 'sqlite', directory});
  let invite = options.invite || process.env.COACH_INVITE_CODE;
  if (!invite) {
    mkdirSync(directory, {recursive:true,mode:0o700});
    const path = join(directory, 'coach-invite.txt');
    invite = existsSync(path) ? readFileSync(path,'utf8').trim() : randomBytes(18).toString('base64url');
    if (!existsSync(path)) writeFileSync(path,invite,{mode:0o600});
    console.log(`Coach invite saved to ${resolve(path)} (keep private).`);
  }
  const rate = new Map();
  function limit(req, category, max = 25) {
    // Trust Railway's appended client address only in production; never an arbitrary leftmost proxy address.
    const ip = production ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
    const key = `${category}:${ip}`;
    const now = Date.now(), item = rate.get(key);
    if (rate.size > 5000) for (const [k,v] of rate) if (v.until < now) rate.delete(k);
    if (!item || item.until < now) rate.set(key,{count:1,until:now+15*60*1000});
    else if (++item.count > max) fail(429,'Too many attempts. Please try again in 15 minutes.');
  }
  const cookieValue = (req, name) => (req.headers.cookie || '').split(';').map(p=>p.trim()).find(p=>p.startsWith(`${name}=`))?.slice(name.length+1);
  function cookie(res, name, token, seconds) {
    res.setHeader('Set-Cookie', `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${production ? '; Secure' : ''}`);
  }
  function session(req, kind='account') {
    const token = cookieValue(req,kind==='account'?'pu_session':'pu_door');
    if (!token) return null;
    const row = store.db.prepare('SELECT * FROM sessions WHERE token=? AND kind=? AND expires>?').get(hash(token),kind,Date.now());
    if (!row) return null;
    return store.get().users.find(u=>u.id===row.user_id) || null;
  }
  function requireUser(req, coach=false, kind='account') {
    const user = session(req,kind);
    if (!user) fail(401,kind==='door'?'Door session expired. Ask a coach to unlock it.':'Please sign in to continue.');
    if (coach && user.role!=='coach') fail(403,'This action is only available to coaches.');
    return user;
  }
  function signIn(res,user,kind='account') {
    const token=randomBytes(32).toString('base64url'), age=kind==='door'?8*3600:7*86400;
    store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    store.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),user.id,kind,Date.now()+age*1000);
    cookie(res,kind==='door'?'pu_door':'pu_session',token,age);
  }
  function roomFor(req,url) {
    const coach=requireUser(req,true);
    const key=url.searchParams.get('mode')==='demo'?`demo:${coach.id}`:'live';
    if(!store.get().rooms[key]) { store.get().rooms[key]=demoRoom();store.save(); }
    return store.get().rooms[key];
  }
  function roomView(room) {
    return {...room,undo:undefined,canUndo:room.undo.length>0,groups:room.groups.map(g=>({ids:g,warnings:warnings(g,room.roster,room.round===2?room.firstGroups:[])}))};
  }
  function checkpoint(room) { room.undo.push({groups:structuredClone(room.groups),stage:room.stage,source:room.source}); if(room.undo.length>50)room.undo.shift(); }
  function changed(room) {room.revision++;store.save();}
  function checkRevision(room,body) {if(body.revision!==room.revision)fail(409,'The class changed on another device. Refresh and try again.');}
  function checkIn(user, p, skip) {
    const room=store.get().rooms.live;
    if(room.stage==='confirmed' || room.round!==1) fail(409,'Pairing has already been confirmed. Please ask your coach about joining.');
    if(!room.roster.some(m=>m.id===user.id)&&room.roster.length>=60)fail(400,'This class is full (60 members).');
    user.profile=p;
    const existing=room.roster.find(m=>m.id===user.id);
    const item={id:user.id,name:user.name,...p,skip:Boolean(skip),present:true};
    if(existing)Object.assign(existing,item);else room.roster.push(item);
    room.groups=[];room.undo=[];room.stage='open';changed(room);
    return {name:user.name,memberCode:user.memberCode,skip:Boolean(skip)};
  }
  async function handler(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      if(path==='/api/health')return json({ok:true,storage:store.mode});
      let body={};
      if(!['GET','HEAD'].includes(req.method)) {
        if(req.headers.origin) {
          const expected=process.env.APP_ORIGIN || `${production?'https':'http'}://${req.headers.host}`;
          if(req.headers.origin!==expected)fail(403,'Request origin is not allowed.');
        }
        if(!String(req.headers['content-type']).startsWith('application/json'))fail(415,'Use application/json.');
        let data='';for await(const chunk of req){data+=chunk;if(data.length>20000)fail(413,'Request is too large.');}
        try {body=JSON.parse(data||'{}');}catch{fail(400,'Invalid JSON.');}
        if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'Invalid request.');
      }
      if(path==='/api/register'&&req.method==='POST') {
        limit(req,'auth');
        const name=cleanName(body.name),email=String(body.email||'').trim().toLowerCase();
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>180)fail(400,'Enter a valid email address.');
        const role=body.role==='coach'?'coach':'member';
        if(role==='coach'&&(typeof body.invite!=='string'||hash(body.invite)!==hash(invite)))fail(403,'A valid coach invitation code is required.');
        const password=await passwordHash(body.password);
        if(store.get().users.some(u=>u.email===email))fail(409,'This email is already registered. Sign in instead.');
        const user={id:randomUUID(),name,email,password,role,profile:null,memberCode:randomBytes(6).toString('hex').toUpperCase()};
        store.get().users.push(user);store.save();signIn(res,user);return json({user:safeUser(user)},201);
      }
      if(path==='/api/login'&&req.method==='POST') {
        limit(req,'auth');
        const user=store.get().users.find(u=>u.email===String(body.email||'').trim().toLowerCase());
        if(!user||!await passwordMatches(body.password,user.password))fail(401,'Email or password is incorrect.');
        signIn(res,user);return json({user:safeUser(user)});
      }
      if(path==='/api/logout'&&req.method==='POST') {
        const token=cookieValue(req,'pu_session');if(token)store.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        cookie(res,'pu_session','',0);return json({ok:true});
      }
      if(path==='/api/me'&&req.method==='GET') {
        const user=session(req);return json({user:user?safeUser(user):null,storage:store.mode,door:Boolean(session(req,'door'))});
      }
      if(path==='/api/profile'&&req.method==='POST') {
        const user=requireUser(req);user.profile=profile(body);store.save();return json({user:safeUser(user)});
      }
      if(path==='/api/checkin'&&req.method==='POST')return json(checkIn(requireUser(req),profile(body),body.skip));
      if(path==='/api/member/status'&&req.method==='GET') {
        const user=requireUser(req),room=store.get().rooms.live,entry=room.roster.find(p=>p.id===user.id);
        const group=room.stage==='confirmed'?room.groups.find(g=>g.includes(user.id)):null;
        return json({checkedIn:Boolean(entry?.present),skip:Boolean(entry?.skip),round:room.round,confirmed:room.stage==='confirmed',partners:group?group.filter(id=>id!==user.id).map(id=>room.roster.find(p=>p.id===id)?.name):[],title:room.title});
      }
      if(path==='/api/door/open'&&req.method==='POST') {
        const coach=requireUser(req,true);signIn(res,coach,'door');
        // Door cookie grants only kiosk endpoints. Revoke the coach cookie on this device.
        const token=cookieValue(req,'pu_session');if(token)store.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        return json({ok:true});
      }
      if(path==='/api/door/close'&&req.method==='POST') {
        const token=cookieValue(req,'pu_door');if(token)store.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        cookie(res,'pu_door','',0);return json({ok:true});
      }
      if(path.startsWith('/api/door/')) {
        requireUser(req,true,'door');
        if(req.method!=='POST')fail(405,'Method not allowed.');
        limit(req,'door',100);
        if(path==='/api/door/lookup') {
          const user=store.get().users.find(u=>u.memberCode===String(body.code||'').replace(/[\s-]/g,'').toUpperCase());
          if(!user)fail(404,'Code not found. Check your member code or choose first visit.');
          return json({name:user.name,profile:user.profile});
        }
        if(path==='/api/door/checkin') {
          const p=profile(body);
          let user=body.code?store.get().users.find(u=>u.memberCode===String(body.code).replace(/[\s-]/g,'').toUpperCase()):null;
          if(body.code&&!user)fail(404,'Member code not found.');
          if(!user) {
            const room=store.get().rooms.live;
            if(room.stage==='confirmed'||room.round!==1||room.roster.length>=60)fail(409,'Check-in is closed. Please ask your coach.');
            user={id:randomUUID(),name:cleanName(body.name),email:null,password:null,role:'member',profile:p,memberCode:randomBytes(6).toString('hex').toUpperCase()};
            store.get().users.push(user);
          }
          return json(checkIn(user,p,body.skip));
        }
        fail(404,'Not found.');
      }
      if(path==='/api/coach/room'&&req.method==='GET')return json(roomView(roomFor(req,url)));
      if(path.startsWith('/api/coach/')&&req.method==='POST') {
        const room=roomFor(req,url);checkRevision(room,body);
        if(path==='/api/coach/reset') {
          if(body.confirm!=='NEW CLASS')fail(400,'Type NEW CLASS to start over.');
          const fresh=room.demo?demoRoom():newRoom();fresh.revision=room.revision;
          if(body.title)fresh.title=cleanName(body.title);
          Object.assign(room,fresh);changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/member') {
          if(room.stage==='confirmed')fail(409,'Start the next round before changing the roster.');
          const member=room.roster.find(p=>p.id===body.id);if(!member)fail(404,'Member not found.');
          if(body.level!==undefined){if(![1,2,3].includes(body.level))fail(400,'Invalid level.');member.level=body.level;}
          if(body.present!==undefined)member.present=Boolean(body.present);
          if(body.skip!==undefined)member.skip=Boolean(body.skip);
          room.groups=[];room.undo=[];room.stage='open';changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/next-round') {
          if(room.stage!=='confirmed'||room.round!==1)fail(409,'Confirm Round 1 before starting Round 2.');
          room.firstGroups=structuredClone(room.groups);room.round=2;room.stage='open';room.groups=[];room.undo=[];
          changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/suggest') {
          if(room.stage==='confirmed')fail(409,'This round is already confirmed.');
          const members=active(room);if(members.length<2)fail(400,'Check in at least two members who want to pair.');
          if(body.source==='fixed') {
            if(!room.demo||room.round!==1||!validateGroups(fixedDemoPairs,members))fail(400,'Fixed pairs require the original Round 1 demo roster. Reset the demo to use them.');
            checkpoint(room);
            room.groups=structuredClone(fixedDemoPairs);room.source='fixed';
          }else{checkpoint(room);room.groups=suggest(members,room.round===2?room.firstGroups:[],randomBytes(4).readUInt32LE());room.source='automatic';}
          room.stage='draft';changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/swap') {
          if(room.stage!=='draft')fail(409,'Generate suggestions before swapping.');
          const a=room.groups.findIndex(g=>g.includes(body.a)),b=room.groups.findIndex(g=>g.includes(body.b));
          if(a<0||b<0||a===b)fail(400,'Choose members from two different groups.');
          checkpoint(room);
          const i=room.groups[a].indexOf(body.a),j=room.groups[b].indexOf(body.b);
          [room.groups[a][i],room.groups[b][j]]=[room.groups[b][j],room.groups[a][i]];
          changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/undo') {
          if(room.stage==='confirmed'||!room.undo.length)fail(400,'Nothing to undo.');
          Object.assign(room,room.undo.pop());changed(room);return json(roomView(room));
        }
        if(path==='/api/coach/confirm') {
          if(room.stage!=='draft'||!validateGroups(room.groups,active(room)))fail(409,'Generate complete pairs before confirming.');
          if(room.groups.some(g=>warnings(g,room.roster,room.round===2?room.firstGroups:[]).length)&&body.acceptWarnings!==true)fail(400,'Review the flagged pairs before confirming.');
          room.stage='confirmed';room.undo=[];room.confirmedAt=new Date().toISOString();changed(room);return json(roomView(room));
        }
      }
      if(path.startsWith('/api/'))fail(404,'Not found.');
      if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
      const file=path==='/'||!path.split('/').at(-1).includes('.')?'index.html':path.slice(1);
      const target=resolve(publicDir,file);if(!target.startsWith(publicDir+'/'))fail(404,'Not found.');
      let content;try{content=await readFile(target);}catch{fail(404,'Not found.');}
      const ext=file.split('.').at(-1),types={html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',png:'image/png'};
      res.writeHead(200,{'Content-Type':`${types[ext]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){if(!error.status)console.error(error);if(!res.headersSent)json({error:error.status?error.message:'Something went wrong. Please try again.'},error.status||500);else res.end();}
  }
  const server=http.createServer(handler);
  return {server,store};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createApp();
  app.server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Pair Up ready on port ${process.env.PORT||3000} (${app.store.mode})`));
  const stop=()=>app.server.close(()=>{app.store.close();process.exit(0);});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
