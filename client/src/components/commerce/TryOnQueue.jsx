import { AlertCircle, CheckCircle2, ImageUp, Loader2 } from "lucide-react";

function statusView(status) {
  if (status === "completed") return { label: "Ready", tone: "text-emerald-500", Icon: CheckCircle2 };
  if (status === "failed") return { label: "Failed", tone: "text-destructive", Icon: AlertCircle };
  if (status === "needs_selfie") return { label: "Selfie required", tone: "text-amber-500", Icon: ImageUp };
  return { label: "Generating", tone: "text-primary", Icon: Loader2, spin: true };
}

export default function TryOnQueue({ jobs = [], activeJobId, onSelect }) {
  const recent = jobs.filter((job) => job.id !== activeJobId);
  if (!recent.length) return null;

  return (
    <div className="border-t border-border pt-4 mt-4">
      <h3 className="text-xs mb-3">Recent looks</h3>
      <div className="space-y-2">
        {recent.slice(0, 8).map((job) => {
          const products = job.products?.length ? job.products : Array.isArray(job.product) ? job.product : [job.product].filter(Boolean);
          const product = products[0];
          const image = job.resultImageUrl || product?.image || product?.primaryImage || product?.images?.[0] || "";
          const title = products.length > 1 ? products.length + " piece outfit" : product?.name || product?.title || "Try-on";
          const view = statusView(job.status);
          const Icon = view.Icon;
          return (
            <button key={job.id} type="button" onClick={() => onSelect?.(job.id)} className="w-full flex gap-2 text-left rounded-xl p-1 hover:bg-muted">
              <img src={image} alt="" className="w-10 h-10 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="text-xs truncate">{title}</p>
                <p className={"text-[10px] " + view.tone}>
                  <Icon size={10} className={"inline mr-1 " + (view.spin ? "animate-spin" : "")} />
                  {view.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
