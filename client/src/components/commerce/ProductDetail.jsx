import { useMemo, useState } from "react";
import { ArrowLeft, Heart, Scale, Sparkles, ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";

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
  return Array.isArray(product.images) ? product.images.filter(Boolean) : [];
}

function getTitle(product) {
  return product?.name || product?.title || "Product";
}

function getMerchant(product) {
  return product?.merchantName || product?.merchant || product?.vendor || product?.shopId || "";
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

function getVariantOptions(product) {
  if (!product) return { colors: [], sizes: [] };

  const colors = new Set();
  const sizes = new Set();

  if (Array.isArray(product.options)) {
    for (const option of product.options) {
      const name = String(option?.name || "").toLowerCase();
      const values = Array.isArray(option?.values) ? option.values : [];
      if (name.includes("color") || name.includes("colour")) {
        values.forEach((value) => value && colors.add(String(value)));
      }
      if (name.includes("size")) {
        values.forEach((value) => value && sizes.add(String(value)));
      }
    }
  }

  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      if (variant?.color) colors.add(String(variant.color));
      if (variant?.size) sizes.add(String(variant.size));
    }
  }

  if (product.color) colors.add(String(product.color));
  if (product.size) sizes.add(String(product.size));

  return {
    colors: [...colors],
    sizes: [...sizes],
  };
}

export default function ProductDetail({ product, onBack, onMode, onTry }) {
  const images = useMemo(() => getImages(product), [product]);
  const [imageIndex, setImageIndex] = useState(0);
  const title = getTitle(product);
  const merchant = getMerchant(product);
  const price = getPrice(product);
  const compareAt = getCompareAt(product);
  const available = isAvailable(product);
  const sale = Boolean(product?.onSale || (compareAt != null && toNumber(compareAt) > toNumber(price)));
  const { colors, sizes } = useMemo(() => getVariantOptions(product), [product]);
  const image = images[imageIndex] || product?.primaryImage || product?.image || "";
  const priceLabel = formatMoney(price, product?.currency || "USD") || "View price";
  const compareLabel = compareAt != null ? formatMoney(compareAt, product?.currency || "USD") : null;
  const description = product?.description || product?.raw?.description || "";

  const prevImage = () => setImageIndex((current) => (current - 1 + images.length) % images.length);
  const nextImage = () => setImageIndex((current) => (current + 1) % images.length);

  return (
    <div className="p-6 overflow-y-auto h-full max-w-4xl mx-auto">
      <button onClick={onBack} type="button" className="control mb-5">
        <ArrowLeft size={15} />Back to results
      </button>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="relative">
          <img src={image} alt={title} className="w-full max-h-[65vh] object-cover rounded-[28px] shadow-elevated" />
          {images.length > 1 && (
            <>
              <button type="button" onClick={prevImage} className="absolute left-3 top-1/2 -translate-y-1/2 control">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={nextImage} className="absolute right-3 top-1/2 -translate-y-1/2 control">
                <ChevronRight size={15} />
              </button>
            </>
          )}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((src, index) => (
                <button key={`${src}-${index}`} type="button" onClick={() => setImageIndex(index)} className={`shrink-0 rounded-xl overflow-hidden border ${index === imageIndex ? "border-primary" : "border-transparent"}`}>
                  <img src={src} alt={`${title} ${index + 1}`} className="w-16 h-16 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-primary">{sale ? "On sale" : product?.match ?? "Selected item"}</p>
          <h1 className="text-3xl font-display mt-1">{title}</h1>
          <p className="text-muted-foreground mt-1">{merchant}</p>
          <div className="mt-4">
            <p className="text-xl font-medium">{priceLabel}</p>
            {compareLabel && compareLabel !== priceLabel && (
              <p className="text-sm text-muted-foreground line-through">{compareLabel}</p>
            )}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground mt-5">{description}</p>
          ) : (
            <p className="text-sm text-muted-foreground mt-5">A selected product with details and options surfaced from the catalog.</p>
          )}

          {colors.length > 0 && (
            <>
              <label className="label">Colour</label>
              <div className="flex flex-wrap gap-2">
                {colors.slice(0, 6).map((color) => (
                  <button key={color} type="button" className="swatch" title={color} aria-label={color} style={{ background: color }} />
                ))}
              </div>
            </>
          )}

          {sizes.length > 0 && (
            <>
              <label className="label">Size</label>
              <div className="flex gap-2 flex-wrap">
                {sizes.map((size) => (
                  <button key={size} type="button" className="icon-control">{size}</button>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-8">
            <button type="button" className="control">
              <Heart size={15} />Save
            </button>
            <button type="button" onClick={() => onMode("comparison")} className="control">
              <Scale size={15} />Compare
            </button>
            <button type="button" onClick={() => onTry?.(product)} className="primary" disabled={!available}>
              <Sparkles size={15} />Try on
            </button>
            <button type="button" onClick={() => onMode("checkout")} className="primary" disabled={!available}>
              <ShoppingBag size={15} />Buy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
