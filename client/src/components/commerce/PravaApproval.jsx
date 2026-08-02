import { ExternalLink, Lock, RotateCcw, ShieldCheck } from "lucide-react";

function formatAmount(amount, currency = "USD") {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(Number.isInteger(value) ? 0 : 2)}`;
  }
}

export default function PravaApproval({
  purchase,
  session,
  isLoading = false,
  error = "",
  onApprove,
  onOpenApproval,
  onRefreshStatus,
  onDismiss,
}) {
  const activePurchase = purchase || session || {};
  const amount = Number(activePurchase?.totalAmount ?? activePurchase?.total ?? 0);
  const currency = activePurchase?.currency || session?.currency || "USD";
  const merchant = activePurchase?.merchantName || activePurchase?.merchant || "Prava checkout";
  const approvalUrl = session?.approvalUrl || activePurchase?.approvalUrl || null;
  const internalSessionId = session?.id || activePurchase?.id || null;
  const providerSessionId = session?.providerSessionId || activePurchase?.providerSessionId || null;
  const providerOrderId = session?.providerCheckoutId || activePurchase?.providerCheckoutId || null;

  return (
    <div className="border border-border rounded-[20px] p-4 bg-card shadow-card">
      <h3 className="text-sm font-medium flex gap-2">
        <ShieldCheck className="text-primary" size={16} />
        Prava approval
      </h3>
      <p className="text-[10px] text-muted-foreground mt-1">
        Authorize OpenCommerceLens to spend up to {formatAmount(amount, currency)} for {merchant}.
      </p>

      {[
        "No substitutions",
        "Stop if total changes",
        "Require merchant confirmation",
      ].map((item) => (
        <label key={item} className="flex gap-2 text-[10px] mt-3 items-center">
          <input type="checkbox" defaultChecked className="accent-primary w-3.5 h-3.5" />
          {item}
        </label>
      ))}

      <div className="text-[10px] border-t border-border mt-4 pt-4 space-y-2 text-muted-foreground">
        <p>Session ID: {internalSessionId || "Pending"}</p>
        <p>Prava session: {providerSessionId || "Pending"}</p>
        <p>Order ID: {providerOrderId || "Pending"}</p>
        <p className="break-all">{approvalUrl || "Approval will open in Prava"}</p>
        {error && <p className="text-destructive">{error}</p>}
      </div>

      <button onClick={onApprove} disabled={isLoading} className="primary w-full mt-4 disabled:opacity-60">
        <Lock size={14} />
        {isLoading ? "Preparing Prava session..." : `Approve ${formatAmount(amount, currency)} with Prava`}
      </button>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpenApproval}
          disabled={!approvalUrl}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <ExternalLink size={13} />
          Open approval
        </button>
        <button
          type="button"
          onClick={onRefreshStatus}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          <RotateCcw size={13} />
          Refresh
        </button>
      </div>

      <button onClick={onDismiss} className="w-full text-xs text-primary mt-3">
        Return to checkout
      </button>
    </div>
  );
}
