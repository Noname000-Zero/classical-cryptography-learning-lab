// Trusted harness: compiler runs as WASM with a VFS. The result has only WASI
// stdio capabilities, never node:wasi, host preopens, native executables or JS.
import { commands } from '@yowasp/clang';
import { icpcHeader } from './icpc-compat.mjs';
import { WASI, File, OpenFile, ConsoleStdout } from '@bjorn3/browser_wasi_shim';
console.info=()=>{};console.log=()=>{};
const send=value=>{if(process.connected)process.send(value)};
const sendFinal=value=>new Promise(resolve=>{if(!process.connected){resolve();return}process.send(value,()=>resolve())});
process.once('message',async task=>{
  let phase='compile',stdout='',stderr='',used=0;
  const append=(channel,b)=>{
    if(!b)return;const part=b.subarray(0,Math.max(0,65536-used));used+=b.length;
    const text=new TextDecoder().decode(part);if(channel==='stdout')stdout+=text;else stderr+=text;
    if(part.length)send({type:'stream',channel,text});
    if(used>65536)throw Object.assign(new Error('Vượt giới hạn 64 KiB output.'),{outputLimit:true});
  };
  const start=performance.now();send({type:'phase',phase});
  try{
    const files=await commands['clang++'](['main.cpp','-std=gnu++17','-Icompat','-fno-exceptions','-O0','-Wall','-Wextra','-fno-color-diagnostics','-ferror-limit=10','-o','main.wasm','-Wl,--max-memory=67108864','-Wl,-z,stack-size=1048576'],{'main.cpp':task.code,'compat':{'bits':{'stdc++.h':icpcHeader}}},{decodeASCII:false,stdout:b=>append('stdout',b),stderr:b=>append('stderr',b),fetchProgress:()=>{}});
    const binary=files['main.wasm'];if(!(binary instanceof Uint8Array))throw Error('Compiler không tạo ra WebAssembly.');
    const compileMs=Math.round(performance.now()-start),compilerStderr=stderr;
    const module=await WebAssembly.compile(binary);
    for(const item of WebAssembly.Module.imports(module))if(item.kind!=='function'||item.module!=='wasi_snapshot_preview1')throw Error('Module yêu cầu import ngoài WASI cho phép.');
    const results=[];
    for(let i=0;i<task.inputs.length;i++){
      phase='run';stdout='';stderr='';used=0;send({type:'phase',phase,index:i,compileMs,compilerStderr});
      const wasi=new WASI(['main.wasm'],[],[new OpenFile(new File(new TextEncoder().encode(task.inputs[i]),{readonly:true})),new ConsoleStdout(b=>append('stdout',b)),new ConsoleStdout(b=>append('stderr',b))]);
      for(const key of Object.keys(wasi.wasiImport))if(key.startsWith('sock_'))wasi.wasiImport[key]=()=>58;
      const at=performance.now();let exitCode=0,status='success';
      try{const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});exitCode=wasi.start(instance);if(exitCode!==0)status='runtime_error';}
      catch(e){status=e.outputLimit?'output_limit':'runtime_error';stderr+=(stderr?'\n':'')+String(e.message||e).slice(0,1500);exitCode=1;}
      results.push({status,stdout,stderr,exitCode,timeMs:Math.round(performance.now()-at)});
      send({type:'case_result',index:i,result:results.at(-1)});
      if(status!=='success')break;
    }
    await sendFinal({type:'result',result:{status:results.find(r=>r.status!=='success')?.status||'success',compileMs,compilerStderr,results}});
  }catch(e){await sendFinal({type:'result',result:{status:e.outputLimit?'output_limit':phase==='compile'&&e.constructor?.name==='Exit'?'compile_error':'runner_error',compileMs:Math.round(performance.now()-start),compilerStderr:stderr||String(e.message||e),results:[]}})}
  finally{if(process.connected)process.disconnect();}
});
send({type:'ready'});
