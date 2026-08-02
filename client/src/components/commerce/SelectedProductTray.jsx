import { Scale, Sparkles } from "lucide-react";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value, currency = "USD") {
  const amount = toNumber(value);
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}`;
  }
}

function getImage(product) {
  if (!product) return "";
  return product.primaryImage || product.image || (Array.isArray(product.images) ? product.images[0] : "") || "";
}

function getName(product) {
  return product?.name || product?.title || "Selected product";
}

function getMeta(product) {
  return [product?.color, product?.size].filter(Boolean).join(" · ");
}

function getPrice(product) {
  return product?.displayPrice || product?.price || product?.minPrice || null;
}

function getCompareAt(product) {
  return product?.compareAtPriceMin ?? product?.compareAtPrice ?? null;
}

function isAvailable(product) {
  if (!product) return false;
  if (typeof product.available === "boolean") return product.available;
  const status = String(product.status || "").toLowerCase();
  return status === "available" || status === "active";
}

export default function SelectedProductTray({ product, onCompare, onTry, onView }) {
  if (!product) return null;

  const image = getImage(product);
  const name = getName(product);
  const meta = getMeta(product);
  const price = getPrice(product);
  const compareAt = getCompareAt(product);
  const priceLabel = formatMoney(price, product?.currency || "USD") || "View price";
  const compareLabel = compareAt != null ? formatMoney(compareAt, product?.currency || "USD") : null;
  const sale = Boolean(product?.onSale || (compareAt != null && toNumber(compareAt) > toNumber(price)));

  return (
    <div className="m-4 mt-0 rounded-[20px] border border-border bg-card p-2 flex items-center gap-3 shadow-card">
      <button onClick={onView} type="button">
        <img src={image} alt="View selected product" className="w-12 h-12 rounded-xl object-cover" />
      </button>
      <button onClick={onView} type="button" className="min-w-0 text-left">
        <p className="text-xs font-medium truncate tracking-tight-xs">
          {name}{meta ? ` · ${meta}` : ""} · {priceLabel}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {product?.merchantName || product?.merchant || product?.vendor || product?.shopId || "View details and options"}
          {sale && compareLabel ? ` · ${compareLabel} before sale` : ""}
        </p>
      </button>
      <button onClick={onCompare} type="button" className="control ml-auto">
        <Scale size={15} />Compare
      </button>
      <button onClick={onTry} type="button" className="primary" disabled={!isAvailable(product)}>
        <Sparkles size={15} />Try on selected
      </button>
    </div>
  );
}
