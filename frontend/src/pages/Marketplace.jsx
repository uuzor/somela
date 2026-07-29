import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/dashboard/Navbar";
import FilterSidebar from "@/components/dashboard/FilterSidebar";
import ProductGrid from "@/components/dashboard/ProductGrid";
import AIAssistant from "@/components/dashboard/AIAssistant";
import { useCatalog, useVisualSearch } from "@/hooks/useCatalog";
import { useCart } from "@/hooks/useCart";
import { Sparkles, Loader2 } from "lucide-react";

export default function Marketplace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Parse filters from URL
  const initialFilters = {
    category: searchParams.get("category") || "",
    color: searchParams.get("color") || "",
    q: searchParams.get("q") || "",
    minPrice: searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")) : undefined,
    maxPrice: searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")) : undefined,
    imageUrl: searchParams.get("imageUrl") || "",
  };
  
  // Catalog hook
  const {
    products,
    total,
    loading,
    filters,
    setFilters,
    hasMore,
    loadMore,
    pagination,
  } = useCatalog(initialFilters);
  
  // Visual search hook (for image URL)
  const { results: visualResults, loading: visualLoading, searchByImage } = useVisualSearch();
  
  // Cart hook
  const { addToCart, cart } = useCart();
  
  // Active image for visual search
  const [activeImageUrl, setActiveImageUrl] = useState(initialFilters.imageUrl || "");

  // Update URL when filters change
  const handleFilterChange = useCallback((newFilters) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...newFilters }).forEach(([key, value]) => {
      if (value && value !== "" && value !== undefined) {
        params.set(key, String(value));
      }
    });
    setSearchParams(params);
    setFilters(newFilters);
  }, [filters, setFilters, setSearchParams]);

  // Handle image URL search
  useEffect(() => {
    if (activeImageUrl && !products.length) {
      // Perform visual search
      searchByImage(activeImageUrl);
    }
  }, [activeImageUrl]);

  // Display products (visual search results or catalog)
  const displayProducts = visualResults.length > 0 
    ? visualResults.map(r => ({
        id: r.productId,
        productId: r.productId,
        title: r.title,
        images: r.images,
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        category: r.category,
        distance: r.distance,
      }))
    : products;

  // Handle "Try On" action
  const handleTryOn = useCallback((productId) => {
    navigate(`/tryon?products=${productId}`);
  }, [navigate]);

  // Handle "Add to Cart"
  const handleAddToCart = useCallback(async (productId) => {
    try {
      await addToCart(productId);
    } catch (err) {
      console.error("Failed to add to cart:", err);
    }
  }, [addToCart]);

  // Active filters for sidebar
  const activeFilters = {
    categories: filters.category ? [filters.category] : [],
    size: filters.size || "",
    availability: filters.availability || "All",
    price: filters.price || "",
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Filters + Products */}
        <div className="flex flex-1 overflow-hidden">
          {/* Filter Sidebar */}
          <FilterSidebar 
            filters={activeFilters} 
            setFilters={handleFilterChange}
          />
          
          {/* Main Content */}
          <div className="flex-1 overflow-y-auto py-4 pr-5">
            {/* Visual Search Banner */}
            {activeImageUrl && (
              <div className="mb-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border border-purple-100">
                <div className="flex items-center gap-4">
                  <img 
                    src={activeImageUrl} 
                    alt="Search image" 
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-[13px] font-bold text-black mb-1">
                      {visualLoading ? "Finding similar items..." : `Found ${displayProducts.length} similar items`}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Visual search results for this image
                    </p>
                  </div>
                  {visualLoading && <Loader2 className="w-5 h-5 animate-spin text-purple-600" />}
                  <button 
                    onClick={() => {
                      setActiveImageUrl("");
                      const params = new URLSearchParams(searchParams);
                      params.delete("imageUrl");
                      setSearchParams(params);
                    }}
                    className="text-[11px] font-bold text-gray-500 hover:text-black"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            
            {/* Breadcrumb with active filters */}
            <div className="flex items-center gap-2 mb-4">
              <button 
                onClick={() => navigate("/")}
                className="text-[13px] text-gray-400 hover:text-black font-semibold"
              >
                Home
              </button>
              <span className="text-gray-400">›</span>
              <span className="text-[13px] font-bold text-black">
                {filters.category || "All Products"}
              </span>
              {filters.q && (
                <>
                  <span className="text-gray-400">›</span>
                  <span className="text-[13px] font-bold text-black">"{filters.q}"</span>
                </>
              )}
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-[13px] text-gray-500 font-semibold">
                {total > 0 ? `${total} items` : 'No items found'}
              </p>
              {visualResults.length > 0 && (
                <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                  Visual Search Results
                </span>
              )}
            </div>

            {/* Product Grid */}
            <ProductGrid 
              products={displayProducts}
              loading={loading || visualLoading}
              onTryOn={handleTryOn}
              onAddToCart={handleAddToCart}
              onImageClick={setActiveImageUrl}
            />

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-6 mb-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-8 py-3 bg-black text-white rounded-full text-[13px] font-bold hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    `Load More (${pagination.offset + pagination.limit} of ${total})`
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Assistant */}
        <AIAssistant />
      </div>
    </div>
  );
}
