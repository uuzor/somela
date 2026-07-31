import { Lightbulb, X, Check } from "lucide-react";
import { useState } from "react";
export default function SuggestedTasks({ tasks, onStart }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !tasks?.length) return null;
  return (
    <div className="mx-3 mb-2 rounded-xl bg-muted border border-border p-3">
      <div className="flex  items-center gap-2 mb-2">
        <Lightbulb size={14} className="text-foreground" />
        <span className="text-[11px] text-foreground font-medium">
          Suggested next tasks
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      
      <div className="space-y-1.5 flex">
        {tasks.map((t, i) => (
          <div
            key={i}
            onClick={() => onStart(i)}
            className="flex items-center gap-2 rounded-full bg-card border border-border p-2"
          >
            <span className="text-[11px] text-foreground flex-1">{t}</span>
            <Check size={14} className="text-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}
