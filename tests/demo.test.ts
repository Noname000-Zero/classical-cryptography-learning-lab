import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {createApp} from '../server/app.js';
test('Public demo works independently with 13 lessons, 28 cards and zero third-party documents',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academy-demo-'));
  const app=createApp({dataDir:dir,catalogPath:path.resolve('data/demo-catalog.json')});
  try{const api=request(app.app);const b=(await api.get('/api/bootstrap').expect(200)).body;
    assert.equal(b.documents.length,0);assert.equal(b.lessons.length,13);assert.equal(b.stats.xp,0);
    const c=(await api.get('/api/cards').expect(200)).body.cards;assert.equal(c.length,28);assert.ok(c.every((x:any)=>x.sourceReferences.length===0));
    assert.equal(typeof (await api.get('/api/tutor/status')).body.configured,'boolean');
  }finally{app.close();assert.ok(dir.startsWith(os.tmpdir()));assert.match(path.basename(dir),/^academy-demo-/);fs.rmSync(dir,{recursive:true,force:true});}
});
