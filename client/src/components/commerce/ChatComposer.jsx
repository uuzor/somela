import { Plus, PanelTop, ChevronDown, Mic, ArrowUp } from "lucide-react";
import { useState } from "react";
export default function ChatComposer({ value, setValue, onSend }) {
  const [plan, setPlan] = useState(false);
  return (
    <div className="p-3 border-t border-border bg-card">
      <div className="rounded-xl border border-border bg-card p-2 shadow-card">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Message Agent..."
          className="w-full bg-transparent outline-none text-[13px] text-foreground px-1 py-1 placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            className="text-muted-foreground hover:text-foreground"
            aria-label="Add"
          >
            <Plus size={16} />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground"
            aria-label="Attach"
          >
            <PanelTop size={16} />
          </button>
          <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            Economy
            <ChevronDown size={11} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPlan(!plan)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className={`w-3.5 h-3.5 rounded-full border border-border transition ${plan ? "bg-primary border-primary" : ""}`}
              />
              Plan
            </button>
            <button
              className="text-muted-foreground hover:text-foreground"
              aria-label="Voice"
            >
              <Mic size={15} />
            </button>
            <button
              onClick={onSend}
              disabled={!value}
              className="w-7 h-7 rounded-md bg-primary text-white grid place-items-center disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
