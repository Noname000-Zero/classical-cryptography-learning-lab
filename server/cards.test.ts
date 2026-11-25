import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from './app.js';
import { cardTables, runnerTables } from './cards.js';
import { buildCardCatalog } from './card-catalog.js';

const fixture=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academy-cards-'));
  const catalogPath=path.join(dir,'catalog.json');
  fs.writeFileSync(catalogPath,JSON.stringify({documents:[],lessons:[{id:'caesar',courseId:'security',moduleId:'cipher',title:'Caesar',summary:'Caesar summary',content:{formula:'C=(P+k) mod26'},sourceReferences:[],exercises:[{id:'legacy-ex',type:'text',prompt:'A+3?',answer:'D',supplemental:true}]}]}));
  return {dir,options:{dataDir:dir,catalogPath}};
};
const cleanup=(dir:string)=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));assert.match(path.basename(dir),/^academy-cards-/);fs.rmSync(dir,{recursive:true,force:true});};
const checksum=(payload:unknown)=>createHash('sha256').update(JSON.stringify(payload)).digest('hex');

test('Code cards persist per mode; hints are gated; external output never verifies code or awards XP',async()=>{
  const f=fixture();let app=createApp(f.options);
  try {
    let api=request(app.app);
    const cards=(await api.get('/api/cards').query({lessonId:'caesar'}).expect(200)).body.cards;
    assert.equal(cards.length,7);assert.equal(cards[0].solution,undefined);assert.equal(cards[0].hints,undefined);assert.equal(cards[0].answer,undefined);
    const id=cards[0].id;
    await api.put(`/api/cards/${id}/progress`).send({mode:'training',code:'// training'}).expect(200);
    await api.put(`/api/cards/${id}/progress`).send({mode:'match',code:'// match'}).expect(200);
    await api.put(`/api/cards/${id}/progress`).send({mode:'training',code:'fake',completed:true,xp:999,verified:true}).expect(400);
    for(let i=1;i<=4;i++)assert.equal((await api.post(`/api/cards/${id}/hint`).send({mode:'training'}).expect(200)).body.hints.length,Math.min(i,3));
    await api.post(`/api/cards/${id}/hint`).send({mode:'exam'}).expect(403);
    await api.get(`/api/cards/${id}/hints`).query({mode:'match'}).expect(403);
    await api.post(`/api/cards/${id}/solution`).send({mode:'training',confirmed:false}).expect(400);
    await api.post(`/api/cards/${id}/solution`).send({mode:'match',confirmed:true}).expect(403);
    assert.match((await api.post(`/api/cards/${id}/solution`).send({mode:'training',confirmed:true})).body.solution,/int main/);
    const correct=await api.post(`/api/cards/${id}/attempts`).send({mode:'training',code:'not valid C++',kind:'external',outputs:['a','x']}).expect(200);
    assert.equal(correct.body.status,'manual_match');assert.equal(correct.body.verified,false);assert.equal(correct.body.xp,0);assert.equal(correct.body.progress.completed,false);
    const wrong=await api.post(`/api/cards/${id}/attempts`).send({mode:'training',code:'broken code',kind:'external',outputs:['Z','x']}).expect(200);
    assert.equal(wrong.body.status,'manual_mismatch');assert.equal(wrong.body.solution,undefined);assert.equal(wrong.body.progress.attempts,2);
    await api.post(`/api/cards/${id}/attempts`).send({mode:'training',code:'',kind:'external',outputs:['a']}).expect(400);
    await api.post(`/api/cards/${id}/attempts`).send({mode:'training',code:'',kind:'answer',answer:'a'}).expect(503);
    await api.post(`/api/cards/${id}/execute`).send({code:'while(true){}'}).expect(400);
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,0);
    const exam=(await api.get('/api/cards').query({lessonId:'caesar',mode:'exam'})).body.cards;
    assert.equal(exam.length,1);assert.equal(exam[0].examEligible,true);assert.equal(exam[0].starterCode,'');
    const session=(await api.post(`/api/cards/${id}/session`).send({mode:'training'})).body;
    await api.post(`/api/cards/${id}/time`).send({mode:'training',seconds:60,token:session.token}).expect(429);
    await api.post(`/api/cards/${id}/time`).send({mode:'match',seconds:1,token:session.token}).expect(409);
    app.close();app=createApp(f.options);api=request(app.app);
    const saved=(await api.get(`/api/cards/${id}`)).body.card.progress;
    assert.equal(saved.code,'broken code');assert.equal(saved.hintsUsed,3);assert.equal(saved.solutionViewed,true);assert.equal(saved.attempts,2);
    assert.equal((await api.get(`/api/cards/${id}`).query({mode:'match'})).body.card.progress.code,'// match');
    const backup=(await api.get('/api/backup')).body;assert.equal(backup.payload.schemaVersion,3);assert.equal(backup.payload.tables.card_attempts.length,2);
    await api.put(`/api/cards/${id}/progress`).send({mode:'training',code:'changed'});
    await api.post('/api/restore').send({confirm:true,backup}).expect(200);
    assert.equal((await api.get(`/api/cards/${id}`)).body.card.progress.code,'broken code');
    const forged=structuredClone(backup);forged.payload.tables.card_attempts[0].verified=1;forged.payload.tables.card_attempts[0].status='accepted';forged.checksum=checksum(forged.payload);
    await api.post('/api/restore').send({confirm:true,backup:forged}).expect(400);
  } finally {app.close();cleanup(f.dir)}
});

