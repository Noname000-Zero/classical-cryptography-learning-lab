import type { ChallengeCard } from '../card-catalog.js';
export type JudgeCase={input:string;expected:string;hidden:boolean};
const shift=(s:string,k:number)=>s.replace(/[A-Za-z]/g,c=>{const a=c>='a'?97:65;return String.fromCharCode(a+((c.charCodeAt(0)-a+k)%26+26)%26)});
const normalizeKey=(k:number)=>((k%26)+26)%26;
export const normalizeOutput=(s:string)=>s.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').replace(/\n+$/,'');

// Grading vectors are server-only, separate from samples. No student program or
// client-provided output is ever used as the oracle.
export function judgeCases(card:ChallengeCard):JudgeCase[]|null {
  const suffix=card.id.slice(`card-${card.lessonId}-`.length);let inputs:string[]=[],oracle:((s:string)=>string)|undefined;
  const published:Record<string,string[]>={caesar:['character','lowercase','mixed','decrypt','complete','brute','final'],affine:['inverse','encode','decode'],monoalphabetic:['key','encode','decode'],vigenere:['encode','decode'],vernam:['bit','bits'],'rail-fence':['split','encode'],columnar:['grid','key'],hill:['vector','pairs'],playfair:['key','pair','pairs'],feistel:['round','two']};
  if(!card.id.startsWith(`card-${card.lessonId}-`)||!published[card.lessonId]?.includes(suffix))return null;
  if(card.lessonId==='caesar'){
    if(suffix==='character'){inputs=['z 1','a 0','m 26','b -1000000','z 1000000'];oracle=s=>{const [c,k]=s.split(' ');return shift(c,Number(k))};}
    else if(suffix==='brute'){inputs=['AbZ!',''];oracle=s=>Array.from({length:25},(_,i)=>`${i+1}: ${shift(s,-i-1)}`).join('\n');}
    else if(['lowercase','mixed','decrypt','complete','final'].includes(suffix)){
      const full=['complete','final'].includes(suffix);
      const texts=suffix==='lowercase'?['','abcdefghijklmnopqrstuvwxyz','zzzz','abc']:['','aAzZ !09','ABCDEFGHIJKLMNOPQRSTUVWXYZ','Hello, world!'];
      inputs=texts.map((s,i)=>`${s}\n${[0,-1000000,1000000,52][i]}${full?(i%2?' D':' E'):''}`);
      oracle=s=>{const [line,key]=s.split('\n');const [k,m]=key.split(' ');return shift(line,normalizeKey(Number(k))*(suffix==='decrypt'||m==='D'?-1:1))};
    }
  }else if(card.lessonId==='affine'){
    if(suffix==='inverse'){inputs=['0','1','25','13','11'];oracle=s=>{for(let i=1;i<26;i++)if(Number(s)*i%26===1)return String(i);return 'INVALID'};}
    else if(['encode','decode'].includes(suffix)){inputs=['AZ\n1 25','HELLO\n25 0','ABC\n0 1','XYZ\n3 7'];oracle=s=>{const [text,key]=s.split('\n');const [a,b]=key.split(' ').map(Number);let inv=0;for(let i=1;i<26;i++)if(a*i%26===1)inv=i;if(!inv)return 'INVALID';return [...text].map(c=>String.fromCharCode(65+(suffix==='decode'?inv*((c.charCodeAt(0)-65-b+26)%26):(a*(c.charCodeAt(0)-65)+b))%26)).join('')};}
  }else if(card.lessonId==='monoalphabetic'){
    const key='QWERTYUIOPASDFGHJKLZXCVBNM';
    if(suffix==='key'){inputs=['ABCDEFGHIJKLMNOPQRSTUVWXYZ',key,'ABCDEFGHIJKLMNOPQRSTUVWXY','abcdefghijklmnopqrstuvwxyZ'];oracle=s=>[...s].sort().join('')==='ABCDEFGHIJKLMNOPQRSTUVWXYZ'?'VALID':'INVALID';}
    else if(['encode','decode'].includes(suffix)){inputs=[`A Z\n${key}`,'HELLO\nABCDEFGHIJKLMNOPQRSTUVWXYZ','ABC\nAAAAAAAAAAAAAAAAAAAAAAAAAA'];oracle=s=>{const [text,k]=s.split('\n');if([...k].sort().join('')!=='ABCDEFGHIJKLMNOPQRSTUVWXYZ')return 'INVALID';return text.replace(/[A-Z]/g,c=>suffix==='encode'?k[c.charCodeAt(0)-65]:String.fromCharCode(65+k.indexOf(c)))};}
  }else if(card.lessonId==='vigenere'){
    inputs=['ZZZZ BC','A Z','HELLOWORLD LONGKEY'];oracle=s=>{const [text,k]=s.split(' ');return [...text].map((c,i)=>shift(c,(k.charCodeAt(i%k.length)-65)*(suffix==='decode'?-1:1))).join('')};
  }else if(card.lessonId==='vernam'){
    if(suffix==='bit'){inputs=['0 0','0 1'];oracle=s=>String(s.split(' ').map(Number).reduce((a,b)=>a^b));}
    else if(suffix==='bits'){inputs=['0 1','11111111 11111111','10101010 01010101'];oracle=s=>{const [a,b]=s.split(' ');return [...a].map((c,i)=>String(Number(c)^Number(b[i]))).join('')};}
  }else if(card.lessonId==='rail-fence'){
    inputs=['A','AB','ABCDEFGH'];oracle=s=>{const a=[...s].filter((_,i)=>i%2===0).join(''),b=[...s].filter((_,i)=>i%2!==0).join('');return a+(suffix==='split'?'\n':'')+b};
  }else if(card.lessonId==='columnar'){
    inputs=suffix==='key'?['ZYXWVUTSR\n1 2 3','ABCDEFGHI\n2 3 1']:['ZYXWVUTSR','AAAAAAAAA'];oracle=s=>{const [text,key]=s.split('\n');return (key?key.split(' ').map(Number):[1,2,3]).flatMap(c=>[0,1,2].map(r=>text[r*3+c-1])).join('')};
  }else if(card.lessonId==='hill'){
    inputs=suffix==='vector'?['25 25','0 0','3 7']:['ZZAA','ABCDXYZW'];oracle=s=>{const nums=suffix==='vector'?s.split(' ').map(Number):[...s].map(c=>c.charCodeAt(0)-65),result:number[]=[];for(let i=0;i<nums.length;i+=2)result.push((3*nums[i]+3*nums[i+1])%26,(2*nums[i]+5*nums[i+1])%26);return suffix==='vector'?result.join(' '):result.map(n=>String.fromCharCode(65+n)).join('')};
  }else if(card.lessonId==='playfair'){
    const matrix=(s:string)=>[...new Set((s+'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replaceAll('J','I'))].join('');
    if(suffix==='key'){inputs=['JIG','AAAA','ABCDEFGHIJKLMNOPQRSTUVWXYZ'];oracle=matrix;}
    else{inputs=suffix==='pair'?['RM','CM','XZ','AB']:['HSARMU','ABCDEFGH'];oracle=s=>{const k=matrix('MONARCHY');let out='';for(let i=0;i<s.length;i+=2){const a=k.indexOf(s[i]),b=k.indexOf(s[i+1]);let r=Math.floor(a/5),c=a%5,u=Math.floor(b/5),v=b%5;if(r===u){c=(c+1)%5;v=(v+1)%5}else if(c===v){r=(r+1)%5;u=(u+1)%5}else [c,v]=[v,c];out+=k[r*5+c]+k[u*5+v]}return out};}
  }else if(card.lessonId==='feistel'){
    inputs=['0 0 0','255 255 255','128 64 240'];oracle=s=>{const nums=s.split(' ').map(Number),k=nums[2];let [l,r]=nums;for(let i=1;i<=(suffix==='two'?2:1);i++){const key=suffix==='two'?(k<<i)%256:k;[l,r]=[r,l^((r+key)%256)]}return `${l} ${r}`};
  }
  if(!oracle||!inputs.length)return null;
  return [...card.samples.map(s=>({...s,hidden:false})),...inputs.map(input=>({input,expected:oracle!(input),hidden:true}))];
}

export type Diagnostic={line:number;column:number;severity:'error'|'warning'|'note';message:string;explanation:string;origin:'compiler'|'logic-suspect'};
export function compilerDiagnostics(text:string):Diagnostic[]{
  return [...text.matchAll(/(?:^|\n)(?:\/?main\.cpp):(\d+):(\d+): (fatal error|error|warning|note): ([^\n]+)/g)].slice(0,40).map(m=>({line:Number(m[1]),column:Number(m[2]),severity:m[3]==='fatal error'?'error':m[3] as 'error'|'warning'|'note',message:m[4],origin:'compiler',explanation:m[4].includes("expected ';'")?'Compiler báo thiếu dấu chấm phẩy; kiểm tra dòng này và dòng ngay trước.':m[4].includes('undeclared identifier')?'Tên này chưa được khai báo hoặc bị gõ sai.':m[4].includes('file not found')?'Không tìm thấy thư viện trong toolchain WASI. Runner hỗ trợ C++17 tiêu chuẩn, không có thư viện riêng Windows.':m[4].includes('expected')?'Kiểm tra dấu ngoặc, toán tử và cú pháp quanh vị trí compiler cung cấp.':m[3]==='warning'?'Đây là cảnh báo, không tự xem là lỗi biên dịch.':'Thông báo thật từ compiler; đối chiếu tên, kiểu dữ liệu và cú pháp tại vị trí này.'}));
}
export function logicDiagnostics(card:ChallengeCard,code:string,wrong:boolean):Diagnostic[]{
  if(!wrong||card.lessonId!=='caesar')return [];
  return code.split('\n').flatMap((line,i)=>{
    const match=line.match(/\(\s*(\w+\s*\[[^\]]+\])\s*\+\s*\w+\s*\)\s*%\s*26/);
    return match?[{line:i+1,column:(match.index||0)+1,severity:'warning' as const,origin:'logic-suspect' as const,message:'Vị trí nghi vấn: modulo trực tiếp mã ký tự ASCII.',explanation:'Code đã chạy nhưng sai test. Biểu thức này có thể thiếu bước đưa chữ về 0–25 và cộng lại mốc a/A. Đây là gợi ý dựa trên biểu thức và kết quả test, không phải khẳng định chính xác dòng gây lỗi.'}]:[];
  }).slice(0,5);
}
