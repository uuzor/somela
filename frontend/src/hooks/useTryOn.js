/**
 * useTryOn - Hook for managing multi-step try-on flow
 * 
 * Usage:
 *   const { status, currentStep, steps, resultImage, startTryOn, reset } = useTryOn();
 * 
 *   // Start try-on
 *   await startTryOn(productIds, selfieId);
 * 
 *   // Reset for new try-on
 *   reset();
 */

import { useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Get session from localStorage
function getSession() {
  try {
    const stored = localStorage.getItem('opencommercelens_session');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// API helper
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

export function useTryOn() {
  const [status, setStatus] = useState("idle"); // idle | loading | processing | success | error
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [steps, setSteps] = useState([]);
  const [resultImage, setResultImage] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  /**
   * Start multi-step try-on with multiple products
   * @param {string[]} productIds - Array of product IDs to try on
   * @param {string} [selfieId] - Optional selfie ID (uses default if not provided)
   */
  const startTryOn = useCallback(async (productIds, selfieId) => {
    if (!productIds || productIds.length === 0) {
      throw new Error("At least one product is required");
    }

    const userSession = getSession();
    if (!userSession) {
      throw new Error("No session available. Please refresh the page.");
    }

    setStatus("loading");
    setErrorMessage(null);
    setSteps([]);
    setResultImage(null);
    setCurrentStep(0);
    setTotalSteps(productIds.length);

    try {
      const data = await apiRequest("/tryon/multi", {
        method: "POST",
        body: JSON.stringify({ productIds, selfieId }),
      });

      setSessionId(data.sessionId);
      setSteps(data.steps || []);
      setCurrentStep(data.currentStep || 0);
      setTotalSteps(data.totalSteps || productIds.length);

      if (data.status === "success") {
        setResultImage(data.finalResultUrl);
        setStatus("success");
      } else if (data.status === "error") {
        setErrorMessage(data.errorMessage || "Try-on failed");
        setResultImage(data.finalResultUrl);
        setStatus("error");
      } else {
        setStatus("processing");
      }
    } catch (error) {
      console.error("Try-on error:", error);
      setErrorMessage(error.message || "Failed to start try-on");
      setStatus("error");
      throw error;
    }
  }, []);

  /**
   * Start single product try-on
   * @param {string} productId - Product ID to try on
   */
  const startSingleTryOn = useCallback(async (productId) => {
    return startTryOn([productId]);
  }, [startTryOn]);

  /**
   * Reset the try-on state for a new session
   */
  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentStep(0);
    setTotalSteps(0);
    setSteps([]);
    setResultImage(null);
    setSessionId(null);
    setErrorMessage(null);
  }, []);

  /**
   * Get step info for a specific step
   */
  const getStep = useCallback((stepNumber) => {
    return steps.find(s => s.step === stepNumber);
  }, [steps]);

  /**
   * Get the current step info
   */
  const getCurrentStepInfo = useCallback(() => {
    if (currentStep === 0) return null;
    return getStep(currentStep);
  }, [currentStep, getStep]);

  return {
    // State
    status,
    isIdle: status === "idle",
    isLoading: status === "loading",
    isProcessing: status === "processing",
    isSuccess: status === "success",
    isError: status === "error",
    
    currentStep,
    totalSteps,
    steps,
    resultImage,
    sessionId,
    errorMessage,
    
    // Progress helpers
    progress: totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0,
    isMultiStep: totalSteps > 1,
    
    // Actions
    startTryOn,
    startSingleTryOn,
    reset,
    getStep,
    getCurrentStepInfo,
  };
}

/**
 * useSelfies - Hook for managing user selfies
 */
export function useSelfies() {
  const [selfies, setSelfies] = useState([]);
  const [selectedSelfie, setSelectedSelfie] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  /**
   * Fetch user selfies from backend
   */
  const fetchSelfies = useCallback(async () => {
    const session = getSession();
    if (!session) {
      return;
    }

    setIsFetching(true);
    try {
      const data = await apiRequest("/tryon/selfies");
      const fetchedSelfies = data.selfies || [];
      setSelfies(fetchedSelfies)
      
      // Auto-select the first selfie if none selected
      if (fetchedSelfies.length > 0 && !selectedSelfie) {
        setSelectedSelfie(fetchedSelfies[0])
      }
    } catch (err) {
      console.error("Failed to fetch selfies:", err);
    } finally {
      setIsFetching(false);
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Upload a new selfie
   * @param {string} imageUrl - URL of the selfie image
   */
  const uploadSelfie = useCallback(async (imageUrl) => {
    const session = getSession();
    if (!session) {
      throw new Error("No session available");
    }

    setIsLoading(true);
    try {
      const data = await apiRequest("/tryon/selfie", {
        method: "POST",
        body: JSON.stringify({ imageUrl }),
      });

      const newSelfie = {
        id: data.selfieId,
        imageUrl: data.imageUrl,
        processedImageUrl: data.processedImageUrl,
        status: data.status,
      };

      setSelfies(prev => [newSelfie, ...prev]);
      setSelectedSelfie(newSelfie);
      
      return newSelfie;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Select a selfie
   */
  const selectSelfie = useCallback((selfie) => {
    setSelectedSelfie(selfie);
  }, []);

  return {
    selfies,
    selectedSelfie,
    isLoading,
    isFetching,
    uploadSelfie,
    selectSelfie,
    fetchSelfies,
  };
}

export default useTryOn;

