import FilterBar from "./FilterBar";
import ProductCard from "./ProductCard";
import SelectedProductTray from "./SelectedProductTray";
export default function SearchResults({
  products,
  selected,
  onSelect,
  onTry,
  onCompare,
  onView,
  loading,
  reference,
}) {
    console.log(products)
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
        <FilterBar />
      </div>
      <div className="flex-1 overflow-y-auto px-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <ProductCard key={i} loading />
          ))
        ) : products.length === 0 ? (
          <div className="col-span-full text-center py-20 text-muted-foreground text-sm">
            No results yet — start a search from Discover.
          </div>
        ) : (
          products.map((p) => (
            <ProductCard
              key={p.productId}
              product={p}
              selected={selected?.id === p.productId}
              onSelect={() => onSelect(p)}
              onTry={() => onTry(p)}
            />
          ))
        )}
      </div>
      <SelectedProductTray
        product={selected}
        onCompare={onCompare}
        onTry={() => onTry(selected)}
        onView={onView}
      />
    </div>
  );
}