test('Generic cards are server graded, XP once; old v1 backups preserve legacy progress and reseed blank cards',async()=>{
  const f=fixture();const app=createApp(f.options);
  try {
    const api=request(app.app);
    await api.put('/api/code/caesar').send({code:'// legacy draft'}).expect(200);
    await api.post('/api/submissions').send({exerciseId:'legacy-ex',answer:'D'}).expect(200);
    const card={lessonId:'caesar',deck:'math',ordinal:99,kind:'calculation',title:'Addition',goal:'Add two numbers',difficulty:'rookie',xp:20,prompt:'4 + 3 = ?',samples:[{input:'2 + 3',expected:'5'}],starterCode:'',solution:'4+3=7',hints:['Count','Add','4+3'],sourceReferences:[],supplemental:true,theory:'Addition',formula:'a+b',examEligible:true,answer:'7',confirmed:true};
    const id=(await api.post('/api/cards').send(card).expect(201)).body.card.id;
    assert.equal((await api.get(`/api/cards/${id}`)).body.card.answer,undefined);
    const wrong=await api.post(`/api/cards/${id}/attempts`).send({mode:'match',kind:'answer',code:'',answer:'8'}).expect(200);
    assert.equal(wrong.body.status,'incorrect');assert.equal(wrong.body.solution,undefined);assert.equal(wrong.body.answer,undefined);assert.equal(wrong.body.xp,0);
    const right=await api.post(`/api/cards/${id}/attempts`).send({mode:'match',kind:'answer',code:'',answer:'7'}).expect(200);
    assert.equal(right.body.xp,20);assert.equal(right.body.verified,true);assert.equal(right.body.progress.completed,true);
    assert.equal((await api.post(`/api/cards/${id}/attempts`).send({mode:'exam',kind:'answer',code:'',answer:'7'})).body.xp,0);
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,45);
    const v2=(await api.get('/api/backup')).body;
    await api.post('/api/restore').send({confirm:true,backup:v2}).expect(200);
    const previous=structuredClone(v2);previous.payload.schemaVersion=2;for(const t of runnerTables)delete previous.payload.tables[t];previous.checksum=checksum(previous.payload);
    await api.post('/api/restore').send({confirm:true,backup:previous}).expect(200);
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,45);
    const old=structuredClone(v2);old.payload.schemaVersion=1;for(const t of [...cardTables,...runnerTables])delete old.payload.tables[t];old.checksum=checksum(old.payload);
    await api.post('/api/restore').send({confirm:true,backup:old}).expect(200);
    assert.equal((await api.get('/api/code/caesar')).body.code,'// legacy draft');assert.equal((await api.get('/api/bootstrap')).body.stats.xp,25);
    assert.equal((await api.get('/api/cards').query({lessonId:'caesar'})).body.cards.length,7);
  } finally {app.close();cleanup(f.dir)}
});

