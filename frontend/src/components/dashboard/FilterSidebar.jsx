import React, { useState, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

const defaultCategories = [
  { name: "Tops", count: 0 },
  { name: "Bottoms", count: 0 },
  { name: "Outerwear", count: 0 },
  { name: "Shirts", count: 0 },
  { name: "Dresses", count: 0 },
  { name: "Hoodies", count: 0 },
  { name: "Accessories", count: 0 },
];

const sizes = ["S", "M", "L", "XL"];
const availabilities = ["All", "Discount", "In Stock"];

// Price options with actual values
const priceOptions = [
  { label: "Under $50", minPrice: 0, maxPrice: 50 },
  { label: "$50 - $100", minPrice: 50, maxPrice: 100 },
  { label: "$100 - $150", minPrice: 100, maxPrice: 150 },
  { label: "$150+", minPrice: 150, maxPrice: undefined },
];

export default function FilterSidebar({ filters = {}, setFilters }) {
  const [categories, setCategories] = useState(defaultCategories);

  // Fetch categories from API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/catalog?limit=1`);
        const data = await res.json();
        // Update category counts if available
        if (data.categories) {
          setCategories(prev => prev.map(cat => ({
            ...cat,
            count: data.categories[cat.name] || 0,
          })));
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    }
    fetchCategories();
  }, []);

  const handleCategoryChange = (catName) => {
    const currentCategory = filters.category;
    const newCategory = currentCategory === catName ? "" : catName;
    setFilters({ ...filters, category: newCategory });
  };

  const handleSizeChange = (size) => {
    const newSize = filters.size === size ? "" : size;
    setFilters({ ...filters, size: newSize });
  };

  const handlePriceChange = (priceOption) => {
    if (filters.minPrice === priceOption.minPrice && filters.maxPrice === priceOption.maxPrice) {
      // Deselect
      setFilters({ ...filters, minPrice: undefined, maxPrice: undefined, price: "" });
    } else {
      setFilters({ 
        ...filters, 
        minPrice: priceOption.minPrice, 
        maxPrice: priceOption.maxPrice,
        price: priceOption.label 
      });
    }
  };

  const clearAllFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = filters.category || filters.size || filters.minPrice || filters.maxPrice;

  return (
    <aside className="w-[210px] shrink-0 pr-5 border-r border-gray-100 overflow-y-auto hidden lg:block space-y-4">
      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearAllFilters}
          className="w-full flex items-center justify-between text-[11px] font-bold text-purple-600 hover:text-purple-700"
        >
          <span>Clear All</span>
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Category */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-black">Category</h3>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="space-y-2">
          {categories.map((cat) => (
            <label key={cat.name} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="category"
                checked={filters.category === cat.name}
                onChange={() => handleCategoryChange(cat.name)}
                className="w-3.5 h-3.5 border-gray-300 text-black focus:ring-black accent-black"
              />
              <span className={`text-[13px] font-semibold transition ${filters.category === cat.name ? 'text-black' : 'text-gray-700 group-hover:text-black'}`}>
                {cat.name}
              </span>
              {cat.count > 0 && (
                <span className="text-[11px] font-bold text-gray-400 ml-auto">{cat.count}</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Size */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-black">Size</h3>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              onClick={() => handleSizeChange(size)}
              className={`w-9 h-9 rounded-lg text-[12px] font-bold transition ${
                filters.size === size
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Availability */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-black">Availability</h3>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="space-y-2">
          {availabilities.map((a) => (
            <label key={a} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="availability"
                checked={filters.availability === a}
                onChange={() => setFilters({ ...filters, availability: a })}
                className="w-3.5 h-3.5 border-gray-300 text-black focus:ring-black accent-black"
              />
              <span className="text-[13px] font-semibold text-gray-700 group-hover:text-black transition">{a}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-black">Price</h3>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="space-y-2">
          {priceOptions.map((p) => (
            <label key={p.label} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="price"
                checked={filters.price === p.label}
                onChange={() => handlePriceChange(p)}
                className="w-3.5 h-3.5 border-gray-300 text-black focus:ring-black accent-black"
              />
              <span className="text-[13px] font-semibold text-gray-700 group-hover:text-black transition">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-black">Color</h3>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { name: "Black", color: "#000000" },
            { name: "White", color: "#FFFFFF", border: true },
            { name: "Blue", color: "#3B82F6" },
            { name: "Red", color: "#EF4444" },
            { name: "Green", color: "#22C55E" },
            { name: "Beige", color: "#D2B48C" },
          ].map((c) => (
            <button
              key={c.name}
              onClick={() => setFilters({ ...filters, color: c.name.toLowerCase() })}
              className={`w-7 h-7 rounded-full border-2 transition ${
                filters.color === c.name.toLowerCase() 
                  ? "border-black ring-2 ring-black ring-offset-1" 
                  : "border-gray-200 hover:border-gray-400"
              }`}
              style={{ 
                background: c.color,
                ...(c.border && { border: '2px solid #e5e7eb' })
              }}
              title={c.name}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}