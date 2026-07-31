import { useEffect, useRef } from "react";
import StructuredMessage from './StructuredMessage';
import ChatComposer from './ChatComposer';
import SuggestedTasks from './SuggestedTasks';

export default function ConversationPanel({messages,chat,setChat,onSend,suggestedTasks,onStartTask}){
  const viewportRef = useRef(null);
  console.log('ConversationPanel', {messages, chat, suggestedTasks});

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, chat]);

  return <aside className="h-full flex flex-col bg-card border-r border-border">
    <div className="p-4 border-b border-border">
      <div className="text-sm font-medium text-foreground">OpenCommerceLens AI <span className="text-emerald-500">â—</span></div>
      <p className="text-[10px] text-muted-foreground">Your fashion copilot</p>
    </div>
    <div ref={viewportRef} className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">
      {messages.map(m => <StructuredMessage key={m.id} message={m} />)}
    </div>
    <SuggestedTasks tasks={suggestedTasks} onStart={onStartTask} />
    <ChatComposer value={chat} setValue={setChat} onSend={onSend} />
  </aside>
}