test('Migration 002 takes consistent snapshot of v1 database and preserves old rows',()=>{
  const f=fixture(),dbFile=path.join(f.dir,'academy.sqlite');
  const old=new DatabaseSync(dbFile);old.exec(fs.readFileSync('migrations/001_initial.sql','utf8'));
  old.prepare('INSERT INTO users VALUES (?,?)').run('local','Existing student');
  old.prepare('INSERT INTO courses VALUES (?,?,?)').run('custom','My course','Unchanged');
  old.prepare('INSERT INTO modules VALUES (?,?,?)').run('custom-mod','custom','Chapter');
  old.prepare('INSERT INTO lessons VALUES (?,?,?,?,?,?,?)').run('old-lesson','custom','custom-mod','Old lesson','Keep me','{}','[]');
  old.prepare('INSERT INTO progress VALUES (?,?,?)').run('local','old-lesson','KEEP THIS CODE');old.close();
  const app=createApp(f.options);
  try{
    assert.equal(app.db.prepare('SELECT code FROM progress WHERE lesson_id=?').get('old-lesson')?.code,'KEEP THIS CODE');
    assert.equal(app.db.prepare('SELECT name FROM users WHERE id=?').get('local')?.name,'Existing student');
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM card_completions').get()?.n,0);
    const files=fs.readdirSync(path.join(f.dir,'backups')).filter(p=>p.startsWith('before-code-first-'));assert.equal(files.length,1);
    const snapshot=new DatabaseSync(path.join(f.dir,'backups',files[0]),{readOnly:true});
    try{assert.equal(snapshot.prepare('SELECT code FROM progress WHERE lesson_id=?').get('old-lesson')?.code,'KEEP THIS CODE');assert.equal(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='challenge_cards'").get(),undefined)}finally{snapshot.close()}
  }finally{app.close();cleanup(f.dir)}
});

test('Published card catalog retains source IDs and Caesar sample outputs agree with independent reference calculation',()=>{
  const catalog=JSON.parse(fs.readFileSync('data/demo-catalog.json','utf8'));
  const definitions=buildCardCatalog(catalog.lessons.map((l:any)=>({id:l.id,summary:l.summary,content:JSON.stringify(l.content),source_references:JSON.stringify(l.sourceReferences)})));
  assert.equal(definitions.length,28);
  const sources=new Set(catalog.documents.flatMap((d:any)=>d.references.map((r:any)=>r.id)));
  for(const card of definitions){assert.equal(card.supplemental,true);assert.equal(card.sourceReferences.length,0);for(const id of card.sourceReferences)assert.ok(sources.has(id));}
  function cipher(s:string,k:number){return [...s].map(c=>{const i='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(c.toUpperCase());if(i<0)return c;const shift=((i+k)%26+26)%26;const base=c===c.toLowerCase()?97:65;return String.fromCharCode(base+shift)}).join('');}
  for(const card of definitions.filter(c=>c.lessonId==='caesar'))for(const sample of card.samples){
    let expected:string;
    if(card.id.endsWith('-character')){const [c,k]=sample.input.split(/\s+/);expected=cipher(c,Number(k));}
    else if(card.id.endsWith('-brute'))expected=Array.from({length:25},(_,i)=>`${i+1}: ${cipher(sample.input,-i-1)}`).join('\n');
    else{const [s,line]=sample.input.split('\n');const [key,mode]=line.split(' ');expected=cipher(s,Number(key)*(card.id.endsWith('-decrypt')||mode==='D'?-1:1));}
    assert.equal(sample.expected,expected,card.id);
  }
});
