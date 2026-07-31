/**
 * useCatalog - Hook for fetching products with filters
 * 
 * Usage:
 *   const { products, total, loading, fetchProducts } = useCatalog();
 *   
 *   // With filters
 *   useCatalog({ category: 'tops', color: 'blue', q: 'hoodie' });
 */

import { useState, useCallback, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getSession() {
  try {
    const stored = localStorage.getItem('opencommercelens_session');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || error.message || "Request failed");
  }
  
  return response.json();
}

export function useCatalog(initialFilters = {}) {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [pagination, setPagination] = useState({ limit: 20, offset: 0 });

  /**
   * Fetch products from API
   */
  const fetchProducts = useCallback(async (newFilters = filters, newPagination = pagination) => {
    setLoading(true);
    setError(null);
    
    try {
      // Build query params
      const params = new URLSearchParams();
      
      // Add filters
      if (newFilters.category) params.set("category", newFilters.category);
      if (newFilters.color) params.set("color", newFilters.color);
      if (newFilters.q) params.set("q", newFilters.q);
      if (newFilters.shopId) params.set("shopId", newFilters.shopId);
      if (newFilters.minPrice) params.set("minPrice", String(newFilters.minPrice));
      if (newFilters.maxPrice) params.set("maxPrice", String(newFilters.maxPrice));
      
      // Add pagination
      params.set("limit", String(newPagination.limit));
      params.set("offset", String(newPagination.offset));
      
      const response = await apiRequest(`/catalog?${params.toString()}`);
      
      setProducts(response.products || []);
      setTotal(response.total || 0);
      
      return response;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [filters, pagination]);

  /**
   * Update filters and refetch
   */
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset pagination
  }, []);

  /**
   * Change page
   */
  const setPage = useCallback((page) => {
    const offset = (page - 1) * pagination.limit;
    setPagination(prev => ({ ...prev, offset }));
  }, [pagination.limit]);

  /**
   * Load more (next page)
   */
  const loadMore = useCallback(async () => {
    const newOffset = pagination.offset + pagination.limit;
    if (newOffset >= total) return; // No more pages
    
    setPagination(prev => ({ ...prev, offset: newOffset }));
  }, [pagination, total]);

  // Fetch when filters or pagination change
  useEffect(() => {
    fetchProducts(filters, pagination);
  }, [filters, pagination]);

  /**
   * Get filter params for URL
   */
  const getFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  return {
    products,
    total,
    loading,
    error,
    filters,
    pagination,
    setFilters: updateFilters,
    setPage,
    loadMore,
    refetch: () => fetchProducts(filters, pagination),
    getFilterParams,
    hasMore: pagination.offset + pagination.limit < total,
    currentPage: Math.floor(pagination.offset / pagination.limit) + 1,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

/**
 * useVisualSearch - Hook for visual search (image-based)
 */
export function useVisualSearch() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Search by image URL
   */
  const searchByImage = useCallback(async (imageUrl) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("/visual-search", {
        method: "POST",
        body: JSON.stringify({ imageUrl }),
      });
      
      // Poll for results
      const poll = async (taskId) => {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const status = await apiRequest(`/visual-search/${taskId}`);
          
          if (status.status === "completed") {
            setResults(status.results || []);
            return status.results;
          }
          if (status.status === "failed") {
            throw new Error(status.errorMessage || "Search failed");
          }
        }
        throw new Error("Search timeout");
      };
      
      return await poll(response.taskId);
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    results,
    loading,
    error,
    searchByImage,
  };
}

export default useCatalog;

/**
 * useCategories - Hook for fetching product categories
 */
export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch categories from API
   */
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("/catalog/categories/list");
      setCategories(response.categories || []);
      return response.categories || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    categories,
    loading,
    error,
    fetchCategories,
  };
}


