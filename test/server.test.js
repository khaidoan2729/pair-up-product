import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.js';
import {createStore} from '../src/store.js';

async function fixture(t){
  const app=createApp({mode:'memory',invite:'test-coach-invite'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.close();});
  function client(){let cookies={};return async(path,body,headers={})=>{
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...headers},body:body?JSON.stringify(body):undefined});
    for(const value of response.headers.getSetCookie()){const [name,token]=value.split(';')[0].split('=');cookies[name]=token;}
    const data=await response.json();return {status:response.status,data,headers:response.headers};
  };}
  const coach=client(),member=client();
  assert.equal((await coach('/api/register',{name:'Coach',email:'coach@example.com',password:'test-password-123',role:'coach',invite:'test-coach-invite'})).status,201);
  assert.equal((await member('/api/register',{name:'Member',email:'member@example.com',password:'test-password-123'})).status,201);
  return {app,coach,member,client};
}
test('authorization, roles, origin validation, password hashing, and logout',async t=>{
  const {app,coach,member,client}=await fixture(t);
  assert.equal((await client()('/api/coach/room')).status,401);
  assert.equal((await member('/api/coach/room')).status,403);
  assert.equal((await client()('/api/register',{name:'Intruder',email:'bad@example.com',password:'test-password-123',role:'coach',invite:'wrong'})).status,403);
  assert.equal((await member('/api/profile',{level:1,intensity:1,preference:'same'},{origin:'https://evil.example'})).status,403);
  assert.ok(!app.store.get().users[0].password.includes('test-password'));
  assert.equal((await coach('/api/logout',{})).status,200);
  assert.equal((await coach('/api/coach/room')).status,401);
});
test('live check-ins, confirmation, member privacy, second round, stale writes',async t=>{
  const {coach,member,client}=await fixture(t),other=client();
  const registered=await other('/api/register',{name:'Partner',email:'partner@example.com',password:'test-password-123'});
  const p={level:2,intensity:2,preference:'same'};
  assert.equal((await member('/api/checkin',p)).status,200);
  assert.equal((await other('/api/checkin',p)).status,200);
  let room=(await coach('/api/coach/room')).data;
  assert.equal(room.roster.length,2);
  assert.equal((await coach('/api/coach/suggest',{revision:0})).status,409);
  room=(await coach('/api/coach/suggest',{revision:room.revision})).data;
  assert.equal(room.stage,'draft');
  assert.equal((await member('/api/member/status')).data.partners.length,0);
  room=(await coach('/api/coach/confirm',{revision:room.revision})).data;
  assert.equal(room.stage,'confirmed');
  const status=(await member('/api/member/status')).data;
  assert.deepEqual(status.partners,['Partner']);assert.equal(JSON.stringify(status).includes('intensity'),false);
  assert.equal((await member('/api/checkin',p)).status,409);
  room=(await coach('/api/coach/next-round',{revision:room.revision})).data;
  assert.equal(room.round,2);
  room=(await coach('/api/coach/suggest',{revision:room.revision})).data;
  assert.deepEqual(room.groups[0].warnings,['Partners in Round 1']);
  assert.equal((await coach('/api/coach/confirm',{revision:room.revision})).status,400);
  assert.equal((await coach('/api/coach/confirm',{revision:room.revision,acceptWarnings:true})).status,200);
});
test('demo is isolated, fixed suggestions swap and undo, incomplete fixed roster rejected',async t=>{
  const {coach}=await fixture(t);const q='?mode=demo';
  let room=(await coach('/api/coach/room'+q)).data;
  room=(await coach('/api/coach/suggest'+q,{revision:room.revision,source:'fixed'})).data;
  const original=structuredClone(room.groups);
  room=(await coach('/api/coach/swap'+q,{revision:room.revision,a:'demo-4',b:'demo-8'})).data;
  assert.equal(room.groups.filter(g=>g.warnings.length).length,3);
  room=(await coach('/api/coach/undo'+q,{revision:room.revision})).data;
  assert.deepEqual(room.groups,original);
  assert.equal((await coach('/api/coach/room')).data.roster.length,0);
  room=(await coach('/api/coach/member'+q,{revision:room.revision,id:'demo-0',present:false})).data;
  assert.equal((await coach('/api/coach/suggest'+q,{revision:room.revision,source:'fixed'})).status,400);
});
test('door access is scoped, revokes coach login, supports new and returning members',async t=>{
  const {coach,member,client}=await fixture(t);
  assert.equal((await client()('/api/door/lookup',{code:'x'})).status,401);
  assert.equal((await member('/api/door/open',{})).status,403);
  assert.equal((await coach('/api/door/open',{})).status,200);
  assert.equal((await coach('/api/coach/room')).status,401);
  const p={name:'Door Guest',level:1,intensity:1,preference:'any'};
  const checked=await coach('/api/door/checkin',p);assert.equal(checked.status,200);
  const lookup=await coach('/api/door/lookup',{code:checked.data.memberCode});
  assert.equal(lookup.data.name,'Door Guest');assert.equal(lookup.data.email,undefined);
  assert.equal((await coach('/api/door/checkin',{...p,code:checked.data.memberCode})).status,200);
  assert.equal((await coach('/api/door/close',{})).status,200);
  assert.equal((await coach('/api/door/lookup',{code:checked.data.memberCode})).status,401);
});
test('SQLite survives restarts; RAM storage starts fresh',()=>{
  const directory=mkdtempSync(join(tmpdir(),'pair-up-test-'));
  try{
    let store=createStore({mode:'sqlite',directory});store.get().users.push({id:'persisted'});store.save();store.close();
    store=createStore({mode:'sqlite',directory});assert.equal(store.get().users[0].id,'persisted');store.close();
    store=createStore({mode:'memory'});assert.equal(store.get().users.length,0);store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});
