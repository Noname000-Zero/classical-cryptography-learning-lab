// Read-only, bounded OLE/CFB + MS-PPT text extraction. Never invokes Office/macros.
export function extractPpt(b) {
  if (!Buffer.isBuffer(b) || b.length < 512 || b.length > 20*1024*1024 || b.subarray(0,8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('Invalid or oversized OLE file');
  const shift=b.readUInt16LE(30), mshift=b.readUInt16LE(32);
  if (![9,12].includes(shift)||mshift!==6) throw new Error('Unsupported CFB sector format');
  const ss=1<<shift, ms=1<<mshift;
  const sec=i=>{if(!Number.isInteger(i)||i<0||(i+2)*ss>b.length)throw new Error('CFB sector outside file');return b.subarray((i+1)*ss,(i+2)*ss)};
  const dif=[];
  for(let i=0;i<109;i++){const v=b.readUInt32LE(76+4*i);if(v<0xfffffffa)dif.push(v)}
  let di=b.readUInt32LE(68);const seenDif=new Set();
  for(let n=0;n<b.readUInt32LE(72)&&di<0xfffffffa;n++){if(seenDif.has(di)||n>b.length/ss)throw new Error('CFB cycle');seenDif.add(di);const s=sec(di);for(let j=0;j<ss/4-1;j++){const v=s.readUInt32LE(j*4);if(v<0xfffffffa)dif.push(v)}di=s.readUInt32LE(ss-4)}
  const fat=[];for(const i of dif)for(let j=0;j<ss;j+=4)fat.push(sec(i).readUInt32LE(j));
  function chain(i,table=fat,mini=null){const a=[],seen=new Set();let size=0;while(i<0xfffffffa){if(!Number.isInteger(i)||seen.has(i)||seen.size>b.length/64)throw new Error('CFB invalid chain');seen.add(i);const s=mini?mini.subarray(i*ms,(i+1)*ms):sec(i);if(s.length!==(mini?ms:ss))throw new Error('CFB truncated chain');size+=s.length;if(size>b.length*2)throw new Error('CFB extraction limit');a.push(s);i=table[i]}return Buffer.concat(a)}
  const dir=chain(b.readUInt32LE(48)), entries=[];
  for(let i=0;i+128<=dir.length;i+=128){const d=dir.subarray(i,i+128),nl=d.readUInt16LE(64);if(nl>=2&&nl<=64)entries.push({name:d.subarray(0,nl-2).toString('utf16le'),type:d[66],start:d.readUInt32LE(116),size:d.readUInt32LE(120)})}
  const root=entries.find(e=>e.type===5),mini=root?chain(root.start):Buffer.alloc(0),mf=chain(b.readUInt32LE(60)),mt=[];
  for(let i=0;i<mf.length;i+=4)mt.push(mf.readUInt32LE(i));
  const entry=entries.find(e=>e.type===2&&e.name==='PowerPoint Document');if(!entry)throw new Error('No PowerPoint Document stream');
  const s=(entry.size<4096?chain(entry.start,mt,mini):chain(entry.start)).subarray(0,entry.size);
  const refs=[],lists=[];let recordCount=0;
  function scan(start,end,depth,slide=null,outline=false){let current=slide,ordinal=0;for(let p=start;p+8<=end;){if(++recordCount>200000)throw new Error('PPT record limit');const vi=s.readUInt16LE(p),t=s.readUInt16LE(p+2),n=s.readUInt32LE(p+4),e=p+8+n;if(e>end)throw new Error('PPT truncated record');if(outline&&t===1011)current=++ordinal;
      if(t===4000||t===4008){const text=s.subarray(p+8,e).toString(t===4000?'utf16le':'latin1').replace(/[\r\v]/g,'\n').trim();if(text)refs.push({slide:current,offset:p,location:`PowerPoint Document stream, byte ${p}, record ${t}`,text})}
      if((vi&15)===15&&depth<30){const isList=t===4080&&(vi>>4)===0;if(isList)lists.push(p);scan(p+8,e,depth+1,current,isList)}p=e}}
  scan(0,s.length,0);
  const references=refs.filter(r=>! /^(Click to edit|Bộ môn|(?:Nhập môn )?An toàn & bảo mật thông tin|\*+$)/.test(r.text));
  return {references,slideCount:Math.max(0,...references.map(r=>r.slide||0)),limitations:['Chỉ trích xuất văn bản; chưa kiểm tra hình ảnh, sơ đồ, đối tượng Equation/OLE và bố cục bảng.','Số slide chỉ có khi văn bản nằm trong SlideListWithText; các đối tượng khác trích dẫn bằng byte offset trong PowerPoint Document stream.','PPT có thể chứa bản ghi lịch sử; nội dung trích xuất cần người dùng duyệt trước khi công bố.'],outlineLists:lists.length};
}
