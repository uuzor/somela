import { Terminal, Brain, FileText, MoreVertical, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
const icons=[Terminal,Brain,FileText,MoreVertical];
export default function ToolCallBlock({toolCall}){const [open,setOpen]=useState(false);const row=icons.slice(0,toolCall.iconCount||3);return <div className="rounded-xl bg-muted border border-border overflow-hidden mt-2">
  <button onClick={()=>setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 transition">
    <div className="flex gap-1.5">{row.map((Icon,i)=><Icon key={i} size={13} className="text-muted-foreground"/>)}</div>
    <span className="text-[11px] text-foreground">{toolCall.label}</span>
    <span className="text-[10px] text-muted-foreground ml-auto">{toolCall.actions} actions</span>
    <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open?'rotate-180':''}`}/>
  </button>
  {open&&toolCall.logs&&<div className="px-3 pb-3 pt-2 space-y-1.5 font-mono text-[10px] text-muted-foreground border-t border-border">{toolCall.logs.map((log,i)=><div key={i} className="flex gap-1.5"><CheckCircle2 size={11} className="text-emerald-500 mt-0.5 shrink-0"/>{log}</div>)}</div>}
</div>}