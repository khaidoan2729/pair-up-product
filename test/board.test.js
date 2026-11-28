import test from 'node:test';
import assert from 'node:assert/strict';
import {suggest,warnings,reason,validateGroups} from '../src/pairing.js';
import {createApp} from '../src/server.js';

const P=(id,level,intensity=2,extra={})=>({id,name:id.toUpperCase(),level,intensity,preference:'any',...extra});

test('coach notes raise flags only when they are broken',()=>{
  const people=[P('a',1,2,{needsLevel:1}),P('b',2),P('c',1),P('d',1,2,{apart:['c']})];
  assert.deepEqual(warnings(['a','b'],people),['Coach note: A needs a Beginner partner']);
  assert.deepEqual(warnings(['a','c'],people),[]);
  assert.deepEqual(warnings(['c','d'],people),['Coach note: keep C and D apart']);
});
test('reason line says why a pair fits',()=>{
  const people=[P('a',2),P('b',2),P('c',1,2,{preference:'same'})];
  assert.equal(reason(['a','b'],people),'Same level · same intensity');
  assert.equal(reason(['b','c'],people),'1 level apart · same intensity · preference not fully met');
});
test('auto-pair keeps hand-placed groups and fills the rest',()=>{
  const people=Array.from({length:7},(_,i)=>P(String(i),2));
  const result=suggest(people,[],5,[['0','1']]);
  assert.ok(validateGroups(result,people));
  assert.deepEqual(result[0],['0','1']);
  const five=Array.from({length:5},(_,i)=>P(String(i),2));
  assert.equal(suggest(five,[],5,[['0','1'],['2','3']]).filter(g=>g.length===3).length,1);
  const four=Array.from({length:4},(_,i)=>P(String(i),2));
  assert.throws(()=>suggest(four,[],5,[['0','1','2']]),/group of three/);
});
test('auto-pair steers a member toward the partner level the coach asked for',()=>{
  const people=[P('i',2,2,{needsLevel:1}),P('b',1),P('x',2),P('y',2)];
  const group=suggest(people,[],9).find(g=>g.includes('i'));
  assert.ok(group.includes('b'));
  assert.deepEqual(warnings(group,people),[]);
});

async function fixture(t){
  const app=createApp({mode:'memory',invite:'test-coach-invite'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.close();});
  const client=()=>{const cookies={};return async(path,body)=>{
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')},body:body?JSON.stringify(body):undefined});
    for(const value of response.headers.getSetCookie()){const [name,token]=value.split(';')[0].split('=');cookies[name]=token;}
    return {status:response.status,data:await response.json()};
  };};
  const coach=client(),member=client();
  await coach('/api/register',{name:'Coach',email:'coach@example.com',password:'test-password-123',role:'coach',invite:'test-coach-invite'});
  await member('/api/register',{name:'Member',email:'member@example.com',password:'test-password-123'});
  return {coach,member};
}
test('manual board: place by hand, trio removal, auto-pair the rest, confirm',async t=>{
  const {coach}=await fixture(t),q='?mode=demo',post=(path,body)=>coach(`/api/coach/${path}${q}`,body);
  let room=(await coach('/api/coach/room'+q)).data;
  room=(await post('suggest',{revision:room.revision,source:'manual'})).data;
  assert.equal(room.stage,'draft');assert.deepEqual(room.groups,[]);assert.equal(room.unassigned.length,10);
  room=(await post('arrange',{revision:room.revision,op:'pair',ids:['demo-0','demo-1']})).data;
  assert.equal(room.unassigned.length,8);
  assert.equal((await post('arrange',{revision:room.revision,op:'pair',ids:['demo-0','demo-2']})).status,400);
  room=(await post('arrange',{revision:room.revision,op:'pair',ids:['demo-2','demo-3','demo-4']})).data;
  room=(await post('arrange',{revision:room.revision,op:'remove',ids:['demo-3']})).data;
  assert.deepEqual(room.groups[1].ids,['demo-2','demo-4']);assert.ok(room.unassigned.includes('demo-3'));
  assert.equal((await post('arrange',{revision:room.revision,op:'remove',ids:['demo-0']})).status,400);
  assert.equal((await post('confirm',{revision:room.revision})).status,409);
  room=(await post('suggest',{revision:room.revision,source:'automatic',keep:true})).data;
  assert.equal(room.unassigned.length,0);assert.equal(room.source,'mixed');
  assert.deepEqual(room.groups[0].ids,['demo-0','demo-1']);
  assert.ok(room.groups.every(g=>typeof g.reason==='string'));
  assert.equal((await post('confirm',{revision:room.revision,acceptWarnings:true})).status,200);
});
test('coach notes stay coach-only and a member can be toggled for Hour 2',async t=>{
  const {coach,member}=await fixture(t);
  await member('/api/checkin',{level:2,intensity:2,preference:'any'});
  let room=(await coach('/api/coach/room')).data;const id=room.roster[0].id;
  room=(await coach('/api/coach/member',{revision:room.revision,id,note:'Returning from injury',needsLevel:1})).data;
  assert.equal(room.roster[0].note,'Returning from injury');
  room=(await coach('/api/coach/member',{revision:room.revision,id,present:false})).data;
  assert.equal(room.roster[0].present,false);
  room=(await coach('/api/coach/member',{revision:room.revision,id,present:true})).data;
  assert.equal(room.roster[0].present,true);
  const status=JSON.stringify((await member('/api/member/status')).data);
  assert.equal(status.includes('injury'),false);assert.equal(status.includes('level'),false);
});