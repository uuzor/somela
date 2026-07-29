import React from "react";
import { ShoppingBag, Wand2, ExternalLink } from "lucide-react";

export default function ProductWidget({ products, onProductClick, onBuyClick, onTryOnClick }) {
  const handleBuyClick = (product, e) => {
    e.stopPropagation();
    onBuyClick?.(product);
  };

  const handleTryOnClick = (product, e) => {
    e.stopPropagation();
    onTryOnClick?.(product);
  };

  const handleProductClick = (product) => {
    onProductClick?.(product);
  };

  return (
    <div className="mt-2 grid grid-cols-2 gap-2.5 max-w-md">
      {products.map((p) => {
        // Normalize product data from different formats
        const productId = p.productId || p.id;
        const title = p.title || p.name;
        const image = p.images?.[0] || p.image;
        const price = p.minPrice || p.price;
        const maxPrice = p.maxPrice;
        const url = p.url;
        
        return (
          <div 
            key={productId} 
            className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleProductClick(p)}
          >
            <div className="aspect-square bg-gray-50 relative">
              {image ? (
                <img 
                  src={image} 
                  alt={title} 
                  className="w-full h-full object-cover" 
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/200x200?text=No+Image';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                  No image
                </div>
              )}
              
              {p.sale && (
                <span className="absolute top-1.5 left-1.5 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  Sale
                </span>
              )}
              
              {p.category && (
                <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {p.category}
                </span>
              )}
            </div>
            
            <div className="p-2">
              <p className="text-[11px] font-bold text-black leading-tight line-clamp-1" title={title}>
                {title}
              </p>
              
              <div className="flex items-center justify-between mt-0.5 mb-1.5">
                <span className="text-[12px] font-extrabold text-black">
                  {maxPrice && maxPrice !== price ? (
                    <span>
                      ${price} - ${maxPrice}
                    </span>
                  ) : (
                    <span>${price}</span>
                  )}
                </span>
              </div>
              
              <div className="flex items-center gap-1.5">
                {url && (
                  <a 
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 h-7 bg-black text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 hover:bg-gray-800 transition"
                  >
                    <ExternalLink className="w-3 h-3" /> View
                  </a>
                )}
                {!url && (
                  <button 
                    onClick={(e) => handleBuyClick(p, e)}
                    className="flex-1 h-7 bg-black text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 hover:bg-gray-800 transition"
                  >
                    <ShoppingBag className="w-3 h-3" /> Buy
                  </button>
                )}
                <button 
                  onClick={(e) => handleTryOnClick(p, e)}
                  className="h-7 px-2.5 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 hover:bg-purple-100 transition"
                >
                  <Wand2 className="w-3 h-3" /> Try
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}