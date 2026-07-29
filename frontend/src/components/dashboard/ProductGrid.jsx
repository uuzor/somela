import React from "react";
import { X, ChevronDown, Loader2 } from "lucide-react";
import ProductCard from "@/components/dashboard/ProductCard";

export default function ProductGrid({ 
  products = [], 
  filters = {}, 
  setFilters, 
  loading = false,
  onTryOn,
  onAddToCart,
  onImageClick,
}) {
  // Fallback to empty array if products is undefined
  const displayProducts = products.length > 0 ? products : [];

  const activeFilters = [];
  if (filters.size) activeFilters.push({ label: filters.size, key: "size" });
  if (filters.availability && filters.availability !== "All") activeFilters.push({ label: filters.availability, key: "availability" });
  if (filters.price) activeFilters.push({ label: filters.price, key: "price" });

  return (
    <div className="flex-1 min-w-0">
      {/* Filters bar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {filters.category && (
            <FilterChip 
              label={filters.category} 
              onRemove={() => setFilters && setFilters({ ...filters, category: "" })} 
            />
          )}
          {filters.size && (
            <FilterChip 
              label={filters.size} 
              onRemove={() => setFilters && setFilters({ ...filters, size: "" })} 
            />
          )}
          {filters.color && (
            <FilterChip 
              label={filters.color} 
              onRemove={() => setFilters && setFilters({ ...filters, color: "" })} 
            />
          )}
          {filters.price && (
            <FilterChip 
              label={filters.price} 
              onRemove={() => setFilters && setFilters({ ...filters, price: "" })} 
            />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[13px] text-gray-500 font-semibold">
          <span>Sort By</span>
          <button className="flex items-center gap-0.5 font-bold text-black">
            Popularity <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && displayProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[14px] text-gray-500 mb-2">No products found</p>
          <p className="text-[12px] text-gray-400">Try adjusting your filters or search terms</p>
        </div>
      )}

      {/* Grid */}
      {!loading && displayProducts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          {displayProducts.map((product) => (
            <ProductCard 
              key={product.id || product.productId} 
              product={product}
              onTryOn={onTryOn}
              onAddToCart={onAddToCart}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 text-[12px] font-bold text-gray-800 px-3 py-1.5 rounded-full">
      {label}
      <button onClick={onRemove}>
        <X className="w-3 h-3 text-gray-500 hover:text-black" />
      </button>
    </span>
  );
}