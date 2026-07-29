/**
 * useCart - Hook for shopping cart functionality
 * 
 * Usage:
 *   const { cart, addToCart, removeFromCart, isLoading } = useCart();
 */

import { useState, useCallback, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

function getSession() {
  try {
    const stored = localStorage.getItem('somela_session');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

async function apiRequest(endpoint, options = {}) {
  const session = getSession();
  const headers = {
    "Content-Type": "application/json",
    ...(session ? { "x-user-id": session.userId } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
  }
  
  return response.json();
}

export function useCart() {
  const [cart, setCart] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch current cart
   */
  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest("/cart");
      setCart(response.cart);
      return response.cart;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add item to cart
   * @param {string} productId - Product ID
   * @param {string} [variantId] - Optional variant ID
   * @param {number} [quantity=1] - Quantity
   */
  const addToCart = useCallback(async (productId, variantId = null, quantity = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest("/cart/items", {
        method: "POST",
        body: JSON.stringify({ productId, variantId, quantity }),
      });
      
      // Refresh cart
      await fetchCart();
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCart]);

  /**
   * Remove item from cart
   * @param {string} itemId - Cart item ID
   */
  const removeFromCart = useCallback(async (itemId) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiRequest(`/cart/items/${itemId}`, {
        method: "DELETE",
      });
      
      // Refresh cart
      await fetchCart();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCart]);

  /**
   * Update item quantity
   * @param {string} itemId - Cart item ID
   * @param {number} quantity - New quantity (0 to remove)
   */
  const updateQuantity = useCallback(async (itemId, quantity) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/cart/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity }),
      });
      
      setCart(response.cart);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get cart item count
   */
  const itemCount = cart?.items?.length || 0;

  /**
   * Get cart items formatted for try-on
   */
  const getTryOnItems = useCallback(() => {
    if (!cart?.items) return [];
    
    return cart.items.map(item => ({
      id: item.productId,
      name: item.product?.title,
      price: item.product?.minPrice 
        ? `$${item.product.minPrice}` 
        : item.product?.maxPrice 
          ? `$${item.product.maxPrice}` 
          : "",
      thumbnail: item.product?.images?.[0],
      colors: [],
      sizes: [],
      productId: item.productId,
      itemId: item.itemId,
    }));
  }, [cart]);

  // Fetch cart on mount
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  return {
    cart,
    isLoading,
    error,
    itemCount,
    fetchCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    getTryOnItems,
    clearError: () => setError(null),
  };
}

/**
 * Hook for AI to interact with cart
 * Provides simpler API for adding items during chat
 */
export function useAICart() {
  const { addToCart, removeFromCart, fetchCart, cart } = useCart();

  /**
   * Add multiple products to cart
   * Called by AI agent
   */
  const addProductsToCart = useCallback(async (productIds) => {
    const results = [];
    for (const productId of productIds) {
      try {
        const result = await addToCart(productId);
        results.push({ productId, success: true, result });
      } catch (err) {
        results.push({ productId, success: false, error: err.message });
      }
    }
    return results;
  }, [addToCart]);

  return {
    addToCart,
    addProductsToCart,
    removeFromCart,
    fetchCart,
    cart,
  };
}

export default useCart;
