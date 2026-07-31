import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap text-[13px] leading-relaxed text-inherit">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-inherit">{children}</strong>,
  em: ({ children }) => <em className="italic text-inherit">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-current/35 bg-current/8 px-4 py-3 text-[13px] leading-relaxed text-inherit rounded-r-2xl">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 text-[13px] leading-relaxed text-inherit">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 text-[13px] leading-relaxed text-inherit">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-current underline decoration-current/40 underline-offset-4"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-semibold tracking-tight text-inherit">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold tracking-tight text-inherit">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-base font-semibold tracking-tight text-inherit">{children}</h3>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-2xl border border-black/10 bg-background text-foreground">
      <table className="min-w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60 text-muted-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-black/5">{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-black/5 last:border-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-foreground">{children}</td>,
  code: ({ inline, children }) =>
    inline ? (
      <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[12px] text-inherit">{children}</code>
    ) : (
      <code className="block overflow-x-auto rounded-2xl bg-black/5 px-4 py-3 font-mono text-[12px] leading-relaxed text-inherit">
        {children}
      </code>
    ),
  pre: ({ children }) => <pre className="my-3 overflow-hidden rounded-2xl bg-black/5">{children}</pre>,
  hr: () => <hr className="my-4 border-black/10" />,
};

export default function MarkdownMessage({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
