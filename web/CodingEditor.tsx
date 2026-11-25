import { createPortal } from 'react-dom';
import Editor, { loader } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// All editor code and workers are bundled locally; no CDN or external source upload.
self.MonacoEnvironment={getWorker:()=>new EditorWorker()};
loader.config({monaco});

export type EditorDiagnostic={line:number;column:number;severity:string;message:string;explanation?:string;origin?:string};
export type ExplanationLine={line:number;source:string};
export default function CodingEditor({value,onChange,readOnly,light,diagnostics=[],focusKey,onRun,onSubmit,focusPoint,explanationLine}:{value:string;onChange:(value:string)=>void;readOnly:boolean;light:boolean;diagnostics?:EditorDiagnostic[];focusKey?:string;onRun?:()=>void;onSubmit?:()=>void;focusPoint?:{line:number;column:number;seq:number};explanationLine?:ExplanationLine}){
  const editor=useRef<monaco.editor.IStandaloneCodeEditor|null>(null),callbacks=useRef({onRun,onSubmit});callbacks.current={onRun,onSubmit};
  const [ready,setReady]=useState(false); const [askMenu,setAskMenu]=useState<{x:number;y:number;text:string;line:number;endLine:number;source:string}>();
  useEffect(()=>{
    const instance=editor.current;if(!instance)return;
    const reading=explanationLine&&explanationLine.source===value?explanationLine:undefined;
    const decoration=instance.createDecorationsCollection(reading?[{range:new monaco.Range(reading.line,1,reading.line,1),options:{isWholeLine:true,className:'static-reading-line',linesDecorationsClassName:'static-reading-gutter',hoverMessage:{value:'Dòng đang đọc trong giải thích tĩnh — không phải vị trí thực thi/debug.'}}}]:[]);
    if(reading)instance.revealLineInCenterIfOutsideViewport(reading.line);
    return()=>decoration.clear();
  },[explanationLine,value,ready]);
  useEffect(()=>{const model=editor.current?.getModel();if(!model)return;monaco.editor.setModelMarkers(model,'academy-compiler',diagnostics.map(d=>({startLineNumber:d.line,startColumn:d.column,endLineNumber:d.line,endColumn:d.column+1,severity:d.severity==='error'?monaco.MarkerSeverity.Error:d.severity==='warning'?monaco.MarkerSeverity.Warning:monaco.MarkerSeverity.Info,message:d.message+(d.explanation?'\n'+d.explanation:''),source:d.origin==='logic-suspect'?'Vị trí nghi vấn (không khẳng định)':'Clang thực tế'})));const first=diagnostics.find(d=>d.severity==='error')||diagnostics[0];if(first)editor.current?.revealLineInCenter(first.line)},[diagnostics]);
  useEffect(()=>{editor.current?.focus()},[focusKey]);
  useEffect(()=>{if(focusPoint){editor.current?.setPosition({lineNumber:focusPoint.line,column:focusPoint.column});editor.current?.revealLineInCenter(focusPoint.line);editor.current?.focus()}},[focusPoint]);
  return <><Editor height="460px" language="cpp" value={value} onMount={instance=>{editor.current=instance;setReady(true);instance.focus();let lastSelected:monaco.Selection|null=null;instance.onDidChangeModelContent(()=>{lastSelected=null;setAskMenu(undefined)});instance.onDidChangeCursorSelection(e=>{if(!e.selection.isEmpty())lastSelected=e.selection});instance.onContextMenu(e=>{e.event.preventDefault();const model=instance.getModel(),live=instance.getSelection(),pos=instance.getPosition();if(!model||!pos)return;const range=live&&!live.isEmpty()?live:lastSelected||new monaco.Selection(pos.lineNumber,1,pos.lineNumber,model.getLineMaxColumn(pos.lineNumber));setAskMenu({x:Math.min(e.event.posx,window.innerWidth-270),y:Math.min(e.event.posy,window.innerHeight-60),source:model.getValue(),text:model.getValueInRange(range).slice(0,6000),line:range.startLineNumber,endLine:range.endLineNumber})});instance.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,()=>callbacks.current.onRun?.());instance.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.Enter,()=>callbacks.current.onSubmit?.())}} onChange={v=>onChange(v??'')} theme={light?'vs':'vs-dark'} loading={<p className="loading">Đang tải trình soạn thảo C++…</p>} options={{readOnly,contextmenu:false,minimap:{enabled:false},fontSize:14,fontFamily:'Consolas, monospace',lineNumbers:'on',tabSize:4,insertSpaces:true,automaticLayout:true,scrollBeyondLastLine:false,wordWrap:'on',accessibilitySupport:'on',ariaLabel:'Trình soạn thảo mã nguồn C++',padding:{top:15},fixedOverflowWidgets:true}}/>{askMenu&&createPortal(<div className="tutor-selection-menu" role="menu" style={{position:"fixed",zIndex:1000,left:askMenu.x,top:askMenu.y}}><button role="menuitem" onClick={()=>{window.dispatchEvent(new CustomEvent("academy:ask-selection",{detail:askMenu}));setAskMenu(undefined)}}>Hỏi gia sư về đoạn code này</button><button onClick={()=>setAskMenu(undefined)}>Đóng</button></div>,document.body)}</>;
}
