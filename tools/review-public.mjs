// Scan only indexed Git blobs. Never print candidate secret values.
import {execFileSync} from 'node:child_process';
const args=['-c',`safe.directory=${process.cwd()}`];
const git=(...a)=>execFileSync('git',[...args,...a],{maxBuffer:20*1024*1024});
const files=git('ls-files','-z').toString().split('\0').filter(Boolean),findings=[];
const patterns=[/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{30,}/,/sk-[A-Za-z0-9_-]{24,}/,/AKIA[A-Z0-9]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/[A-Z]:[\\/]Users[\\/][^\s"']+/i];
for(const file of files){
  if(/\.(?:pptx?|pdf|docx?|sqlite.*|db|pem|key|pfx|p12|zip)$/i.test(file)||/^(?:data\/(?:runtime\/|catalog\.json|INVENTORY\.md)|docs\/private\/|\.env(?:\.|$))/.test(file)&&file!=='.env.example')findings.push({file,reason:'Excluded data or document type'});
  if(/\.(?:png|jpe?g|gif|ico)$/.test(file))continue;
  const body=git('show',`:${file}`).toString();
  for(let i=0;i<patterns.length;i++)if(patterns[i].test(body))findings.push({file,reason:`Secret/private-path pattern ${i+1}`});
}
console.log(JSON.stringify({files:files.length,findings},null,2));
if(findings.length)process.exitCode=1;
