import FilterBar from "./FilterBar";
import ProductCard from "./ProductCard";
import SelectedProductTray from "./SelectedProductTray";

function getProductId(product) {
  return product?.id || product?.productId || product?.raw?.productId || product?.raw?.id || null;
}

export default function SearchResults({
  products = [],
  selected,
  selectedIds,
  selectedProducts,
  onSelect,
  onToggleSelect,
  onTry,
  onAddToCart,
  onToggleSaved,
  onCompare,
  onView,
  loading,
  reference,
  filters,
  onToggleFilter,
  onClearFilters,
  onCycleSort,
  cartProductIds = [],
  savedProductIds = [],
  activeTryOn,
  onRemoveSelected,
  onClearSelected,
}) {
  const activeSelectedIds = Array.isArray(selectedIds) && selectedIds.length > 0
    ? selectedIds.filter(Boolean)
    : selected
      ? [getProductId(selected)].filter(Boolean)
      : [];
  const selectedSet = new Set(activeSelectedIds);
  const resolvedSelectedProducts = Array.isArray(selectedProducts) && selectedProducts.length > 0
    ? selectedProducts
    : activeSelectedIds
        .map((id) => products.find((product) => getProductId(product) === id))
        .filter(Boolean);
  const primarySelected = resolvedSelectedProducts[0] || selected || null;
  const cartSet = new Set(Array.isArray(cartProductIds) ? cartProductIds.filter(Boolean) : []);
  const savedSet = new Set(Array.isArray(savedProductIds) ? savedProductIds.filter(Boolean) : []);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4">
        <div className="flex gap-3 items-center mb-3">
          {reference && (
            <img
              src={reference}
              alt="Reference"
              className="w-16 h-16 object-cover rounded-[20px] shadow-card"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold">{products.length} similar items</h1>
            <p className="text-xs text-muted-foreground">
              Matching your style preferences and filters.
            </p>
          </div>
        </div>
        <FilterBar
          filters={filters}
          products={products}
          onToggleFilter={onToggleFilter}
          onClearFilters={onClearFilters}
          onCycleSort={onCycleSort}
        />
      </div>
      <div className="flex-1  overflow-y-scroll px-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <ProductCard key={`loading-${i}`} loading />
          ))
        ) : products.length === 0 ? (
          <div className="col-span-full text-center py-20 text-muted-foreground text-sm">
            No results yet - start a search from Discover.
          </div>
        ) : (
          products.map((product, index) => {
            const productId = getProductId(product);
            const isSelected = selectedSet.has(productId);
            const cardKey = productId || product?.handle || product?.url || `${product?.title || product?.name || "product"}-${index}`;

            return (
              <ProductCard
                key={cardKey}
                product={product}
                selected={isSelected}
                saved={savedSet.has(productId)}
                inCart={cartSet.has(productId)}
                onSelect={() => (onToggleSelect ? onToggleSelect(product) : onSelect?.(product))}
                onTry={() => onTry(product)}
                onAddToCart={onAddToCart}
                onToggleSaved={onToggleSaved}
              />
            );
          })
        )}
      </div>
      <SelectedProductTray
        product={primarySelected}
        products={resolvedSelectedProducts}
        activeTryOn={activeTryOn}
        onRemove={onRemoveSelected}
        onClear={onClearSelected}
        onCompare={() => onCompare?.(resolvedSelectedProducts.length > 0 ? resolvedSelectedProducts : primarySelected ? [primarySelected] : [])}
        onTry={(items) => onTry(items.length === 1 ? items[0] : items)}
        onView={(item) => onView(item || primarySelected)}
      />
    </div>
  );
}
