import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import request from 'supertest';
import { WasmRunner, runnerLimits } from './runner/runner.js';
import { buildCardCatalog } from './card-catalog.js';
import { judgeCases, normalizeOutput, compilerDiagnostics, logicDiagnostics } from './runner/judge.js';
import { createApp } from './app.js';

const canRun=process.platform==='win32'&&process.arch==='x64';
test('ICPC compatibility uses real libc++ containers/algorithms and keeps compiler locations',{skip:!canRun,timeout:60000},async()=>{
  const runner=new WasmRunner();
  const code=`#include <bits/stdc++.h>
using namespace std;
int main(){
vector<int> v={3,1,2,2};sort(v.begin(),v.end());
map<int,int> m;set<int> s;for(int x:v){m[x]++;s.insert(x);}
queue<int> q;q.push(7);stack<int> st;st.push(8);priority_queue<int> pq;pq.push(9);
pair<int,int> p={4,5};unordered_map<int,int> um;um[1]=6;
cout<<accumulate(v.begin(),v.end(),0)<<' '<<m[2]<<' '<<s.size()<<' '<<q.front()<<' '<<st.top()<<' '<<pq.top()<<' '<<p.first+p.second<<' '<<um[1]<<' '<<binary_search(v.begin(),v.end(),3)<<'\\n';
cout<<__clang_version__<<'\\n'<<_LIBCPP_VERSION<<'\\n'<<__cplusplus;
}`;
  const r=await runner.run(code,['']);assert.equal(r.status,'success',r.compilerStderr);
  assert.match(r.results[0].stdout,/^8 2 3 7 8 9 9 6 1\n/);
  console.log('Verified toolchain:',r.results[0].stdout.split('\n').slice(1).join(' / '));
  const bad=await runner.run('#include <bits/stdc++.h>\nusing namespace std;\nint main(){ cout << missing; }',['']);
  assert.equal(bad.status,'compile_error');assert.equal(compilerDiagnostics(bad.compilerStderr)[0].line,3);
});
test('Real WASM compiler/runtime: diagnostics, warnings, empty input, timeout, memory, output, traps, cancellation and filesystem isolation',{skip:!canRun,timeout:120000},async()=>{
  const runner=new WasmRunner();assert.equal(runner.availability.available,true,runner.availability.reason);
  const good=await runner.run('#include <iostream>\nint main(){int unused;std::cout<<7;}', ['']);
  assert.equal(good.status,'success');assert.equal(good.results[0].stdout,'7');assert.ok(compilerDiagnostics(good.compilerStderr).some(d=>d.severity==='warning'));
  assert.ok(good.peakMemoryBytes!>0&&good.peakMemoryBytes!<=runnerLimits.processMemoryMB*1048576);
  const syntax=await runner.run('#include <iostream>\nint main(){std::cout<<1}', ['']);
  assert.equal(syntax.status,'compile_error');const diag=compilerDiagnostics(syntax.compilerStderr);assert.equal(diag[0].line,2);assert.ok(diag[0].column>0);assert.equal(diag[0].severity,'error');
  const empty=await runner.run('#include <iostream>\n#include <string>\nint main(){std::string s;std::getline(std::cin,s);std::cout<<s.size();}', ['']);assert.equal(empty.results[0].stdout,'0');
  const loop=await runner.run('int main(){volatile int i=0;while(true)i++;}', ['']);assert.equal(loop.status,'timeout');
  const memory=await runner.run('#include <vector>\nint main(){std::vector<char> v(1024*1024*1024);return v[0];}', ['']);assert.equal(memory.status,'runtime_error');
  const output=await runner.run('#include <cstdio>\nint main(){while(true)puts("012345678901234567890123456789012345678901234567890123456789");}', ['']);assert.equal(output.status,'output_limit');assert.ok(Buffer.byteLength(output.results[0].stdout)<=65536);
  const trap=await runner.run('int main(){__builtin_trap();}', ['']);assert.equal(trap.status,'runtime_error');
  const files=await runner.run('#include <fstream>\n#include <iostream>\n#include <string>\nint main(){std::string s;std::getline(std::cin,s);std::ifstream f(s);std::cout<<(f?"LEAK":"BLOCKED");}',[path.resolve('data/demo-catalog.json'),'/etc/passwd']);assert.equal(files.status,'success');assert.deepEqual(files.results.map(r=>r.stdout),['BLOCKED','BLOCKED']);
  const network=await runner.run('extern "C" __attribute__((import_module("env"),import_name("fetch"))) int fetch(); int main(){return fetch();}', ['']);assert.notEqual(network.status,'success');
  const controller=new AbortController();const active=runner.run('int main(){while(true){}}',[''],controller.signal,p=>{if(p==='run')controller.abort()});
  assert.throws(()=>runner.run('int main(){}',['']),/bận/);assert.equal((await active).status,'cancelled');
  const again=await runner.run('int main(){return 0;}',['']);assert.equal(again.status,'success');
});

