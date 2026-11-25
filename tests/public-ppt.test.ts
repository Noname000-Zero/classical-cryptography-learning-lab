import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractPpt} from '../tools/ppt.mjs';
test('PPT parser rejects malformed synthetic inputs without lecture files',()=>{
  for(const b of [Buffer.alloc(0),Buffer.alloc(512),Buffer.from('%PDF-1.7'),Buffer.from('not a document')])assert.throws(()=>extractPpt(b));
});
test('Caesar reference arithmetic wraps and reverses shifts',()=>{
  const encode=(s:string,k:number)=>s.replace(/[A-Z]/g,c=>String.fromCharCode(65+((c.charCodeAt(0)-65+k)%26+26)%26));
  assert.equal(encode('XYZ',29),'ABC');assert.equal(encode('ABC',-3),'XYZ');
  for(let k=-52;k<=52;k++)assert.equal(encode(encode('ALGORITHM',k),-k),'ALGORITHM');
});
