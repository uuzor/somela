import MerchantCheckoutGroup from "./MerchantCheckoutGroup";
import OrderSummary from "./OrderSummary";
import PravaApproval from "./PravaApproval";

export default function Checkout({
  items = [],
  setItems,
  purchase,
  onApprove,
  onBack,
  approvalSession,
  approvalLoading = false,
  approvalError = "",
  onOpenApproval,
  onRefreshStatus,
  onDismissApproval,
}) {
  const groups = items.reduce((acc, item) => {
    const key = item.merchant || item.merchantName || "Unknown merchant";
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {});

  return (
    <div className="p-5 h-full overflow-y-auto max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold">Review your order</h1>
      <p className="text-xs text-muted-foreground mb-4">
        {items.length} items from {Object.keys(groups).length} stores
      </p>
      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          {Object.entries(groups).map(([name, list]) => (
            <MerchantCheckoutGroup
              key={name}
              name={name}
              items={list}
              onRemove={(id) => setItems((current) => current.filter((item) => item.cartId !== id))}
              onEdit={() => {}}
            />
          ))}
        </div>
        <aside className="panel p-5 h-fit">
          <OrderSummary items={items} purchase={purchase} session={approvalSession} />
          <div className="mt-5 space-y-3">
            <PravaApproval
              purchase={purchase}
              session={approvalSession}
              isLoading={approvalLoading}
              error={approvalError}
              onApprove={onApprove}
              onOpenApproval={onOpenApproval}
              onRefreshStatus={onRefreshStatus}
              onDismiss={onDismissApproval || onBack}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
