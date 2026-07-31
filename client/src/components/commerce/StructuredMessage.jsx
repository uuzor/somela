import { Sparkles } from 'lucide-react';
import ToolCallBlock from './ToolCallBlock';
import { useMemo } from 'react';
import MarkdownMessage from './MarkdownMessage';

export default function StructuredMessage({message}){
  const user = message.role === 'user';
  const toolCalls = useMemo(() => message.toolCalls || [], [message.toolCalls]);
  // console.log('StructuredMessage', {message, user, toolCalls});

  if (message.products?.length > 0 ) {

    console.log(message.products);
  }

  return <article className="flex gap-2">
    <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full grid place-items-center text-[10px] font-medium ${user?'bg-foreground text-card':'bg-primary text-white'}`}>
      {user?'A':<Sparkles size={12}/>} 
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-medium mb-1 text-muted-foreground">{user?'You':'OpenCommerceLens AI'}</div>
      {message.image&&<img src={message.image} alt="Uploaded reference" className="w-28 h-24 object-cover rounded-lg mb-2" />}
      {message.text&&<MarkdownMessage>{message.text}</MarkdownMessage>}
      {toolCalls.map(tc => <ToolCallBlock key={tc.id} toolCall={tc} />)}
      {message.products &&<div className="flex gap-2 mt-2">{message.products.slice(0,3).map(p=><div key={p.id} className="w-20"><img src={p.images[0]} alt={p.name} className="h-16 w-full object-cover rounded-lg"/><p className="truncate text-[10px] mt-1 text-muted-foreground">{p.name}</p></div>)}</div>}
    </div>
  </article>
}