test('All 28 published solutions compile and pass their independent normal/edge/hidden grading cases',{skip:!canRun,timeout:180000},async()=>{
  const catalog=JSON.parse(fs.readFileSync('data/demo-catalog.json','utf8'));
  const cards=buildCardCatalog(catalog.lessons.map((l:any)=>({id:l.id,summary:l.summary,content:JSON.stringify(l.content),source_references:JSON.stringify(l.sourceReferences)})));
  assert.equal(cards.length,28);const runner=new WasmRunner();
  for(const card of cards){
    const cases=judgeCases(card);assert.ok(cases?.some(c=>c.hidden),card.id);assert.ok(cases!.length>card.samples.length);
    const result=await runner.run(card.solution,cases!.map(c=>c.input));
    assert.equal(result.status,'success',`${card.id}: ${result.compilerStderr} ${result.results.map(r=>r.stderr)}`);
    assert.equal(result.results.length,cases!.length,card.id);
    for(const [i,r] of result.results.entries())assert.equal(normalizeOutput(r.stdout),normalizeOutput(cases![i].expected),`${card.id} test ${i+1}`);
  }
});

test('Real runner API: run does not grant XP, wrong logic suggests a suspect, submit passes hidden tests once, stop and restore work',{skip:!canRun,timeout:90000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'academy-runner-api-'));
  const app=createApp({dataDir:dir});const api=request(app.app);
  try{
    const cardId='card-caesar-character';const code='#include <bits/stdc++.h>\nint main(){char c;int k;std::cin>>c>>k;k=(k%26+26)%26;std::cout<<char(\'a\'+(c-\'a\'+k)%26);}';
    const poll=async(id:string)=>{for(let i=0;i<300;i++){const r=await api.get(`/api/runner/jobs/${id}`).expect(200);if(r.body.finished)return r.body;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Job did not finish')};
    const started=(await api.post(`/api/cards/${cardId}/execute`).send({mode:'training',action:'run',code,stdin:'x 3'}).expect(202)).body;
    await api.post(`/api/cards/${cardId}/execute`).send({mode:'training',action:'run',code,stdin:'a 3'}).expect(429);
    const ran=await poll(started.id);assert.equal(ran.status,'success');assert.equal(ran.results[0].stdout,'a');assert.equal(ran.xp,0);assert.equal(ran.progress.completed,false);
    const bad='#include <iostream>\n#include <string>\nint main(){std::string s;int k;std::getline(std::cin,s);std::cin>>k;for(int i=0;i<(int)s.size();i++)s[i]=(s[i]+k)%26;std::cout<<s;}';
    const wrongId=(await api.post('/api/cards/card-caesar-lowercase/execute').send({mode:'training',action:'submit',code:bad,stdin:''}).expect(202)).body.id;
    const wrong=await poll(wrongId);assert.equal(wrong.status,'wrong_answer');assert.equal(wrong.xp,0);assert.ok(wrong.results.some((r:any)=>!r.matched));assert.ok(wrong.diagnostics.some((d:any)=>d.origin==='logic-suspect'));
    for(const [i,mode] of ['training','match'].entries()){
      const id=(await api.post(`/api/cards/${cardId}/execute`).send({mode,action:'submit',code,stdin:''}).expect(202)).body.id;
      const result=await poll(id);assert.equal(result.status,'accepted');assert.equal(result.xp,i===0?20:0);assert.ok(result.results.some((r:any)=>r.hidden));
    }
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,20);
    assert.equal((await api.get(`/api/cards/${cardId}`)).body.card.progress.completed,true);
    const backup=(await api.get('/api/backup')).body;assert.equal(backup.payload.schemaVersion,3);
    await api.post('/api/restore').send({confirm:true,backup}).expect(200);
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,20);
    const loopId=(await api.post(`/api/cards/${cardId}/execute`).send({mode:'training',action:'run',code:'int main(){while(true){}}',stdin:''}).expect(202)).body.id;
    await api.post('/api/restore').send({confirm:true,backup}).expect(409);
    await api.post(`/api/runner/jobs/${loopId}/stop`).expect(200);assert.equal((await poll(loopId)).status,'cancelled');
    assert.equal((await api.get('/api/bootstrap')).body.stats.xp,20);
    await api.post(`/api/cards/${cardId}/execute`).send({mode:'training',action:'submit',code,stdin:'',verified:true,xp:999}).expect(400);
    const fake=logicDiagnostics({lessonId:'caesar'} as any,bad,true);assert.equal(fake[0].severity,'warning');assert.match(fake[0].explanation,/không phải khẳng định/);
  }finally{app.close();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));assert.match(path.basename(dir),/^academy-runner-api-/);fs.rmSync(dir,{recursive:true,force:true});}
});
