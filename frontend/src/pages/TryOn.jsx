import React, { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import TryOnCanvas from "@/components/tryon/TryOnCanvas";
import ModelPanel from "@/components/tryon/ModelPanel";
import OutfitPanel from "@/components/tryon/OutfitPanel";
import AIAssistant from "@/components/dashboard/AIAssistant";
import { useTryOn, useSelfies } from "@/hooks/useTryOn";
import { useUpload } from "@/hooks/useUpload";
import { useCart } from "@/hooks/useCart";

export default function TryOn() {
  const [searchParams] = useSearchParams();
  
  // Try-on state
  const {
    status,
    currentStep,
    totalSteps,
    steps,
    resultImage,
    errorMessage,
    startTryOn,
    reset,
  } = useTryOn();

  // Selfies state
  const {
    selfies,
    selectedSelfie,
    isLoading: isSelfieLoading,
    uploadSelfie,
    selectSelfie,
    fetchSelfies,
  } = useSelfies();

  // Cart state
  const { cart, getTryOnItems, fetchCart, addToCart } = useCart();

  // Upload hook for Supabase
  const { upload, isUploading: isUploadLoading } = useUpload();

  // Selected model state (for display)
  const [selectedModel, setSelectedModel] = useState({
    id: "m1",
    name: "Aria",
    image: "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=120&h=150&fit=crop",
  });

  // Outfit state - initialized from URL params or cart
  const [outfit, setOutfit] = useState([]);
  
  // Active tab
  const activeTab = searchParams.get("tab") || "outfit";

  // Load products from URL params or cart on mount
  useEffect(() => {
    // First fetch cart and selfies
    fetchCart();
    fetchSelfies();
    
    // Check for products in URL
    const productsParam = searchParams.get("products");
    if (productsParam) {
      // Products passed from chat
      const productIds = productsParam.split(",");
      // For now, create placeholder items (in real app, would fetch product details)
      const items = productIds.map((id, idx) => ({
        id: id,
        label: idx === 0 ? "Top" : "Bottom",
        name: `Product ${idx + 1}`,
        price: "$0",
        thumbnail: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=80&h=80&fit=crop",
        colors: [],
        sizes: [],
        productId: id,
      }));
      setOutfit(items);
    } else {
      // Load from cart
      // Cart will be loaded and outfit will update when cart changes
    }
  }, []);

  // Update outfit when cart loads
  useEffect(() => {
    if (cart && !searchParams.get("products") && cart.items?.length > 0) {
      const cartItems = getTryOnItems();
      setOutfit(cartItems);
    }
  }, [cart, getTryOnItems]);

  // Handle selfie upload
  const handleUploadSelfie = useCallback(async (imageUrl) => {
    try {
      // Upload to Supabase first if it's a blob URL or local file
      let publicUrl = imageUrl;
      
      // If it's a blob URL (starts with blob:), upload to Supabase
      if (imageUrl.startsWith("blob:")) {
        // Need to convert blob URL to file first
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
        publicUrl = await upload(file, "selfies");
      }

      // Register selfie with backend
      const selfie = await uploadSelfie(publicUrl);
      
      // Set as selected model
      setSelectedModel({
        id: selfie.id,
        name: "You",
        image: selfie.imageUrl,
      });
    } catch (err) {
      console.error("Failed to upload selfie:", err);
      alert(err.message || "Failed to upload selfie");
    }
  }, [upload, uploadSelfie]);

  // Handle selfie selection
  const handleSelectSelfie = useCallback((selfie) => {
    selectSelfie(selfie);
    setSelectedModel({
      id: selfie.id,
      name: "You",
      image: selfie.imageUrl,
    });
  }, [selectSelfie]);

  // Handle try-on
  const handleTryOn = useCallback(async (productIds) => {
    try {
      await startTryOn(productIds);
    } catch (err) {
      console.error("Try-on failed:", err);
      alert(err.message || "Try-on failed");
    }
  }, [startTryOn]);

  // Check if user has uploaded a selfie
  const hasSelfie = selfies.length > 0 || (selectedModel && !selectedModel.id.startsWith("m"));

  // Try on all cart items
  const handleTryOnCart = useCallback(async () => {
    const cartItems = getTryOnItems();
    if (cartItems.length === 0) {
      alert("Your cart is empty!");
      return;
    }
    const productIds = cartItems.map(item => item.productId);
    await handleTryOn(productIds);
  }, [getTryOnItems, handleTryOn]);

  // Add item to cart from outfit
  const handleAddToCart = useCallback(async (item) => {
    try {
      await addToCart(item.productId);
      alert("Added to cart!");
    } catch (err) {
      console.error("Failed to add to cart:", err);
      alert(err.message || "Failed to add to cart");
    }
  }, [addToCart]);

  return (
    <AppShell>
      <div className="flex h-full min-h-0 overflow-hidden bg-white">
        {/* Left: Canvas (widest) */}
        <TryOnCanvas
          selectedModel={selectedModel}
          resultImage={resultImage}
          status={status}
          currentStep={currentStep}
          totalSteps={totalSteps}
          steps={steps}
          onReset={reset}
        />

        {/* Middle: Models + Selected Clothes */}
        <div className="w-[260px] shrink-0 border-l border-gray-100 px-4 py-5 flex flex-col">
          <ModelPanel
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            selfies={selfies}
            onUploadSelfie={handleUploadSelfie}
            onSelectSelfie={handleSelectSelfie}
            isUploading={isUploadLoading || isSelfieLoading}
          />
          <OutfitPanel
            outfit={outfit}
            setOutfit={setOutfit}
            onTryOn={handleTryOn}
            hasSelfie={hasSelfie}
            isLoading={status === "loading" || status === "processing"}
            onAddToCart={handleAddToCart}
            showTryOnCart={activeTab === "cart"}
            onTryOnCart={handleTryOnCart}
            cartItemCount={cart?.items?.length || 0}
          />
        </div>

        {/* Right: AI Assistant */}
        <AIAssistant />
      </div>
    </AppShell>
  );
}