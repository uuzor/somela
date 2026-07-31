import { Upload, ShoppingBag, Search, UserRound } from 'lucide-react';
import DiscoverComposer from './DiscoverComposer';
import MarkdownMessage from './MarkdownMessage';
import { IMG } from '@/data/commerceData';

const chips = [
  'Find this jacket under $120',
  'Build an outfit for a dinner',
  'Same shoes, but waterproof',
  'Show black dresses in size M',
];

function Bubble({ message }) {
  const isUser = message.role === 'user';
  const text = typeof message.text === 'string' ? message.text : '';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[min(42rem,85%)] font-medium rounded-[28px] px-4 py-3  ${
          isUser
            ? '  text-black '
            : 'bg-card border border-black/10 '
        }`}
      >
        {text && <MarkdownMessage>{text}</MarkdownMessage>}

        {message.image && (
          <img
            src={message.image}
            alt="Reference upload"
            className="mt-3 w-fit max-h-32 object-cover rounded-[16px]"
          />
        )}

        {Array.isArray(message.products) && message.products.length > 0 && (
          <div className="mt-3 grid gap-2">
            {message.products.slice(0, 3).map((product) => (
              <div key={product.id || product.name || product.title} className="rounded-2xl border border-black/10 bg-background/70 px-3 py-2 text-xs">
                <div className="font-medium">{product.title || product.name || 'Suggested product'}</div>
                {product.price != null && <div className="text-muted-foreground">${product.price}</div>}
              </div>
            ))}
          </div>
        )}

        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <details className={`mt-3 rounded-2xl border px-3 py-2 text-xs ${isUser ? 'border-white/20 bg-white/10' : 'border-black/10 bg-muted/40'}`}>
            <summary className="cursor-pointer select-none font-medium">Show tool activity</summary>
            <div className="mt-2 space-y-2">
              {message.toolCalls.map((toolCall) => (
                <div key={toolCall.id || toolCall.label} className="rounded-xl bg-background/70 px-3 py-2">
                  <div className="font-medium">{toolCall.label || 'Tool call'}</div>
                  {Array.isArray(toolCall.logs) && toolCall.logs.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                      {toolCall.logs.map((log, index) => (
                        <li key={`${toolCall.id || toolCall.label}-${index}`}>{log}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default function Discover(props) {
  const started = Boolean(props.conversationStarted || props.isStreaming || (props.messages?.length || 0) > 1);
  const messages = props.messages || [];

  return (
    <main className={`flex-1 flex flex-col overflow-hidden px-5 ${started ? 'py-4 md:py-6' : 'py-12 md:py-20'}`}>
      <section className={`mx-auto h-full flex flex-col flex-1 min-h-0 max-w-5xl ${started ? 'flex flex-col' : ''}`}>
        {!started ? (
          <>
            <div className="text-center mb-8">
              <h1 className="font-display text-4xl md:text-5xl mb-3">What are you looking for?</h1>
              <p className="text-sm text-muted-foreground">
                Describe it, upload it, or show us a look. We'll find products you can try on and buy.
              </p>
            </div>

            <DiscoverComposer
              value={props.chat}
              onChange={props.setChat}
              onSubmit={(text, imageUrl) => props.onSend?.(text, imageUrl)}
              placeholder="Ask for styles, products, or an outfit idea"
              footerNote
              disabled={props.isStreaming}
            />

            <div className="flex gap-2 justify-center flex-wrap mt-8">
              {chips.map((x) => (
                <button key={x} onClick={() => props.setChat?.(x)} className="chip" type="button">
                  {x}
                </button>
              ))}
            </div>

            <h2 className="mt-16 mb-4 text-xl font-semibold">Start with inspiration</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                [Upload, 'Upload a look'],
                [ShoppingBag, 'Shop a complete outfit'],
                [Search, 'Find similar products'],
                [UserRound, 'Try on saved items'],
              ].map(([Icon, text], i) => (
                <button key={text} type="button" className="group relative h-36 md:h-48 overflow-hidden rounded-[28px] text-left shadow-card">
                  <img src={IMG[i]} alt="Fashion inspiration" className="w-full h-full object-cover transition group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 flex gap-2 text-sm text-white">
                    <Icon size={17} />
                    {text}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 h-full md:min-w-[730px] min-h-0 flex-col rounded-[32px]  overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5 md:py-6 overscroll-y-none scrollbar-hide" style={{scrollbarWidth: 0}}>
              <div className="space-y-4 overflow-auto min-h-0  scrollbar-hide" style={{scrollbarWidth: 0, scrollBehavior: 'smooth', scrollbarColor: 'transparent'}}>
                {messages.map((message) => (
                  <Bubble key={message.id} message={message} />
                ))}
                {props.isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[min(42rem,85%)] rounded-[28px] rounded-bl-lg border border-black/10 bg-card px-4 py-3 shadow-card text-sm text-muted-foreground">
                      Typing...
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className=" px-4 md:px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
              <DiscoverComposer
                value={props.chat}
                onChange={props.setChat}
                onSubmit={(text, imageUrl) => props.onSend?.(text, imageUrl)}
                placeholder="Continue the conversation"
                footerNote={false}
                disabled={props.isStreaming}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
