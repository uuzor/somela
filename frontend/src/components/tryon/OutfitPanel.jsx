import React from "react";
import { Trash2, Sparkles, ShoppingCart, Plus } from "lucide-react";

export default function OutfitPanel({ 
  outfit, 
  setOutfit, 
  onTryOn,
  hasSelfie = false,
  isLoading = false,
  onAddToCart,
  showTryOnCart = false,
  onTryOnCart,
  cartItemCount = 0,
}) {
  const updatePiece = (id, field, value) => {
    setOutfit((o) => o.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removePiece = (id) => {
    setOutfit((o) => o.filter((p) => p.id !== id));
  };

  const handleTryOn = () => {
    if (!hasSelfie) {
      alert("Please upload your photo first!");
      return;
    }
    if (outfit.length === 0) {
      alert("Please select at least one item to try on!");
      return;
    }
    
    const productIds = outfit.map(p => p.productId || p.id).filter(Boolean);
    if (productIds.length > 0) {
      onTryOn(productIds);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header with cart count */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-black">
          {showTryOnCart ? "Cart Items" : "Selected Clothes"}
        </h3>
        <span className="text-[11px] font-semibold text-gray-400">{outfit.length} pieces</span>
      </div>

      <div className="space-y-3">
        {outfit.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[12px] text-gray-400">No items to try on</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {cartItemCount > 0 
                ? `${cartItemCount} items in cart` 
                : "Add items from chat to get started"}
            </p>
          </div>
        ) : (
          outfit.map((piece) => (
            <div key={piece.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-3.5">
              <div className="flex items-center gap-3 mb-3">
                <img src={piece.thumbnail || piece.image} className="w-12 h-12 rounded-lg object-cover" alt="" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{piece.label}</p>
                  <p className="text-[13px] font-bold text-black leading-tight truncate">{piece.name || piece.title}</p>
                  <p className="text-[12px] font-extrabold text-black">{piece.price}</p>
                </div>
                <button 
                  onClick={() => removePiece(piece.id)}
                  className="text-gray-400 hover:text-black transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Color */}
              {piece.colors && piece.colors.length > 0 && (
                <div className="mb-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Color</p>
                  <div className="flex items-center gap-2">
                    {piece.colors.map((c) => (
                      <button
                        key={c}
                        onClick={() => updatePiece(piece.id, "selectedColor", c)}
                        className={`w-5 h-5 rounded-full border-2 transition ${
                          piece.selectedColor === c ? "border-black ring-1 ring-black ring-offset-1" : "border-gray-200"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Size */}
              {piece.sizes && piece.sizes.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Size</p>
                  <div className="flex items-center gap-1.5">
                    {piece.sizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => updatePiece(piece.id, "selectedSize", s)}
                        className={`min-w-7 h-7 px-2 rounded-lg text-[11px] font-bold transition ${
                          piece.selectedSize === s
                            ? "bg-black text-white"
                            : "bg-white border border-gray-200 text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Try-On Button */}
      {outfit.length > 0 && (
        <div className="mt-4 px-1 space-y-2">
          <button
            onClick={handleTryOn}
            disabled={isLoading || !hasSelfie}
            className={`w-full py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 transition-all ${
              hasSelfie && !isLoading
                ? "bg-black text-white hover:bg-gray-800 active:scale-[0.98]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Try On {outfit.length === 1 ? "This Item" : "These Items"}</span>
              </>
            )}
          </button>
          
          {/* Try On Cart Button */}
          {showTryOnCart && cartItemCount > outfit.length && (
            <button
              onClick={onTryOnCart}
              disabled={isLoading || !hasSelfie}
              className={`w-full py-2.5 rounded-xl font-bold text-[12px] flex items-center justify-center gap-2 transition-all ${
                hasSelfie && !isLoading
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Try On All {cartItemCount} Cart Items</span>
            </button>
          )}
          
          {!hasSelfie && (
            <p className="text-[10px] text-gray-400 text-center">
              Upload your photo to enable try-on
            </p>
          )}
        </div>
      )}
    </div>
  );
}