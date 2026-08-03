import { Layers3, Loader2, Scale, Sparkles, X } from "lucide-react";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return "$" + Number(value).toFixed(2);
  }
}

function productImage(product) {
  return product?.primaryImage || product?.image || product?.images?.[0] || "";
}

function productName(product) {
  return product?.name || product?.title || "Selected product";
}

function garmentSlot(product) {
  const text = [product?.category, product?.productType, productName(product)].filter(Boolean).join(" ").toLowerCase();
  if (/dress|gown|jumpsuit|romper/.test(text)) return "full";
  if (/pant|jean|trouser|skirt|short|bottom/.test(text)) return "lower";
  return "upper";
}

function compatibility(products) {
  const slots = products.map(garmentSlot);
  if (slots.filter((slot) => slot === "full").length > 1) return "Choose one full-body garment per look.";
  if (slots.includes("full") && slots.includes("lower")) return "A dress or jumpsuit cannot be layered with a lower-body garment.";
  return "";
}

export default function SelectedProductTray({
  product,
  products,
  activeTryOn,
  maxItems = 5,
  onRemove,
  onClear,
  onCompare,
  onTry,
  onView,
}) {
  const selected = (Array.isArray(products) && products.length ? products : product ? [product] : []).slice(0, maxItems);
  if (!selected.length) return null;

  const total = selected.reduce((sum, item) => sum + toNumber(item?.minPrice ?? item?.price), 0);
  const currency = selected[0]?.currency || "USD";
  const conflict = compatibility(selected);
  const busy = activeTryOn && !["completed", "failed"].includes(activeTryOn.status);
  const currentStep = activeTryOn?.currentStep || 0;
  const totalSteps = activeTryOn?.totalSteps || selected.length;

  return (
    <section className="m-4 mt-0 rounded-[20px] border border-border bg-card p-3 shadow-card" aria-label="Fitting dock">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex -space-x-3">
          {selected.map((item, index) => (
            <div key={item.id || item.raw?.productId || index} className="relative group">
              <button type="button" onClick={() => onView?.(item)} aria-label={"View " + productName(item)}>
                <img src={productImage(item)} alt="" className="w-12 h-12 rounded-xl object-cover border-2 border-card" />
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-foreground text-background grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={"Remove " + productName(item)}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Layers3 size={14} />{selected.length} of {maxItems} selected
          </p>
          <p className={"text-[10px] " + (conflict ? "text-destructive" : "text-muted-foreground")}>
            {busy ? `Applying garment ${Math.max(currentStep, 1)} of ${totalSteps}` : conflict || `${formatMoney(total, currency)} estimated total`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {selected.length > 1 && onClear && <button type="button" onClick={onClear} className="control">Clear</button>}
          <button type="button" onClick={() => onCompare?.(selected)} className="control">
            <Scale size={15} />Compare
          </button>
          <button type="button" onClick={() => onTry?.(selected)} className="primary" disabled={Boolean(conflict) || busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy ? "Generating" : selected.length > 1 ? "Try as outfit" : "Try on"}
          </button>
        </div>
      </div>
    </section>
  );
}
