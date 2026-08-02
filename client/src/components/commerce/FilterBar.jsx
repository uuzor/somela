import { useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";

const SORT_OPTIONS = ["best_match", "price_low", "price_high", "newest"];
const SORT_LABELS = {
  best_match: "Best match",
  price_low: "Price: Low to high",
  price_high: "Price: High to low",
  newest: "Newest",
};

const MAX_CHIPS = 4;

function getSortLabel(sort) {
  return SORT_LABELS[sort] || SORT_LABELS.best_match;
}

function getTopValues(items, extractor) {
  const counts = new Map();
  for (const item of items) {
    const value = extractor(item);
    if (!value) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS).map(([value]) => value);
}

function getPrimaryColor(product) {
  return product?.color || product?.variants?.find((variant) => variant?.color)?.color || null;
}

export default function FilterBar({
  filters = {},
  products = [],
  onToggleFilter,
  onClearFilters,
  onCycleSort,
}) {
  const sort = SORT_OPTIONS.includes(filters.sort) ? filters.sort : "best_match";
  const colors = useMemo(() => getTopValues(products, (product) => getPrimaryColor(product)), [products]);
  const sizes = useMemo(() => getTopValues(products, (product) => product?.size || product?.variants?.find((variant) => variant?.size)?.size), [products]);
  const activeColors = Array.isArray(filters.colors) ? filters.colors : [];
  const activeSizes = Array.isArray(filters.sizes) ? filters.sizes : [];
  const maxPrice = filters.maxPrice ?? null;
  const shipToNigeria = Boolean(filters.shipToNigeria);
  console.log(products)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {colors.map((color) => {
        const active = activeColors.includes(color);
        return (
          <button
            key={`color:${color}`}
            type="button"
            className={`chip ${active ? "border-primary text-primary" : ""}`}
            onClick={() => onToggleFilter?.("color", color)}
          >
            {color.charAt(0).toUpperCase() + color.slice(1)}
            <X size={12} />
          </button>
        );
      })}
      {sizes.map((size) => {
        const active = activeSizes.includes(size);
        return (
          <button
            key={`size:${size}`}
            type="button"
            className={`chip ${active ? "border-primary text-primary" : ""}`}
            onClick={() => onToggleFilter?.("size", size)}
          >
            Size {size}
            <X size={12} />
          </button>
        );
      })}
      <button type="button" className={`chip ${maxPrice != null ? "border-primary text-primary" : ""}`} onClick={() => onToggleFilter?.("price", 120)}>
        Under $120
        <X size={12} />
      </button>
      <button type="button" className={`chip ${shipToNigeria ? "border-primary text-primary" : ""}`} onClick={() => onToggleFilter?.("shipping", "nigeria")}>
        Ships locally
        <X size={12} />
      </button>
      <button type="button" className="text-xs text-primary ml-1" onClick={onClearFilters}>
        Clear all
      </button>
      <button type="button" className="control ml-auto" onClick={onCycleSort}>
        Sort by&nbsp; <b>{getSortLabel(sort)}</b>
      </button>
      <button type="button" className="icon-control" onClick={onCycleSort} aria-label="Sort and filters">
        <SlidersHorizontal size={15} />
      </button>
    </div>
  );
}
