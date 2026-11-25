import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createWindowsJob } from './windows-job.js';
export type RawRun={status:string;stdout:string;stderr:string;exitCode:number;timeMs:number};
export type RunnerResult={status:string;compileMs:number;compilerStderr:string;results:RawRun[];peakMemoryBytes?:number};
export const runnerLimits={processMemoryMB:1536,compilerWasmMB:512,programMemoryMB:64,cpuSeconds:15,compileTimeoutMs:25000,runTimeoutMs:2000,outputBytes:65536,concurrency:1};
export class WasmRunner {
  private busy=false;
  readonly availability:{available:boolean;provider:string;reason:string;limits:typeof runnerLimits};
  constructor(){
    let reason='Clang 22.1.6 · GNU++17 syntax · libc++ 220106/WASI · ICPC compatibility, not GNU G++ · Windows Job Object';let available=true;
    try{const job=createWindowsJob();job.close();if(!fs.existsSync(fileURLToPath(new URL('../../node_modules/@yowasp/clang/gen/llvm.core.wasm',import.meta.url))))throw Error('Thiếu compiler WASM; chạy npm.cmd install.');}catch(e){available=false;reason=(e as Error).message}
    this.availability={available,provider:'clang-wasm-windows-job',reason,limits:runnerLimits};
  }
  run(code:string,inputs:string[],signal?:AbortSignal,onPhase?:(phase:string,index:number)=>void):Promise<RunnerResult>{
    if(!this.availability.available)throw Object.assign(Error(this.availability.reason),{status:503});
    if(this.busy)throw Object.assign(Error('Runner đang bận. Chờ tác vụ hiện tại hoặc bấm Dừng.'),{status:429});
    if(signal?.aborted)return Promise.resolve({status:'cancelled',compileMs:0,compilerStderr:'',results:[]});
    this.busy=true;
    return new Promise(resolve=>{
      let job:ReturnType<typeof createWindowsJob>|undefined,done=false,timer:ReturnType<typeof setTimeout>,phase='compile',compileMs=0,compilerStderr='',stdout='',stderr='';
      const completed:RawRun[]=[];
      const worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));
      const modules=path.resolve(path.dirname(worker),'../../node_modules');
      const manifest=path.resolve(path.dirname(worker),'../../package.json');
      const compatibility=fileURLToPath(new URL('./icpc-compat.mjs',import.meta.url));
      const child=fork(worker,[],{execArgv:['--permission',`--allow-fs-read=${worker}`,`--allow-fs-read=${compatibility}`,`--allow-fs-read=${modules}`,`--allow-fs-read=${manifest}`,'--max-old-space-size=192','--wasm-max-mem-pages=8192','--wasm-max-code-space-size-mb=256'],env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',NODE_NO_WARNINGS:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,serialization:'advanced'});
      const finish=(result:RunnerResult)=>{
        if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        result.peakMemoryBytes=job?.peakBytes()||0;job?.terminate();job?.close();child.kill();this.busy=false;resolve(result);
      };
      const partial=(status:string,timeMs=0)=>phase==='run'?[...completed,{status,stdout,stderr,exitCode:1,timeMs}]:[];
      const cancel=()=>finish({status:'cancelled',compileMs,compilerStderr,results:partial('cancelled')});
      const watchdog=()=>{clearTimeout(timer);timer=setTimeout(()=>finish({status:'timeout',compileMs,compilerStderr,results:partial('timeout',2000)}),phase==='compile'?25000:2000)};
      signal?.addEventListener('abort',cancel,{once:true});watchdog();
      let internalError='';child.stderr?.on('data',data=>{internalError=(internalError+data.toString()).slice(-4000)});child.stdout?.resume();
      child.on('message',(message:any)=>{
        if(done)return;
        if(message.type==='ready'){
          try{job=createWindowsJob();job.attach(child.pid!);child.send({code,inputs});}catch(e){finish({status:'runner_error',compileMs:0,compilerStderr:(e as Error).message,results:[]})}
        }else if(message.type==='phase'){
          phase=message.phase;compileMs=message.compileMs||0;compilerStderr=message.compilerStderr||'';stdout='';stderr='';watchdog();onPhase?.(phase,message.index||0);
        }else if(message.type==='stream'){
          if(message.channel==='stdout')stdout=(stdout+message.text).slice(0,65536);else stderr=(stderr+message.text).slice(0,65536);
        }else if(message.type==='case_result')completed[message.index]=message.result;
        else if(message.type==='result')finish(message.result);
      });
      child.on('error',e=>finish({status:'runner_error',compileMs,compilerStderr:e.message,results:[]}));
      child.on('exit',(code,signal)=>{if(!done)finish({status:'resource_limit',compileMs,compilerStderr:compilerStderr||internalError||`Worker thoát trước khi gửi kết quả (exit=${code}, signal=${signal}); có thể do giới hạn CPU/RAM.`,results:partial('resource_limit')})});
    });
  }
}
