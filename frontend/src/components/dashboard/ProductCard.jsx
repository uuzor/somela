import React from "react";
import { ShoppingCart, Star, Heart, Sparkles } from "lucide-react";

const colorSwatches = ["#000000", "#6B7280", "#D1D5DB", "#9CA3AF"];

export default function ProductCard({ 
  product, 
  onTryOn,
  onAddToCart,
  onImageClick,
}) {
  // Handle API data format
  const image = product.images?.[0] || product.image || "";
  const title = product.title || "";
  const price = product.minPrice || product.maxPrice || product.price || 0;
  const description = product.description || "";
  const productId = product.id || product.productId;

  return (
    <div className="group flex flex-col">
      <div 
        className="relative rounded-xl overflow-hidden bg-gray-100 mb-3 cursor-pointer" 
        style={{ maxHeight: "240px" }}
        onClick={() => onImageClick && onImageClick(image)}
      >
        <img
          src={image}
          alt={title}
          className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
          style={{ maxHeight: "240px", height: "240px" }}
        />
        {product.isSale && (
          <span className="absolute top-2.5 left-2.5 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Sale
          </span>
        )}
        <button 
          className="absolute top-2.5 right-2.5 w-7 h-7 bg-white/80 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Heart className="w-3.5 h-3.5 text-gray-700" />
        </button>
      </div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-[14px] font-bold text-black leading-tight line-clamp-1">{title}</h3>
        <span className="text-[14px] font-extrabold text-black shrink-0">${price}</span>
      </div>
      {description && (
        <p className="text-[11px] text-gray-400 leading-snug line-clamp-1 mb-1.5 font-medium">{description}</p>
      )}
      <div className="flex items-center gap-2 mb-2.5">
        {product.rating && (
          <>
            <div className="flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-[11px] font-bold text-gray-700">{product.rating}</span>
            </div>
            <span className="text-[11px] text-gray-300">|</span>
          </>
        )}
        {product.sold && (
          <span className="text-[11px] font-semibold text-gray-400">{product.sold} Sold</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Add to Cart */}
        <button 
          onClick={() => onAddToCart && onAddToCart(productId)}
          className="flex-1 h-9 bg-black hover:bg-gray-800 text-white text-[12px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Add
        </button>
        {/* Try On */}
        <button 
          onClick={() => onTryOn && onTryOn(productId)}
          className="h-9 px-3 bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          title="Try On"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
        {/* Color swatches */}
        <div className="flex items-center gap-1">
          {colorSwatches.map((c) => (
            <span key={c} className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}