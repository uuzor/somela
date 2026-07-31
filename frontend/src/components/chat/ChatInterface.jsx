import React, { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, ImageIcon, Shirt, User, Palette, ArrowUp, Paperclip, Loader2, ShoppingCart, SparklesIcon, Grid, Tag } from "lucide-react";
import MessageBubble from "@/components/chat/MessageBubble";
import { useChatStream, MESSAGE_TYPES, UI_TYPES } from "@/hooks/useChat";
import { useUpload } from "@/hooks/useUpload";
import { useCategories } from "@/hooks/useCatalog";
import { useNavigate } from "react-router-dom";

const suggestions = [
  { icon: Shirt, label: "Find similar outfits to this", color: "text-slate-600 bg-slate-50" },
  { icon: ImageIcon, label: "Upload a photo to find outfits", color: "text-slate-600 bg-slate-50" },
  { icon: User, label: "Give me outfit recommendations", color: "text-black bg-black-50" },
  { icon: Palette, label: "Suggest clothes by style", color: "text-slate-600 bg-red-50" },
];

const shortcuts = [
  {
    label: "Visual Search",
    sub: "Upload an image to find similar clothing items",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=400&fit=crop",
  },
  {
    label: "Try-On",
    sub: "See how clothes look on different models",
    image: "https://images.unsplash.com/photo-1485462537746-965f00f7f9d2?w=400&h=400&fit=crop",
  },
  {
    label: "Style Advice",
    sub: "Get personalized outfit suggestions",
    image: "https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=400&h=400&fit=crop",
  },
  {
    label: "Compare",
    sub: "Compare different styles and outfits",
    image: "https://images.unsplash.com/photo-1581338834647-b0fb40704e21?w=400&h=400&fit=crop",
  },
];

// Category to image mapping
const categoryImages = {
  top: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop",
  tops: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop",
  shirt: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop",
  shirts: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop",
  bottom: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=400&fit=crop",
  bottoms: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=400&fit=crop",
  denim: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop",
  jeans: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop",
  dress: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=400&fit=crop",
  dresses: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=400&fit=crop",
  outerwear: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=400&fit=crop",
  jacket: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=400&fit=crop",
  hoodie: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=400&fit=crop",
  hoodies: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=400&fit=crop",
  accessory: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
  accessories: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop",
  shoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop",
};

const defaultCategoryImage = "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=400&h=400&fit=crop";

