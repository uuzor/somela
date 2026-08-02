import { useEffect, useState } from "react";
import { Heart, Sparkles, Check, ShoppingBag } from "lucide-react";

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

function getImages(product) {
  if (!product) return [];
  if (Array.isArray(product.images)) return product.images.filter(Boolean);
  return [];
}

function getCardTitle(product) {
  return product?.title || product?.name || "Untitled product";
}

function getCardPrice(product) {
  return product?.minPrice ?? product?.price ?? product?.displayPrice ?? null;
}

function getCompareAtPrice(product) {
  return product?.compareAtPriceMin ?? product?.raw?.compareAtPriceMin ?? product?.compareAtPrice ?? product?.raw?.compareAtPrice ?? null;
}

function getMerchant(product) {
  return product?.vendor || product?.merchantName || product?.merchant || product?.shopName || "";
}

function isAvailable(product) {
  if (!product) return false;
  if (typeof product.available === "boolean") return product.available;
  const status = String(product.status || product.raw?.status || "").toLowerCase();
  return status === "available" || status === "active";
}

export default function ProductCard({ product, selected, saved = false, inCart = false, onSelect, onTry, onAddToCart, onToggleSaved, loading = false }) {
  const images = getImages(product);
  const [imageIndex, setImageIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    setImageIndex(0);
  }, [product?.id, product?.productId]);

  useEffect(() => {
    if (!hovering || images.length <= 1) return undefined;

    const timer = setInterval(() => {
      setImageIndex((current) => (current + 1) % images.length);
    }, 1200);

    return () => clearInterval(timer);
  }, [hovering, images.length]);

  const currentImage = images[imageIndex] || product?.primaryImage || product?.image || "";
  const currentTitle = getCardTitle(product);
  const currentPrice = getCardPrice(product);
  const compareAtPrice = getCompareAtPrice(product);
  const merchant = getMerchant(product);
  const available = isAvailable(product);
  const onSale = Boolean(
    product?.onSale ||
      (compareAtPrice != null && toNumber(compareAtPrice) != null && toNumber(currentPrice) != null && toNumber(compareAtPrice) > toNumber(currentPrice))
  );
  const priceLabel = formatMoney(currentPrice, product?.currency || "USD") || "View price";
  const compareLabel = compareAtPrice != null ? formatMoney(compareAtPrice, product?.currency || "USD") : null;

  return (
    <article className={`group rounded-[16px] overflow-hidden bg-card transition ${selected ? "ring-0 ring-primary" : "shadow-elevated"}`}>
      <div className="relative p-2">
        <button
          onClick={onSelect}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => {
            setHovering(false);
            setImageIndex(0);
          }}
          disabled={loading || !product}
          className="relative block w-full text-left"
          type="button"
        >
          {loading ? (
            <div className="w-full aspect-[3/4] object-cover rounded-[20px] bg-muted animate-pulse" />
          ) : (
            <>
              <img src={currentImage} alt={currentTitle} className="w-full aspect-[4/2] object-cover perspective-origin-top-left rounded-[20px]" />
              <div className="absolute left-4 bottom-4 flex items-center gap-2 flex-wrap">
                <span className="badge">{product?.category || product?.productType || product?.tag || "Product"}</span>
                {onSale && <span className="badge bg-primary text-primary-foreground">Sale</span>}
              </div>
              {selected && (
                <span className="absolute top-4 left-4 bg-primary rounded-full p-1">
                  <Check size={14} />
                </span>
              )}
            </>
          )}
        </button>
        {!loading && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleSaved?.(product);
              }}
              aria-label={saved ? "Remove from saved items" : "Save product"}
              className={`rounded-full border border-border bg-background/80 p-1.5 shadow-sm transition hover:bg-background ${saved ? "text-primary" : "text-foreground"}`}
            >
              <Heart size={16} fill={saved ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddToCart?.(product);
              }}
              aria-label={inCart ? "In cart" : "Add to cart"}
              className={`rounded-full border border-border bg-background/80 p-1.5 shadow-sm transition hover:bg-background ${inCart ? "text-primary" : "text-foreground"}`}
            >
              <ShoppingBag size={16} fill={inCart ? "currentColor" : "none"} />
            </button>
          </div>
        )}
      </div>
      <div className="px-3 pb-3">
        {loading ? (
          <>
            <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
            <div className="mt-2 h-2 w-1/2 rounded bg-muted animate-pulse" />
            <div className="flex mt-2 text-xs items-center">
              <span className="h-3 w-12 rounded bg-muted animate-pulse" />
              <span className="ml-auto h-3 w-14 rounded bg-muted animate-pulse" />
            </div>
          </>
        ) : (
          <>
            <h3 className="text-xs font-medium truncate tracking-tight-xs">{currentTitle}</h3>
            <p className="text-[10px] text-muted-foreground">{merchant}</p>
            <div className="flex mt-1.5 text-xs items-center gap-2">
              <div className="flex flex-col leading-tight">
                <span className="font-medium">{priceLabel}</span>
                {compareLabel && compareLabel !== priceLabel && (
                  <span className="text-[10px] text-muted-foreground line-through">{compareLabel}</span>
                )}
              </div>
              <button onClick={onTry} disabled={!available} className="ml-auto text-primary flex gap-1 disabled:text-muted-foreground" type="button">
                <Sparkles size={12} />Try on
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
