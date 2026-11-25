import koffi from 'koffi';
// OS resource limits augment the WASM/VFS capability boundary; a Job Object alone
// does not make native student executables safe.
export function createWindowsJob() {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Runner chỉ được xác minh trên Windows x64.');
  const kernel=koffi.load('kernel32.dll');
  const create=kernel.func('void * __stdcall CreateJobObjectW(void *, const char16_t *)');
  const configure=kernel.func('int __stdcall SetInformationJobObject(void *, int, const void *, uint32_t)');
  const assign=kernel.func('int __stdcall AssignProcessToJobObject(void *, void *)');
  const open=kernel.func('void * __stdcall OpenProcess(uint32_t, int, uint32_t)');
  const close=kernel.func('int __stdcall CloseHandle(void *)');
  const terminate=kernel.func('int __stdcall TerminateJobObject(void *, uint32_t)');
  const lastError=kernel.func('uint32_t __stdcall GetLastError()');
  const query=kernel.func('int __stdcall QueryInformationJobObject(void *, int, void *, uint32_t, void *)');
  let job=create(null,null);if(!job)throw Error(`Không tạo được Job Object: ${lastError()}`);
  const limits=Buffer.alloc(144);
  limits.writeBigInt64LE(15n*10000000n,0);
  limits.writeUInt32LE(0x2000|0x100|0x8|0x2,16);
  limits.writeUInt32LE(1,40);limits.writeBigUInt64LE(1536n*1024n*1024n,112);
  if(!configure(job,9,limits,144)){const code=lastError();close(job);throw Error(`Không áp được giới hạn tiến trình: ${code}`)}
  return {
    attach(pid:number){const p=open(0x1101,0,pid);if(!p)throw Error(`Không mở được worker: ${lastError()}`);try{if(!assign(job,p))throw Error(`Không gắn được Job Object: ${lastError()}`)}finally{close(p)}},
    peakBytes(){if(!job)return 0;const info=Buffer.alloc(144);return query(job,9,info,144,null)?Number(info.readBigUInt64LE(128)):0},
    terminate(){if(job)terminate(job,1)},
    close(){if(job){close(job);job=null}}
  };
}
