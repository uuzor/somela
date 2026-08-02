function formatMoney(amount, currency = "USD") {
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

export default function OrderSummary({ items = [], purchase = null, session = null }) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
  const shipping = 8;
  const tax = 5.4;
  const total = subtotal + shipping + tax;

  const approvalAmount = Number(purchase?.totalAmount ?? purchase?.total ?? 0);
  const approvalCurrency = purchase?.currency || session?.currency || "USD";
  const approvalMerchant = purchase?.merchantName || purchase?.merchant || session?.merchantName || "Current checkout";
  const approvalSessionId = session?.id || purchase?.sessionId || null;
  const approvalOrderId = session?.providerCheckoutId || purchase?.providerCheckoutId || null;
  const hasApproval = Boolean(purchase || session);

  return (
    <div>
      <h2 className="text-sm font-medium mb-3">Cart summary</h2>
      <dl className="text-xs text-muted-foreground space-y-2">
        <div className="flex justify-between">
          <dt>Items</dt>
          <dd>${subtotal.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Shipping</dt>
          <dd>${shipping.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Estimated tax</dt>
          <dd>${tax.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-3 text-foreground text-base font-medium">
          <dt>Cart total</dt>
          <dd>${total.toFixed(2)}</dd>
        </div>
      </dl>
      <p className="text-[10px] text-muted-foreground mt-2">3 merchant orders will be created</p>

      {hasApproval ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Active approval</p>
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-4">
              <span>Merchant</span>
              <span className="text-foreground text-right">{approvalMerchant}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Checkout amount</span>
              <span className="text-foreground text-right">{formatMoney(approvalAmount, approvalCurrency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Session ID</span>
              <span className="text-foreground text-right break-all">{approvalSessionId || "Pending"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Order ID</span>
              <span className="text-foreground text-right break-all">{approvalOrderId || "Pending"}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