export default function ChatInterface() {
  const [prompt, setPrompt] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const [attachedImage, setAttachedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const navigate = useNavigate();
  
  const { upload, isUploading: isUploadLoading, error: uploadError } = useUpload();
  const { categories, fetchCategories } = useCategories();
  
  const {
    messages,
    isStreaming,
    error,
    currentReply,
    products,
    actions,
    sendMessage,
    clearMessages,
    startNewSession,
  } = useChatStream();

  const isChatMode = messages.length > 0;

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Auto-scroll to the latest content while streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, currentReply, products, actions, isStreaming]);

  const handleSendMessage = useCallback(async (text, imageUrl = null) => {
    // Allow sending with just text, just image, or both
    if (!text.trim() && !imageUrl) return;
    
    // If no text but has image, use default message
    const message = text.trim() || "Find similar outfits to this image";
    await sendMessage(message, imageUrl);
    setPrompt("");
    setAttachedImage(null);
  }, [sendMessage, isUploading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(prompt, attachedImage);
    }
  }, [prompt, attachedImage, handleSendMessage]);

  const handleSuggestionClick = useCallback((text) => {
    handleSendMessage(text);
  }, [handleSendMessage]);

  const handleShortcutClick = useCallback((label) => {
    handleSendMessage(label);
  }, [handleSendMessage]);

  const handleImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
	
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Create preview URL first for immediate feedback
    const previewUrl = URL.createObjectURL(file);
    setAttachedImage(previewUrl);
    setIsUploading(true);

    try {
      // Upload to Supabase via backend
      const publicUrl = await upload(file, 'chat-uploads');
      
      // Update with the permanent Supabase URL
      setAttachedImage(publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      alert(err.message || 'Failed to upload image. Please try again.');
      setAttachedImage(null);
    } finally {
      setIsUploading(false);
    }
  }, [upload]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageButtonClick = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  // Handle try-on action from AI
  const handleTryOn = useCallback((productId) => {
    // Navigate to try-on page with product ID
    navigate(`/tryon?products=${productId}`);
  }, [navigate]);

  // Handle try-on all (multiple products)
  const handleTryOnAll = useCallback((productIds) => {
    // Navigate to try-on page with all product IDs
    const ids = Array.isArray(productIds) ? productIds.join(',') : productIds;
    navigate(`/tryon?products=${ids}`);
  }, [navigate]);

  // Handle view cart
  const handleViewCart = useCallback(() => {
    // Navigate to cart (or show cart panel)
    navigate('/tryon?tab=cart');
  }, [navigate]);

  // Handle see all - navigate to marketplace with filters
  const handleSeeAll = useCallback((filters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.color) params.set('color', filters.color);
    if (filters.q) params.set('q', filters.q);
    if (attachedImage) params.set('imageUrl', attachedImage);
    
    const queryString = params.toString();
    navigate(`/marketplace${queryString ? `?${queryString}` : ''}`);
  }, [navigate, attachedImage]);

  const canSend = !isStreaming && !isUploading && (prompt.trim() || attachedImage);

  return (
    <div className="flex-1 flex flex-col min-w-0 relative min-h-0">
      {/* Gradient bg */}
      <div
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 25% 20%, #fff 0%, transparent 40%), radial-gradient(circle at 75% 15%, #f2f2f2 0%, transparent 45%), radial-gradient(circle at 50% 60%, #fff 0%, transparent 50%)",
        }}
      />

      {/* Chat / Landing */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto min-h-0 pb-32">
        {!isChatMode ? (
          <div className="max-w-4xl mx-auto px-8 pt-8 pb-4">
            {showBanner && (
              <div className="w-full bg-white backdrop-blur border border-slate-100 rounded-xl px-4 py-2.5 flex items-center gap-3 mb-12">
                <Sparkles className="w-4 h-4 text-slate-800 shrink-0" />
                <p className="text-[13px] font-semibold text-slate-700 flex-1">
                  Introducing OpenCommerceLens: Your AI shopping agent for fashion. Upload a photo to find similar outfits!{" "}
                  <span className="text-black font-bold cursor-pointer">Learn more →</span>
                </p>
                <button onClick={() => setShowBanner(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-black" />
                </button>
              </div>
            )}

            <h1 className="text-center text-[40px] font-extrabold text-black mb-8 tracking-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>
              What will you wear today?
            </h1>

            {/* Quick suggestions */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mb-10">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(s.label)}
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-2.5 pr-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:border-slate-400 hover:shadow-sm transition"
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${s.color}`}>
                    <s.icon className="w-3.5 h-3.5" />
                  </span>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Studio Shortcuts */}
            <div>
              <h2 className="text-[16px] font-extrabold text-black mb-4">Browse by Category</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {categories.slice(0, 8).map((cat) => (
                  <button 
                    key={cat} 
                    onClick={() => handleSuggestionClick(`Show me ${cat}`)}
                    className="group rounded-2xl overflow-hidden aspect-square relative text-left"
                  >
                    <img src={categoryImages[cat.toLowerCase()] || defaultCategoryImage} alt={cat} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3.5">
                      <p className="text-[14px] font-extrabold text-white mb-1 capitalize">{cat}</p>
                      <p className="text-[11px] font-medium text-slate-200 leading-snug line-clamp-2">Browse {cat} items</p>
                    </div>
                  </button>
                ))}
              </div>
              {categories.length > 8 && (
                <button
                  onClick={() => handleSuggestionClick("Show me all products")}
                  className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-black hover:text-black-700"
                >
                  <Tag className="w-4 h-4" />
                  See all {categories.length} categories
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
            <div className="flex justify-end">
              <button
                onClick={() => void startNewSession()}
                className="text-[12px] font-bold text-slate-500 hover:text-black transition"
              >
                New chat
              </button>
            </div>

            {messages.map((m, i) => (
              <MessageBubble key={m.id || i} message={m} />
            ))}
            
            {/* Show AI action suggestions (try-on suggestions, cart updates) */}
            {actions.filter(a => a.type === 'try_on_suggestion' || a.type === 'added_to_cart').map((action, idx) => (
              <div key={idx} className="mt-4 bg-gradient-to-r from-black-50 to-pink-50 rounded-2xl p-4 border border-black-100">
                {action.type === 'try_on_suggestion' && (
                  <>
                    <p className="text-[13px] font-semibold text-slate-700 mb-2">{action.reason || "Would you like to try this on?"}</p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => handleTryOn(action.product?.productId)}
                        className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-[12px] font-bold hover:bg-black-700 transition"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Try It On
                      </button>
                      <button
                        onClick={() => handleSeeAll({ category: action.product?.category })}
                        className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full text-[12px] font-bold hover:bg-slate-50 transition border border-slate-200"
                      >
                        <Grid className="w-4 h-4" />
                        See All Similar
                      </button>
                      <button
                        onClick={handleViewCart}
                        className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full text-[12px] font-bold hover:bg-slate-50 transition border border-slate-200"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Add to Cart
                      </button>
                    </div>
                  </>
                )}
                {action.type === 'added_to_cart' && (
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-green-700">Added to cart!</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleViewCart}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-full text-[12px] font-bold hover:bg-green-700 transition"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        View Cart
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-black-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-black" />
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            
            {/* Error message */}
            {(error || uploadError) && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error || uploadError}
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} className="h-px" />
      </div>

      {/* Bottom: input */}
      <div className="relative max-w-3xl w-full mx-auto px-6 pb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
          {/* Image preview */}
          {attachedImage && (
            <div className="mb-2 relative inline-block">
              <img 
                src={attachedImage} 
                alt="Attached" 
                className="w-20 h-20 rounded-lg object-cover" 
              />
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
              {!isUploading && (
                <button
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              )}
            </div>
          )}
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you're looking for or upload an image..."
            className="w-full text-[14px] font-medium text-slate-800 placeholder-slate-400 outline-none px-2 py-2 resize-none"
            rows={1}
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
          
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleAttachClick}
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-black transition disabled:opacity-50"
                disabled={isUploading}
              >
                <Paperclip className="w-3.5 h-3.5" /> 
                Attach
              </button>
              <button 
                onClick={handleImageButtonClick}
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-black transition disabled:opacity-50"
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                Image Search
              </button>
            </div>
            
            <button
              onClick={() => handleSendMessage(prompt, attachedImage)}
              disabled={!canSend}
              className="w-8 h-8 bg-black rounded-full flex items-center justify-center hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 text-white" strokeWidth={2.5} />
              )}
            </button>
          </div>
          
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}




