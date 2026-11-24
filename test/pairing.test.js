import test from 'node:test';
import assert from 'node:assert/strict';
import {suggest,warnings,validateGroups,demoRoom,fixedDemoPairs} from '../src/pairing.js';

test('fixed demo matches Figma and has exactly one skill-gap warning',()=>{
  const people=demoRoom().roster.filter(p=>!p.skip);
  assert.ok(validateGroups(fixedDemoPairs,people));
  assert.deepEqual(fixedDemoPairs.flatMap(g=>warnings(g,people)),['Level gap: Beginner + Advanced']);
});
test('automatic pairing covers every eligible person exactly once at even and odd sizes',()=>{
  for(const size of [2,3,6,7,20,21,34,35,60]){
    const people=Array.from({length:size},(_,i)=>({id:String(i),level:2,intensity:2,preference:'any'}));
    const result=suggest(people,[],17);
    assert.ok(validateGroups(result,people),`Invalid coverage at ${size}`);
    assert.equal(result.flatMap(g=>warnings(g,people)).length,0);
  }
});
test('avoids safety conflicts when a compatible matching exists',()=>{
  const people=Array.from({length:12},(_,i)=>({id:String(i),level:1+Math.floor(i/4),intensity:1+Math.floor(i/4),preference:'same'}));
  assert.deepEqual(suggest(people,[],1).flatMap(g=>warnings(g,people)),[]);
});
test('round two avoids repeat partners when possible, flags unavoidable repeats',()=>{
  const people=Array.from({length:8},(_,i)=>({id:String(i),level:2,intensity:2,preference:'any'}));
  const first=suggest(people,[],123),second=suggest(people,first,456);
  assert.deepEqual(second.flatMap(g=>warnings(g,people,first)),[]);
  assert.deepEqual(warnings(['0','1'],people,[['0','1']]),['Partners in Round 1']);
});
test('invalid coverage is rejected; one member cannot be paired',()=>{
  const p=[{id:'a'},{id:'b'},{id:'c'}];
  assert.equal(validateGroups([['a','b'],['b','c']],p),false);
  assert.equal(validateGroups([['a','b'],['c']],p),false);
  assert.throws(()=>suggest([{id:'a'}]),/At least two/);
});
