import { AlertCircle, CheckCircle2, ImageUp, Loader2 } from "lucide-react";

function statusView(status) {
  if (status === "completed") return { label: "Ready", tone: "text-emerald-500", Icon: CheckCircle2 };
  if (status === "failed") return { label: "Failed", tone: "text-destructive", Icon: AlertCircle };
  if (status === "needs_selfie") return { label: "Selfie required", tone: "text-amber-500", Icon: ImageUp };
  if (status === "selfie_processing") return { label: "Preparing selfie", tone: "text-primary", Icon: Loader2, spin: true };
  return { label: "Processing", tone: "text-primary", Icon: Loader2, spin: true };
}

export default function TryOnQueue({ jobs = [] }) {
  return (
    <div className="border-t border-border pt-4 mt-4">
      <h3 className="text-xs mb-3">Other try-ons</h3>
      {jobs.map((job) => {
        const product = Array.isArray(job.product) ? job.product[0] : job.product;
        const image = product?.image || product?.primaryImage || product?.images?.[0] || "";
        const title = product?.name || product?.title || "Try-on";
        const view = statusView(job.status);
        const Icon = view.Icon;
        return (
          <div key={job.id} className="flex gap-2 mb-2">
            <img src={job.resultImageUrl || image} alt={title} className="w-10 h-10 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-xs truncate">{title}</p>
              <p className={"text-[10px] " + view.tone}>
                <Icon size={10} className={"inline mr-1 " + (view.spin ? "animate-spin" : "")} />
                {view.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
