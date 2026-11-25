import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { tutorRouter,changedLines } from './tutor.js';

test('Tutor adapter: explicit consent, actual context, multi-turn, no secret/solution leakage, exam gate and provider failures',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE challenge_cards(id TEXT,definition TEXT); CREATE TABLE runner_executions(id TEXT,card_id TEXT,mode TEXT,user_id TEXT,ended_at TEXT,action TEXT,code TEXT,status TEXT,result TEXT)');
  db.prepare('INSERT INTO challenge_cards VALUES (?,?)').run('c',JSON.stringify({id:'c',title:'Caesar',prompt:'Encode',samples:[{input:'abc\n3',expected:'def'}],solution:'SECRET_SOLUTION',hiddenTests:'SECRET_TEST'}));
  let sent:Record<string,any>={},calls=0,breakProvider=false;
  const transport=(async(_url:unknown,init:RequestInit)=>{calls++;sent=JSON.parse(String(init.body));return new Response(breakProvider?'provider secret error':JSON.stringify({choices:[{message:{content:'Phản hồi giả lập của test, không phải AI thật.'}}]}),{status:breakProvider?401:200});}) as typeof fetch;
  function app(config={url:'https://example.invalid/v1/chat/completions',model:'test-model',key:'SECRET_KEY'}){const a=express();a.use(express.json());a.use(tutorRouter(db,config,transport));a.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||400).json({error:e.message}));return request(a);}
  const api=app(),body={code:'for(int i=0;i<3;i++);',question:'Tôi sai ở đâu?',mode:'training',support:'guided',consent:true};
  assert.equal((await api.get('/tutor/status')).body.configured,true);
  assert.ok(!JSON.stringify((await api.get('/tutor/status')).body).includes('SECRET_KEY'));
  await api.post('/cards/c/tutor').send({...body,consent:false}).expect(400);assert.equal(calls,0);
  await app({url:'',model:'',key:''}).post('/cards/c/tutor').send(body).expect(503);assert.equal(calls,0);
  await api.post('/cards/c/tutor').send(body).expect(200);assert.equal(calls,1);
  assert.equal(sent.max_completion_tokens,1200);assert.ok(!JSON.stringify(sent).includes('SECRET_'));
  const first=JSON.parse(sent.messages.at(-1).content);assert.equal(first.context.code,body.code);assert.equal(first.context.evidence,null);
  const revised='for(int i=0;i<3;i++){}';
  await api.post('/cards/c/tutor').send({...body,code:revised,previousCode:body.code,history:[{role:'user',content:'Câu trước'},{role:'assistant',content:'Hỏi về dấu ;'}],selection:{text:revised,line:1,endLine:1}}).expect(200);
  assert.equal(sent.messages[2].content,'Hỏi về dấu ;');assert.equal(JSON.parse(sent.messages.at(-1).content).context.changes[0].before,body.code);
  await api.post('/cards/c/tutor').send({...body,mode:'exam'}).expect(403);
  db.prepare('INSERT INTO runner_executions VALUES (?,?,?,?,?,?,?,?,?)').run('previous','c','exam','local','now','run','old code','success','{}');
  db.prepare('INSERT INTO runner_executions VALUES (?,?,?,?,?,?,?,?,?)').run('j','c','exam','local','now','submit',body.code,'wrong_answer',JSON.stringify({diagnostics:[],results:[{input:'abc',expected:'def',stdout:'abc',matched:false}]}));
  await api.post('/cards/c/tutor').send({...body,mode:'exam',jobId:'j'}).expect(200);
  assert.equal(JSON.parse(sent.messages.at(-1).content).context.evidence.results[0].stdout,'abc');
  assert.equal(JSON.parse(sent.messages.at(-1).content).context.evidence.changesSincePreviousRun[0].before,'old code');
  await api.post('/cards/c/tutor').send({...body,mode:'exam',code:'changed',jobId:'j'}).expect(403);
  breakProvider=true;const bad=await api.post('/cards/c/tutor').send(body).expect(502);assert.ok(!JSON.stringify(bad.body).includes('provider secret error'));
  db.close();
});

test('Tutor quota and input bounds do not silently truncate code or allow missing consent',async()=>{
  assert.deepEqual(changedLines('a\nb','a\nc'),[{line:2,before:'b',after:'c'}]);
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE challenge_cards(id TEXT,definition TEXT)');db.prepare('INSERT INTO challenge_cards VALUES (?,?)').run('c','{}');
  let calls=0;const api=express();api.use(express.json());api.use(tutorRouter(db,{url:'http://127.0.0.1:1234/v1/chat/completions',model:'mock',key:''},(async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'mock'}}]}));}) as typeof fetch));api.use((e:any,_r:any,s:any,_n:any)=>s.status(e.status||400).json({error:'rejected'}));
  const body={code:'x',question:'q',mode:'training',support:'solo',consent:true};
  await request(api).post('/cards/c/tutor').send({...body,code:'x'.repeat(30001)}).expect(400);
  for(let i=0;i<6;i++)await request(api).post('/cards/c/tutor').send(body).expect(200);
  await request(api).post('/cards/c/tutor').send(body).expect(429);assert.equal(calls,6);db.close();
});
