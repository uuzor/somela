import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/lib/AuthContext";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import TopNavigation from "@/components/commerce/TopNavigation";
import Discover from "@/components/commerce/Discover";
import ConversationPanel from "@/components/commerce/ConversationPanel";
import SearchResults from "@/components/commerce/SearchResults";
import ProductDetail from "@/components/commerce/ProductDetail";
import ComparisonView from "@/components/commerce/ComparisonView";
import TryOnStudio from "@/components/commerce/TryOnStudio";
import Checkout from "@/components/commerce/Checkout";
import CheckoutProgress from "@/components/commerce/CheckoutProgress";
import OrderConfirmation from "@/components/commerce/OrderConfirmation";
import MobileTabs from "@/components/commerce/MobileTabs";
import LibraryDrawer from "@/components/commerce/LibraryDrawer";
import PravaApproval from "@/components/commerce/PravaApproval";
import { products, cartSeed, merchantNames } from "@/data/commerceData";
import { normalizeProduct } from "@/services/canvasModel";
import * as api from "@/services/commerceService";
import * as pravaApi from "@/services/paymentsService";
import * as checkoutApi from "@/services/checkoutService";

const initial = [
  {
    id: "hello",
    role: "assistant",
    type: "text",
    text: "Describe a piece, upload a look, or ask me to build an outfit.",
  },
];

const CHAT_STATE_TO_MODE = {
  show_catalog: "results",
  show_product: "product",
  comparison: "comparison",
  tryon: "tryon",
  checkout: "checkout",
  processing: "processing",
  confirmation: "confirmation",
};

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function jobProductsForSignature(job) {
  const values = job?.products?.length
    ? job.products
    : Array.isArray(job?.product)
      ? job.product
      : [job?.product].filter(Boolean);
  return values.map(getProductKey);
}

function tryOnSlot(product) {
  const text = [product?.category, product?.productType, product?.title, product?.name].filter(Boolean).join(" ").toLowerCase();
  if (/dress|gown|jumpsuit|romper/.test(text)) return "full_body";
  if (/pant|jean|trouser|skirt|short|bottom/.test(text)) return "lower_body";
  if (/shoe|sneaker|boot|heel|sandal|loafer/.test(text)) return "shoes";
  return "upper_body";
}

function nextOutfitProducts(parentJob, product) {
  const current = parentJob?.outfitProducts?.length
    ? parentJob.outfitProducts
    : parentJob?.products?.length
      ? parentJob.products
      : [];
  const slot = tryOnSlot(product);
  const replaced = current.filter((item) => {
    const itemSlot = tryOnSlot(item);
    if (itemSlot === slot) return false;
    if (slot === "full_body" && (itemSlot === "upper_body" || itemSlot === "lower_body")) return false;
    if ((slot === "upper_body" || slot === "lower_body") && itemSlot === "full_body") return false;
    return true;
  });
  return [...replaced, product];
}

function getProductKey(product) {
  return product?.id || product?.productId || null;
}

function getProductMerchantUrl(product) {
  return product?.url || product?.merchantUrl || product?.raw?.url || product?.product?.url || "https://example.com";
}

function getProductMerchantCountry(product) {
  return product?.merchantCountry || product?.country || product?.countryCode || "US";
}

function buildCheckoutPurchase(items, override = null) {
  const overrideItems = Array.isArray(override?.items) ? override.items : [];
  const sourceItems = overrideItems.length > 0 ? overrideItems : Array.isArray(items) ? items : [];
  const firstItem = sourceItems[0] || null;

  if (override?.merchantName || override?.merchant || override?.merchantUrl) {
    const normalizedItems = sourceItems.map((item) => ({
      description: item?.description || item?.name || item?.title || "Item",
      name: item?.name || item?.description || item?.title || "Item",
      unitPrice: String(item?.unitPrice ?? item?.price ?? item?.displayPrice ?? item?.minPrice ?? 0),
      quantity: Number(item?.quantity ?? item?.qty ?? 1),
      productId: item?.productId || item?.product?.id || item?.id || null,
      cartItemId: item?.cartItemId || item?.cartId || item?.itemId || null,
      variantId: item?.variantId || null,
      image: item?.image || item?.primaryImage || item?.product?.primaryImage || item?.product?.image || null,
    }));

    const totalAmount = Number(override?.totalAmount ?? override?.total ?? normalizedItems.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0));

    return {
      merchantName: override?.merchantName || override?.merchant || "Prava checkout",
      merchantUrl: override?.merchantUrl || getProductMerchantUrl(firstItem),
      merchantCountry: override?.merchantCountry || getProductMerchantCountry(firstItem),
      currency: override?.currency || firstItem?.currency || "USD",
      totalAmount,
      items: normalizedItems,
    };
  }

  const groups = new Map();
  sourceItems.forEach((item) => {
    const key = item?.merchantName || item?.merchant || item?.vendor || "Prava checkout";
    const next = groups.get(key) || [];
    next.push(item);
    groups.set(key, next);
  });

  const [merchantName, merchantItems] = groups.entries().next().value || ["Prava checkout", sourceItems];
  const normalizedItems = merchantItems.map((item) => ({
    description: item?.description || item?.name || item?.title || "Item",
    name: item?.name || item?.description || item?.title || "Item",
    unitPrice: String(item?.unitPrice ?? item?.price ?? item?.displayPrice ?? item?.minPrice ?? 0),
    quantity: Number(item?.quantity ?? item?.qty ?? 1),
    productId: item?.productId || item?.product?.id || item?.id || null,
    cartItemId: item?.cartItemId || item?.cartId || item?.itemId || null,
    variantId: item?.variantId || null,
    image: item?.image || item?.primaryImage || item?.product?.primaryImage || item?.product?.image || null,
  }));

  const totalAmount = normalizedItems.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0);
  const merchant = merchantItems[0] || firstItem || null;

  return {
    merchantName,
    merchantUrl: getProductMerchantUrl(merchant),
    merchantCountry: getProductMerchantCountry(merchant),
    currency: merchant?.currency || "USD",
    totalAmount,
    items: normalizedItems,
  };
}

function normalizeCatalogResults(items) {
  return (Array.isArray(items) ? items : []).map((item) => normalizeProduct(item)).filter(Boolean);
}

function getProductText(product) {
  return [
    product?.title,
    product?.name,
    product?.category,
    product?.merchant,
    product?.color,
    product?.size,
    ...(Array.isArray(product?.tags) ? product.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterCatalogProducts(items, filters = {}) {
  const colors = Array.isArray(filters.colors) ? filters.colors : [];
  const sizes = Array.isArray(filters.sizes) ? filters.sizes : [];
  const maxPrice = filters.maxPrice ?? null;
  const sort = filters.sort || "best_match";
  console.log(items, "items")
  const filtered = (Array.isArray(items) ? items : []).filter((product) => {
    const text = getProductText(product);
    const colorMatch = colors.length === 0 || colors.some((color) => text.includes(String(color).toLowerCase()));
    const sizeMatch = sizes.length === 0 || sizes.some((size) => text.includes(String(size).toLowerCase()));
    const priceValue = Number(product?.minPrice ?? product?.price ?? NaN);
    const priceMatch = maxPrice === null || !Number.isFinite(priceValue) || priceValue <= maxPrice;
    // console.log(colors.length, sizes.length, maxPrice, colorMatch, sizeMatch, priceMatch, "filtering")
    // products have no color and sizes now so we will use priceonly for now
    return  priceMatch;
  });
  console.log(filtered, "filtered")

  const sorted = [...filtered];
  if (sort === "price_low") {
    sorted.sort((a, b) => Number(a?.minPrice ?? a?.price ?? Number.POSITIVE_INFINITY) - Number(b?.minPrice ?? b?.price ?? Number.POSITIVE_INFINITY));
  } else if (sort === "price_high") {
    sorted.sort((a, b) => Number(b?.minPrice ?? b?.price ?? Number.NEGATIVE_INFINITY) - Number(a?.minPrice ?? a?.price ?? Number.NEGATIVE_INFINITY));
  }

  return sorted;
}

function normalizeAssistantMessage(message) {
  const text = typeof message?.text === "string" ? message.text : "";
  return {
    id: message?.id || randomId("assistant"),
    role: "assistant",
    type: message?.type || "text",
    text,
    toolCalls: Array.isArray(message?.toolCalls) ? message.toolCalls : [],
    products: Array.isArray(message?.products) ? message.products : undefined,
    image: message?.image,
  };
}

const DEFAULT_FILTERS = {
  colors: ["black"],
  maxPrice: 120,
  sizes: ["M"],
  shipToNigeria: true,
  sort: "best_match",
};

const SORT_ORDER = ["best_match", "price_low", "price_high", "newest"];

export default function OpenCommerceLens() {
  const [mode, setMode] = useState("discover");
  const { session: appSession, user: authUser, logout } = useAuth();
  const [fallbackSessionId] = useState(() => randomId("session"));
  const sessionId = appSession?.sessionId || fallbackSessionId;
  const userId = authUser?.id || appSession?.userId;
  const [query, setQuery] = useState("");
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState(initial);
  const [visible, setVisible] = useState([]);
  const [selected, setSelected] = useState();
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [comparisonProducts, setComparisonProducts] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reference, setReference] = useState();
  const [jobs, setJobs] = useState([]);
  const [activeTryOnId, setActiveTryOnId] = useState(null);
  const [cart, setCart] = useState(cartSeed);
  const [savedProducts, setSavedProducts] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState("cart");
  const [progress, setProgress] = useState(0);
  const [orders, setOrders] = useState([]);
  const [pendingPurchase, setPendingPurchase] = useState(null);
  const [approvalSession, setApprovalSession] = useState(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("idle");
  const [paymentSuccessOpen, setPaymentSuccessOpen] = useState(false);
  const [paymentSuccessStatus, setPaymentSuccessStatus] = useState("approved");
  const [checkouts, setCheckouts] = useState([]);
  const [checkoutsLoading, setCheckoutsLoading] = useState(false);
  const [checkoutsError, setCheckoutsError] = useState("");
  const [activeCheckout, setActiveCheckout] = useState(null);
  const [tab, setTab] = useState("canvas");
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const reduce = useReducedMotion();
  const assistantDraftId = useRef(null);
  const tryOnControllersRef = useRef(new Map());
  const paymentSuccessTimerRef = useRef(null);
  const hydrationOwnerRef = useRef(null);
  const approvalHandledRef = useRef(new Set());
  const paidHandledRef = useRef(new Set());
  const displayedProducts = useMemo(() => filterCatalogProducts(visible, filters), [visible, filters]);
  const cartCount = useMemo(() => (Array.isArray(cart) ? cart.reduce((sum, item) => sum + Number(item?.qty ?? item?.quantity ?? 1), 0) : 0), [cart]);
  const savedCount = useMemo(() => (Array.isArray(savedProducts) ? savedProducts.length : 0), [savedProducts]);
  const activeCheckoutCount = useMemo(
    () => checkoutApi.groupCheckoutsByGroupId(checkouts).filter((group) => group.checkouts.some((checkout) => checkoutApi.ACTIVE_CHECKOUT_STATUSES.has(checkout.status))).length,
    [checkouts]
  );
  const cartProductIds = useMemo(() => (Array.isArray(cart) ? cart.map((item) => item?.productId || getProductKey(item?.product || item)).filter(Boolean) : []), [cart]);
  const savedProductIds = useMemo(() => (Array.isArray(savedProducts) ? savedProducts.map((item) => item?.productId || getProductKey(item?.product || item)).filter(Boolean) : []), [savedProducts]);
  const selectedProducts = useMemo(() => {
    const byId = new Map(visible.map((product) => [getProductKey(product), product]));
    return selectedProductIds.map((id) => byId.get(id)).filter(Boolean);
  }, [selectedProductIds, visible]);
  const activeTryOn = useMemo(() => jobs.find((job) => job.id === activeTryOnId) || null, [activeTryOnId, jobs]);
  const dockActiveTryOn = useMemo(() => {
    if (!activeTryOn || !selectedProducts.length) return null;
    const selectedSignature = selectedProducts.map(getProductKey).filter(Boolean).sort().join("|");
    const jobSignature = (activeTryOn.productIds?.length ? activeTryOn.productIds : jobProductsForSignature(activeTryOn))
      .filter(Boolean)
      .sort()
      .join("|");
    return selectedSignature === jobSignature ? activeTryOn : null;
  }, [activeTryOn, selectedProducts]);
  const primarySelected = selectedProducts[0] || selected || visible[0] || null;
  const checkoutPurchase = useMemo(() => buildCheckoutPurchase(cart, pendingPurchase), [cart, pendingPurchase]);
  const showPaymentNotice = (status) => {
    setPaymentSuccessStatus(status);
    setApprovalOpen(false);
    setPaymentSuccessOpen(status === "paid");
    if (status !== "paid") {
      toast({
        title: "Payment approved",
        description: "Prava approved the payment. Merchant confirmation is pending.",
        duration: 5000,
      });
    }

    if (paymentSuccessTimerRef.current) {
      clearTimeout(paymentSuccessTimerRef.current);
    }

    if (status === "paid") {
      paymentSuccessTimerRef.current = setTimeout(() => {
        setPaymentSuccessOpen(false);
      }, 1200);
    }
  };

  const refreshCheckouts = async () => {
    if (!userId) {
      setCheckouts([]);
      return [];
    }

    setCheckoutsLoading(true);
    setCheckoutsError("");
    try {
      const response = await checkoutApi.listCheckouts({ userId, limit: 50 });
      const rows = Array.isArray(response?.checkouts) ? response.checkouts : [];
      const normalizedRows = rows.map((checkout) => ({ ...checkout, status: checkoutApi.normalizeCheckoutStatus(checkout.status) }));
      setCheckouts(normalizedRows);
      setActiveCheckout((current) => {
        if (current?.id) return normalizedRows.find((checkout) => checkout.id === current.id) || current;
        return normalizedRows.find((checkout) => checkoutApi.ACTIVE_CHECKOUT_STATUSES.has(checkout.status)) || null;
      });
      return rows;
    } catch (error) {
      setCheckoutsError(error instanceof Error ? error.message : "Failed to load checkout history");
      return [];
    } finally {
      setCheckoutsLoading(false);
    }
  };

  const openLibrary = (tabName = "cart") => {
    setLibraryTab(tabName);
    setLibraryOpen(true);
    if (tabName === "checkouts") refreshCheckouts();
  };

  const refreshLibrary = async () => {
    const ownerKey = userId ? `user:${userId}` : `session:${sessionId}`;
    hydrationOwnerRef.current = ownerKey;

    try {
      const [nextCart, nextSaved] = await Promise.all([
        api.fetchCartItems({ sessionId, userId }),
        api.fetchSavedProducts({ sessionId, userId }),
      ]);

      if (hydrationOwnerRef.current !== ownerKey) return;
      setCart(Array.isArray(nextCart) ? nextCart : userId || sessionId ? [] : cartSeed);
      setSavedProducts(Array.isArray(nextSaved) ? nextSaved : []);
    } catch {
      if (hydrationOwnerRef.current !== ownerKey) return;
      setCart(userId || sessionId ? [] : cartSeed);
      setSavedProducts([]);
    }
  };

  useEffect(() => {
    let alive = true;
    const ownerKey = userId ? `user:${userId}` : `session:${sessionId}`;
    hydrationOwnerRef.current = ownerKey;

    if (userId) {
      setCart([]);
      setSavedProducts([]);
      setCheckouts([]);
    } else {
      setCart(cartSeed);
      setSavedProducts([]);
      setCheckouts([]);
    }
    setActiveCheckout(null);
    setApprovalSession(null);
    setPendingPurchase(null);
    setApprovalOpen(false);
    setApprovalStatus("idle");
    setApprovalError("");
    setPaymentSuccessOpen(false);
    approvalHandledRef.current.clear();
    paidHandledRef.current.clear();

    const hydrateLibrary = async () => {
      const [nextCart, nextSaved, checkoutResponse] = await Promise.all([
        api.fetchCartItems({ sessionId, userId }),
        api.fetchSavedProducts({ sessionId, userId }),
        userId ? checkoutApi.listCheckouts({ userId, limit: 50 }) : Promise.resolve({ checkouts: [] }),
      ]);

      if (!alive || hydrationOwnerRef.current !== ownerKey) return;
      setCart(Array.isArray(nextCart) ? nextCart : userId || sessionId ? [] : cartSeed);
      setSavedProducts(Array.isArray(nextSaved) ? nextSaved : []);
      const nextCheckouts = Array.isArray(checkoutResponse?.checkouts) ? checkoutResponse.checkouts : [];
      const normalizedCheckouts = nextCheckouts.map((checkout) => ({ ...checkout, status: checkoutApi.normalizeCheckoutStatus(checkout.status) }));
      normalizedCheckouts.forEach((checkout) => {
        if (!checkout?.id) return;
        approvalHandledRef.current.add(checkout.id);
        paidHandledRef.current.add(checkout.id);
      });
      setCheckouts(normalizedCheckouts);
      setActiveCheckout(normalizedCheckouts.find((checkout) => checkoutApi.ACTIVE_CHECKOUT_STATUSES.has(checkout.status)) || null);
    };

    hydrateLibrary().catch(() => {
      if (!alive || hydrationOwnerRef.current !== ownerKey) return;
      setCart(userId || sessionId ? [] : cartSeed);
      setSavedProducts([]);
      setCheckouts([]);
    });

    return () => {
      alive = false;
    };
  }, [sessionId, userId]);

  const search = async () => {
    if (!query && !reference) return;
    setResultsLoading(true);
    setMode("searching");
    setMessages((current) => [
      ...current,
      {
        id: randomId("user"),
        role: "user",
        type: reference ? "image" : "text",
        text: query || "Find products like this image.",
        image: reference,
      },
    ]);

    const results = await api.searchProducts();
    applyCatalogResults(results);
    setMessages((current) => [
      ...current,
      {
        id: randomId("assistant"),
        role: "assistant",
        type: "search",
        text: "I found 86 close matches across 8 merchants. The first options preserve the cropped silhouette and wide collar.",
        products: results.slice(0, 3),
        toolCalls: [
          {
            id: "tc1",
            label: "Analyzing reference image",
            actions: 3,
            iconCount: 3,
            logs: [
              "1024 dims extracted from reference",
              "Color palette: warm earth tones detected",
              "Silhouette: cropped jacket confirmed",
            ],
          },
          {
            id: "tc2",
            label: "Searching merchant catalogs",
            actions: 4,
            iconCount: 2,
            logs: [
              "Queried 8 merchant catalogs",
              "86 visual matches found",
              "Sorted by similarity score",
              "Availability checked",
            ],
          },
        ],
      },
    ]);
    setSuggestedTasks([
      "Try on the closest match",
      "Compare top 3 matches",
      "Show options under $100",
    ]);
    setMode("results");
  };

  const applyCatalogResults = (items) => {
    const next = normalizeCatalogResults(items);
    setVisible(next);
    setResultsLoading(false);
    setComparisonProducts([]);
    setSelectedProductIds((current) => {
      const availableIds = new Set(next.map((product) => getProductKey(product)).filter(Boolean));
      const kept = current.filter((id) => availableIds.has(id));
      const nextIds = kept.length > 0 ? kept : next.slice(0, 1).map((product) => getProductKey(product)).filter(Boolean);
      const nextPrimary = nextIds[0] ? next.find((product) => getProductKey(product) === nextIds[0]) : null;
      setSelected(nextPrimary || null);
      return nextIds;
    });
    upsertAssistantDraft({
      products: next,
    });
  };
  const toggleFilter = (kind, value) => {
    setFilters((current) => {
      if (kind === "color") {
        const colors = Array.isArray(current.colors) ? current.colors : [];
        return {
          ...current,
          colors: colors.includes(value) ? colors.filter((item) => item !== value) : [...colors, value],
        };
      }
      if (kind === "price") {
        return {
          ...current,
          maxPrice: current.maxPrice === value ? null : value,
        };
      }
      if (kind === "size") {
        const sizes = Array.isArray(current.sizes) ? current.sizes : [];
        return {
          ...current,
          sizes: sizes.includes(value) ? sizes.filter((item) => item !== value) : [...sizes, value],
        };
      }
      if (kind === "shipping") {
        return {
          ...current,
          shipToNigeria: !current.shipToNigeria,
        };
      }
      return current;
    });
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const cycleSort = () => {
    setFilters((current) => {
      const index = SORT_ORDER.indexOf(current.sort || "best_match");
      const nextSort = SORT_ORDER[(index + 1) % SORT_ORDER.length];
      return { ...current, sort: nextSort };
    });
  };

  const toggleSelectedProduct = (product) => {
    const normalized = normalizeProduct(product);
    const id = getProductKey(normalized);
    if (!id) return;

    setSelectedProductIds((current) => {
      const exists = current.includes(id);
      if (!exists && current.length >= 5) {
        toast({
          title: "Fitting dock is full",
          description: "Virtual try-on supports up to five garments at a time.",
        });
        return current;
      }
      const next = exists ? current.filter((item) => item !== id) : [...current, id];
      const nextPrimary = next[0] ? visible.find((item) => getProductKey(item) === next[0]) : null;
      setSelected(nextPrimary || null);
      return next;
    });
  };

  const openComparison = (items = selectedProducts) => {
    const shortlist = Array.isArray(items) ? items.filter(Boolean) : [];
    const nextComparison = shortlist.length >= 2 ? shortlist.slice(0, 3) : displayedProducts.slice(0, 3);
    setComparisonProducts(nextComparison);
    setMode("comparison");
  };

  const upsertLocalCartItem = (product, options = {}) => {
    const normalized = normalizeProduct(product);
    const productId = getProductKey(normalized);
    if (!productId) return;

    const quantityDelta = options.decrement ? -1 : Number(options.quantity ?? 1);
    setCart((current) => {
      const index = current.findIndex((item) => getProductKey(item?.product || item) === productId || item?.productId === productId);
      if (index < 0) {
        if (quantityDelta <= 0) return current;
        return [...current, {
          id: randomId("cart"),
          productId,
          qty: quantityDelta,
          quantity: quantityDelta,
          product: normalized,
        }];
      }

      const next = [...current];
      const existing = next[index];
      const existingQty = Number(existing?.qty ?? existing?.quantity ?? 1);
      const nextQty = Math.max(0, existingQty + quantityDelta);
      if (nextQty === 0) {
        next.splice(index, 1);
      } else {
        next[index] = {
          ...existing,
          qty: nextQty,
          quantity: nextQty,
          product: existing?.product || normalized,
          productId,
        };
      }
      return next;
    });
  };

  const handleAddToCart = async (product, options = {}) => {
    const normalized = normalizeProduct(product);
    const productId = getProductKey(normalized);
    if (!productId) return;

    try {
      const saved = await api.addToCart(normalized, { sessionId, userId, quantity: options?.quantity ?? 1, variantId: options?.variantId });
      setCart((current) => {
        const next = [...current];
        const nextProductId = getProductKey(saved?.product || normalized);
        const index = next.findIndex((item) => item?.productId === nextProductId || getProductKey(item?.product || item) === nextProductId);
        if (index < 0) {
          return [...next, saved];
        }
        next[index] = saved;
        return next;
      });
      await refreshLibrary();
    } catch (error) {
      console.error("Add to cart failed:", error);
      toast({
        title: "Could not add to cart",
        description: "The item was not saved to the backend.",
      });
    }
  };
  const handleSaveProduct = async (product) => {
    const normalized = normalizeProduct(product);
    const productId = getProductKey(normalized);
    if (!productId) return;

    try {
      await api.saveProduct(normalized, { sessionId, userId });
      await refreshLibrary();
    } catch (error) {
      console.error("Save product failed:", error);
      toast({
        title: "Could not save product",
        description: "The item was not saved to the backend.",
      });
    }
  };

  const handleToggleSaved = async (product) => {
    const normalized = normalizeProduct(product);
    const productId = getProductKey(normalized);
    if (!productId) return;

    const exists = savedProductIds.includes(productId);
    try {
      if (exists) {
        await api.removeSavedProduct(productId, { sessionId, userId });
      } else {
        await api.saveProduct(normalized, { sessionId, userId });
      }
      await refreshLibrary();
    } catch (error) {
      console.error("Toggle saved failed:", error);
      toast({
        title: exists ? "Could not remove saved item" : "Could not save product",
        description: "Please try again.",
      });
    }
  };

  const handleRemoveSavedProduct = async (productId) => {
    if (!productId) return;
    try {
      await api.removeSavedProduct(productId, { sessionId, userId });
      await refreshLibrary();
    } catch (error) {
      console.error("Remove saved product failed:", error);
      toast({
        title: "Could not remove saved item",
        description: "Please try again.",
      });
    }
  };

  const handleUpdateCartQuantity = async (item, quantity) => {
    const itemId = item?.cartId || item?.itemId || item?.id;
    const nextQty = Number(quantity);
    if (!itemId) return;

    try {
      if (nextQty < 1) {
        await api.removeCartItem(itemId, { sessionId, userId });
      } else {
        await api.updateCartItemQuantity(itemId, nextQty, { sessionId, userId });
      }
      await refreshLibrary();
    } catch (error) {
      console.error("Update cart quantity failed:", error);
      toast({
        title: "Could not update cart",
        description: "Please try again.",
      });
    }
  };

  const handleRemoveCartItem = async (itemId) => {
    if (!itemId) return;
    try {
      await api.removeCartItem(itemId, { sessionId, userId });
      await refreshLibrary();
    } catch (error) {
      console.error("Remove cart item failed:", error);
      toast({
        title: "Could not remove cart item",
        description: "Please try again.",
      });
    }
  };
  const upload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setReference(url);
    setQuery("Find products similar to this look");
  };

  const upsertAssistantDraft = (patch) => {
    const id = assistantDraftId.current || randomId("assistant");
    assistantDraftId.current = id;

    setMessages((current) => {
      const next = [...current];
      const existingIndex = next.findIndex((message) => message.id === id);
      const existing = existingIndex >= 0
        ? next[existingIndex]
        : normalizeAssistantMessage({ id, role: "assistant", type: "text" });

      const updated = {
        ...existing,
        ...patch,
        id,
        role: "assistant",
        type: patch.type || existing.type || "text",
        toolCalls: patch.toolCalls ?? existing.toolCalls ?? [],
      };

      if (existingIndex >= 0) {
        next[existingIndex] = updated;
      } else {
        next.push(updated);
      }

      return next;
    });
  };

  const appendToolCall = (toolCall) => {
    const entry = {
      id: toolCall.id || randomId("tool"),
      label: toolCall.label || toolCall.name || "Tool call",
      actions: typeof toolCall.actions === "number" ? toolCall.actions : 1,
      iconCount: typeof toolCall.iconCount === "number" ? toolCall.iconCount : 2,
      logs: toolCall.logs || [],
    };

    setMessages((current) => {
      const next = [...current];
      const id = assistantDraftId.current;
      const index = next.findIndex((message) => message.id === id);
      if (index < 0) {
        return next;
      }

      const message = next[index];
      next[index] = {
        ...message,
        toolCalls: [...(message.toolCalls || []), entry],
      };
      return next;
    });
  };

  const appendToolResult = (toolName, result) => {
    const payload = typeof result === "string" ? result : JSON.stringify(result);

    setMessages((current) => {
      const next = [...current];
      const id = assistantDraftId.current;
      const index = next.findIndex((message) => message.id === id);
      if (index < 0) {
        return next;
      }

      const message = next[index];
      const toolCalls = [...(message.toolCalls || [])];
      if (toolCalls.length === 0) {
        toolCalls.push({
          id: randomId("tool"),
          label: toolName.replace(/_/g, " "),
          actions: 1,
          iconCount: 2,
          logs: [payload],
        });
      } else {
        const lastIndex = toolCalls.length - 1;
        const last = toolCalls[lastIndex];
        toolCalls[lastIndex] = {
          ...last,
          label: toolName.replace(/_/g, " "),
          logs: [...(last.logs || []), payload],
        };
      }

      next[index] = {
        ...message,
        toolCalls,
      };
      return next;
    });
  };

  const send = async (textArg, imageUrlArg) => {
    const resolvedText = typeof textArg === "string" ? textArg : chat;
    const imageUrl = typeof imageUrlArg === "string" && imageUrlArg ? imageUrlArg : null;
    const messageText = resolvedText.trim() || (imageUrl ? "Find products similar to this image." : "");

    if ((!messageText && !imageUrl) || isStreaming) return;

    setChat("");
    setIsStreaming(true);
    setResultsLoading(true);
    setSuggestedTasks([]);
    assistantDraftId.current = null;

    setMessages((current) => [
      ...current,
      {
        id: randomId("user"),
        role: "user",
        type: imageUrl ? "image" : "text",
        text: messageText,
        image: imageUrl || undefined,
      },
    ]);

    try {
      await api.streamChatMessage(messageText, { sessionId, userId, imageUrl }, {
        onEvent: (event) => {
          if (event.event === "connected") {
            if (event.data?.state && CHAT_STATE_TO_MODE[event.data.state]) {
              setMode(CHAT_STATE_TO_MODE[event.data.state]);
            }
            return;
          }

          if (event.event === "text") {
            upsertAssistantDraft({
              type: "text",
              text: event.data,
            });
            return;
          }

          if (event.event === "tool_call") {
            const toolName = event.data?.name || "tool";
            appendToolCall({
              id: event.data?.id || randomId("tool"),
              label: toolName.replace(/_/g, " "),
              actions: 1,
              iconCount: 2,
              logs: ["Calling backend tool"],
            });
            return;
          }

          if (event.event === "tool_result") {
            const toolName = event.data?.name || "tool";
            appendToolResult(toolName, event.data?.result);
            return;
          }

          if (event.event === "ui_state") {
            const nextState = event.data?.state;
            const nextMode = CHAT_STATE_TO_MODE[nextState];
            if (nextMode) {
              setMode(nextMode);
            }
            if (nextState === "chat" || nextState === "clarify") {
              setTab("chat");
            }
            return;
          }

          if (event.event === "ui_payload") {
            if (event.data?.type === "replace_catalog") {
              const next = Array.isArray(event.data.products) ? event.data.products : [];
              applyCatalogResults(next);
              setSuggestedTasks([
                "Try on the closest match",
                "Compare top 3 matches",
                "Show options under $100",
              ]);
              if (mode === "discover") {
                setMode("results");
              }
            }
            if (event.data?.type === "show_product") {
              const nextProduct = normalizeProduct(event.data.product);
              const nextId = getProductKey(nextProduct);
              setSelected(nextProduct);
              if (nextId) {
                setSelectedProductIds([nextId]);
              }
              setMode("product");
            }
            if (event.data?.type === "confirm_purchase") {
              setPendingPurchase(event.data.purchase || null);
              setMode("checkout");
            }
            if (event.data?.type === "payment_pending") {
              const paymentSessionId = event.data.purchaseIntentId || pendingPurchase?.paymentSessionId || pendingPurchase?.purchaseIntentId || null;
              const nextSession = {
                ...(pendingPurchase || {}),
                id: paymentSessionId,
                paymentSessionId,
                providerSessionId: event.data.providerSessionId || pendingPurchase?.providerSessionId || null,
                approvalUrl: event.data.approvalUrl || pendingPurchase?.approvalUrl || null,
                status: "pending_approval",
              };
              setPendingPurchase((current) => ({ ...(current || {}), ...nextSession }));
              setApprovalSession(nextSession);
              setApprovalStatus("awaiting_approval");
              setApprovalOpen(true);
              setMode("checkout");
            }
            return;
          }

          if (event.event === "ui_action" && event.data?.type === "suggest_try_on") {
            setSelected(primarySelected || visible[0] || products[0]);
            return;
          }

          if (event.event === "done") {
            const doneUiPayload = event.data?.uiPayload;
            if (doneUiPayload?.type === "replace_catalog" && Array.isArray(doneUiPayload.products)) {
              applyCatalogResults(doneUiPayload.products);
            }
            if (event.data?.reply) {
              upsertAssistantDraft({
                text: event.data.reply,
              });
            }

            if (event.data?.chatState && CHAT_STATE_TO_MODE[event.data.chatState]) {
              setMode(CHAT_STATE_TO_MODE[event.data.chatState]);
            }

            assistantDraftId.current = null;
          }
        },
      });
    } catch (error) {
      upsertAssistantDraft({
        text: error instanceof Error ? error.message : "Chat failed",
      });
      assistantDraftId.current = null;
    } finally {
      setIsStreaming(false);
      setResultsLoading(false);
    }
  };
  const updateTryOnJob = (jobId, patch) => {
    setJobs((current) => current.map((item) => (item.id === jobId ? { ...item, ...patch } : item)));
  };

  const runTryOn = async (nextProduct, selfie, placeholderId, parentJob = null) => {
    const outfitProducts = nextOutfitProducts(parentJob, nextProduct);
    let activeJobId = placeholderId;
    try {
      const selfieId = selfie?.id || selfie?.selfieId;
      const job = await api.startTryOn(nextProduct, {
        userId,
        selfieId,
        selfie,
        parentTaskId: parentJob?.id,
        outfitProducts,
      });
      activeJobId = job.id;
      setActiveTryOnId(job.id);
      setJobs((current) => [
        { ...job, product: nextProduct, products: [nextProduct], outfitProducts, selfie },
        ...current.filter((item) => item.id !== placeholderId && item.id !== job.id),
      ]);

      const controller = new AbortController();
      tryOnControllersRef.current.set(job.id, controller);
      await api.pollTryOnStatus(job, {
        userId,
        signal: controller.signal,
        onUpdate: (next) => updateTryOnJob(job.id, {
          ...next,
          product: nextProduct,
          products: [nextProduct],
          outfitProducts,
          selfie,
        }),
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      updateTryOnJob(activeJobId, {
        status: "failed",
        stage: "failed",
        errorMessage: error instanceof Error ? error.message : "Try-on failed",
      });
    } finally {
      tryOnControllersRef.current.delete(activeJobId);
    }
  };

  const startTry = async (product) => {
    if (Array.isArray(product)) {
      const wardrobe = product.filter(Boolean).slice(0, 5);
      if (!wardrobe.length) return;
      setSelected(wardrobe[0]);
      setMode("tryon");
      return;
    }
    const nextProduct = product || primarySelected || selected || products[0];
    if (!nextProduct) return;
    if (activeTryOn && !["completed", "failed", "needs_selfie"].includes(activeTryOn.status)) {
      toast({ title: "Try-on in progress", description: "Wait for the current item to finish before adding another." });
      setMode("tryon");
      return;
    }
    const parentJob = activeTryOn?.status === "completed" ? activeTryOn : null;

    setSelected(nextProduct);
    setMode("tryon");
    const placeholderId = randomId("tryon");
    setActiveTryOnId(placeholderId);
    setJobs((current) => [{
      id: placeholderId,
      product: nextProduct,
      products: [nextProduct],
      outfitProducts: nextOutfitProducts(parentJob, nextProduct),
      productIds: [getProductKey(nextProduct)].filter(Boolean),
      parentTaskId: parentJob?.id || null,
      status: "starting",
      stage: "queued",
      currentStep: 0,
      totalSteps: 1,
    }, ...current]);

    try {
      if (parentJob) {
        await runTryOn(nextProduct, parentJob.selfie || null, placeholderId, parentJob);
        return;
      }
      const selfies = await api.listTryOnSelfies({ userId });
      let selfie = selfies.find((item) => item.isDefault) || selfies[0];
      if (!selfie) {
        updateTryOnJob(placeholderId, { status: "needs_selfie" });
        return;
      }
      if (selfie.status === "failed") {
        updateTryOnJob(placeholderId, { status: "needs_selfie", selfie, errorMessage: selfie.errorMessage });
        return;
      }
      if (selfie.status === "processing") {
        updateTryOnJob(placeholderId, { status: "selfie_processing", selfie });
        selfie = await api.waitForSelfie(selfie.id, { userId });
      }
      await runTryOn(nextProduct, selfie, placeholderId);
    } catch (error) {
      updateTryOnJob(placeholderId, {
        status: "failed",
        stage: "failed",
        errorMessage: error instanceof Error ? error.message : "Unable to start try-on",
      });
    }
  };

  const uploadTryOnSelfie = async (file) => {
    const currentJob = jobs.find((job) => job.id === activeTryOnId);
    const nextProduct = currentJob?.products?.[0]
      ? currentJob.products[0]
      : selectedProducts.length
        ? selectedProducts[0]
        : selected || primarySelected || products[0];
    const existing = currentJob && ["needs_selfie", "failed"].includes(currentJob.status) ? currentJob : null;
    const placeholderId = existing?.id || randomId("tryon");
    if (!existing) {
      setActiveTryOnId(placeholderId);
      setJobs((current) => [{
        id: placeholderId,
        product: nextProduct,
        products: [nextProduct],
        outfitProducts: [nextProduct],
        productIds: [getProductKey(nextProduct)].filter(Boolean),
        status: "selfie_processing",
        totalSteps: 1,
      }, ...current]);
    } else {
      updateTryOnJob(placeholderId, { status: "selfie_processing", errorMessage: null });
    }

    try {
      let selfie = await api.uploadTryOnSelfie(file, { userId });
      updateTryOnJob(placeholderId, { selfie });
      if (selfie.status === "processing") {
        selfie = await api.waitForSelfie(selfie.selfieId, { userId });
      }
      await runTryOn(nextProduct, selfie, placeholderId);
    } catch (error) {
      updateTryOnJob(placeholderId, {
        status: "failed",
        stage: "failed",
        errorMessage: error instanceof Error ? error.message : "Selfie upload failed",
      });
    }
  };

  const startTask = (index) => {
    setSuggestedTasks([]);
    if (index === 0) startTry(primarySelected || selected || products[0]);
    else if (index === 1) openComparison(selectedProducts.length >= 2 ? selectedProducts : displayedProducts.slice(0, 3));
    else if (index === 2) {
      setMessages((current) => [
        ...current,
        {
          id: randomId("user"),
          role: "user",
          type: "text",
          text: "Show options under $100",
        },
      ]);
      setVisible((current) => current.filter((product) => product.price < 100));
    }
  };

  const mergeCheckout = (checkout) => {
    if (!checkout?.id) return;
    const normalized = { ...checkout, status: checkoutApi.normalizeCheckoutStatus(checkout.status) };
    setCheckouts((current) => {
      const index = current.findIndex((item) => item.id === normalized.id);
      if (index < 0) return [normalized, ...current];
      const next = [...current];
      next[index] = { ...next[index], ...normalized };
      return next;
    });
  };

  const removeSelectedProduct = (product) => {
    const id = getProductKey(product);
    if (!id) return;
    setSelectedProductIds((current) => {
      const next = current.filter((item) => item !== id);
      const nextPrimary = next[0] ? visible.find((item) => getProductKey(item) === next[0]) : null;
      setSelected(nextPrimary || null);
      return next;
    });
  };

  const clearSelectedProducts = () => {
    setSelectedProductIds([]);
    setSelected(null);
  };

  const handleCheckoutTransition = async (checkout) => {
    if (!checkout?.id) return;
    const status = checkoutApi.normalizeCheckoutStatus(checkout.status);
    const nextCheckout = { ...checkout, status };
    mergeCheckout(nextCheckout);
    setActiveCheckout(nextCheckout);
    setApprovalStatus(status);

    if (status === "approved" && !approvalHandledRef.current.has(checkout.id)) {
      approvalHandledRef.current.add(checkout.id);
      showPaymentNotice("approved");
      setTab("chat");
      setMode((current) => current === "checkout" || current === "processing" ? (visible.length ? "results" : "discover") : current);
      setMessages((current) => [
        ...current,
        {
          id: `checkout-approved-${checkout.id}`,
          role: "assistant",
          type: "text",
          text: `Prava approved ${checkout.currency || "USD"} ${Number(checkout.total || 0).toFixed(2)} for ${checkout.merchantName || "your checkout"}. Merchant confirmation is still pending.`,
        },
      ]);
    }

    if (status === "paid" && !paidHandledRef.current.has(checkout.id)) {
      paidHandledRef.current.add(checkout.id);
      showPaymentNotice("paid");
      setTab("chat");
      const cartItemIds = [...new Set((checkout.items || []).map((item) => item?.cartItemId).filter(Boolean))];
      if (cartItemIds.length > 0) {
        await Promise.allSettled(cartItemIds.map((itemId) => api.removeCartItem(itemId, { sessionId, userId })));
        await refreshLibrary();
      }
      setMessages((current) => [
        ...current,
        {
          id: `checkout-paid-${checkout.id}`,
          role: "assistant",
          type: "text",
          text: `Payment completed for ${checkout.merchantName || "your checkout"}. Your order total was ${checkout.currency || "USD"} ${Number(checkout.total || 0).toFixed(2)}.`,
        },
      ]);
    }

    if (status === "failed") {
      setApprovalError(checkout.failureMessage || "The merchant payment failed. Your cart is unchanged.");
    }
  };

  const syncCheckoutRecord = async (checkout = activeCheckout) => {
    if (!checkout?.id) return null;
    try {
      const result = await checkoutApi.syncCheckout(checkout.id, { userId });
      const nextCheckout = result?.checkout;
      if (nextCheckout) await handleCheckoutTransition(nextCheckout);
      return nextCheckout || null;
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Failed to synchronize checkout");
      return null;
    }
  };

  const approve = async (purchaseOverride = null) => {
    const hasPurchaseOverride = Boolean(purchaseOverride?.merchantName || purchaseOverride?.merchantUrl);
    const targetPurchase = hasPurchaseOverride ? buildCheckoutPurchase([], purchaseOverride) : checkoutPurchase;
    if (!targetPurchase) {
      setApprovalError("No checkout details available.");
      return;
    }

    const existingPaymentSessionId = approvalSession?.id || pendingPurchase?.paymentSessionId || pendingPurchase?.purchaseIntentId || null;
    const existingApprovalUrl = approvalSession?.approvalUrl || pendingPurchase?.approvalUrl || null;
    const canReuseExisting = !hasPurchaseOverride
      && existingPaymentSessionId
      && existingApprovalUrl
      && !["failed", "expired", "cancelled", "paid"].includes(checkoutApi.normalizeCheckoutStatus(approvalStatus));

    if (canReuseExisting) {
      const existingSession = {
        ...(pendingPurchase || {}),
        ...(approvalSession || {}),
        id: existingPaymentSessionId,
        approvalUrl: existingApprovalUrl,
      };
      setApprovalSession(existingSession);
      setApprovalStatus("awaiting_approval");
      setApprovalOpen(true);
      setMode("checkout");
      return;
    }

    setApprovalError("");
    setApprovalLoading(true);

    try {
      const response = await pravaApi.createPravaPaymentSession(
        {
          merchantName: targetPurchase.merchantName,
          merchantUrl: targetPurchase.merchantUrl,
          merchantCountry: targetPurchase.merchantCountry,
          totalAmount: Number(targetPurchase.totalAmount || 0),
          currency: targetPurchase.currency || "USD",
          metadata: {
            items: targetPurchase.items || [],
          },
        },
        { sessionId, userId }
      );

      const createdSession = response?.paymentSession || response;
      setApprovalSession(createdSession || null);
      setPendingPurchase((current) => ({
        ...(current || {}),
        ...(createdSession || {}),
        merchantName: targetPurchase.merchantName,
        merchantUrl: targetPurchase.merchantUrl,
        merchantCountry: targetPurchase.merchantCountry,
        currency: targetPurchase.currency || "USD",
        totalAmount: Number(targetPurchase.totalAmount || 0),
        items: targetPurchase.items || [],
      }));
      const nextCheckout = createdSession?.checkoutId ? {
        id: createdSession.checkoutId,
        paymentSessionId: createdSession.id,
        providerSessionId: createdSession.providerSessionId || null,
        providerOrderId: createdSession.providerCheckoutId || null,
        merchantName: targetPurchase.merchantName,
        merchantUrl: targetPurchase.merchantUrl,
        merchantCountry: targetPurchase.merchantCountry,
        currency: targetPurchase.currency || "USD",
        total: Number(targetPurchase.totalAmount || 0),
        items: targetPurchase.items || [],
        status: "awaiting_approval",
        createdAt: new Date().toISOString(),
      } : null;
      if (nextCheckout) {
        mergeCheckout(nextCheckout);
        setActiveCheckout(nextCheckout);
      }
      setApprovalStatus("awaiting_approval");
      setApprovalOpen(true);
      setMode("checkout");
      refreshCheckouts();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Failed to create Prava session");
    } finally {
      setApprovalLoading(false);
    }
  };

  const refreshApprovalStatus = async () => {
    if (activeCheckout?.id) return syncCheckoutRecord(activeCheckout);
    if (!approvalSession?.id) return null;

    try {
      const result = await pravaApi.getPravaPaymentResult(approvalSession.id, { sessionId, userId });
      const checkout = result?.checkout;
      if (checkout) {
        await handleCheckoutTransition(checkout);
        return checkout;
      }
      const status = checkoutApi.normalizeCheckoutStatus(result?.remote?.status || result?.local?.status || "pending");
      setApprovalStatus(status);
      return null;
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Failed to refresh Prava status");
      return null;
    }
  };

  useEffect(() => {
    const activeStatus = checkoutApi.normalizeCheckoutStatus(activeCheckout?.status || approvalStatus);
    const canPollCheckout = activeCheckout?.id && checkoutApi.ACTIVE_CHECKOUT_STATUSES.has(activeStatus);
    const canPollPaymentSession = !activeCheckout?.id && approvalSession?.id && activeStatus === "awaiting_approval";
    if (!canPollCheckout && !canPollPaymentSession) return undefined;

    let alive = true;
    let inFlight = false;
    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      await refreshApprovalStatus();
      inFlight = false;
    };

    tick();
    const timer = setInterval(tick, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activeCheckout?.id, activeCheckout?.status, approvalSession?.id, approvalStatus]);

  useEffect(() => {
    return () => {
      tryOnControllersRef.current.forEach((controller) => controller.abort());
      tryOnControllersRef.current.clear();
      if (paymentSuccessTimerRef.current) {
        clearTimeout(paymentSuccessTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setJobs([]);
      setActiveTryOnId(null);
      return undefined;
    }

    setJobs([]);
    setActiveTryOnId(null);
    const controller = new AbortController();
    api.listTryOnJobs({ userId, limit: 20, signal: controller.signal })
      .then((history) => {
        setJobs(history);
        setActiveTryOnId(history.find((job) => job.status === "completed")?.id || null);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") console.error("Try-on history load failed:", error);
      });
    return () => controller.abort();
  }, [userId]);

  const nav = (nextMode) => {
    if (nextMode === "discover") {
      setMode("discover");
      return;
    }
    if (!visible.length) return;
    setMode(nextMode);
  };

  const canvas =
    mode === "results" || mode === "searching" ? (
      <SearchResults
        products={displayedProducts}
        selected={primarySelected}
        selectedIds={selectedProductIds}
        selectedProducts={selectedProducts}
        onToggleSelect={toggleSelectedProduct}
        onTry={startTry}
        onAddToCart={handleAddToCart}
        onToggleSaved={handleToggleSaved}
        onCompare={openComparison}
        onView={(product) => {
          if (product) setSelected(product);
          setMode("product");
        }}
        loading={mode === "searching" || resultsLoading}
        reference={reference}
        filters={filters}
        onToggleFilter={toggleFilter}
        onClearFilters={clearFilters}
        onCycleSort={cycleSort}
        cartProductIds={cartProductIds}
        savedProductIds={savedProductIds}
        activeTryOn={dockActiveTryOn}
        onRemoveSelected={removeSelectedProduct}
        onClearSelected={clearSelectedProducts}
      />
    ) : mode === "product" ? (
      <ProductDetail
        product={selected}
        onBack={() => setMode("results")}
        onMode={setMode}
        onTry={startTry}
      />
    ) : mode === "comparison" ? (
      <ComparisonView
        products={comparisonProducts.length >= 2 ? comparisonProducts : selectedProducts.length >= 2 ? selectedProducts : displayedProducts.slice(0, 3)}
        onBack={() => setMode("results")}
        onTry={startTry}
      />
    ) : mode === "tryon" ? (
      <TryOnStudio
        product={selected || products[0]}
        products={selectedProducts}
        jobs={jobs}
        activeJobId={activeTryOnId}
        onSelectJob={setActiveTryOnId}
        onMode={setMode}
        onUploadSelfie={uploadTryOnSelfie}
        onRetry={startTry}
        onTryProduct={startTry}
        onSaveLook={(items) => Promise.all(items.map(handleSaveProduct))}
        onAddToCart={(items) => Promise.all(items.map((item) => handleAddToCart(item)))}
      />
    ) : mode === "checkout" ? (
      <Checkout
        items={cart}
        setItems={setCart}
        purchase={pendingPurchase || checkoutPurchase}
        checkout={activeCheckout}
        checkoutStatus={activeCheckout?.status || approvalStatus}
        approvalSession={approvalSession}
        approvalLoading={approvalLoading}
        approvalError={approvalError}
        onApprove={approve}
        onBack={() => setMode("tryon")}
        onOpenApproval={() => {
          const url = approvalSession?.approvalUrl || pendingPurchase?.approvalUrl;
          if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
        onRefreshStatus={refreshApprovalStatus}
        onSyncCheckout={() => activeCheckout?.id ? syncCheckoutRecord(activeCheckout) : refreshApprovalStatus()}
        onDismissApproval={() => {
          setApprovalOpen(false);
          if (["approved", "paid"].includes(checkoutApi.normalizeCheckoutStatus(activeCheckout?.status || approvalStatus))) {
            setTab("chat");
            setMode(visible.length ? "results" : "discover");
          }
        }}
      />
    ) : mode === "processing" ? (
      <CheckoutProgress step={progress} orders={merchantNames} />
    ) : (
      <OrderConfirmation orders={orders} onMode={setMode} />
    );

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <TopNavigation
        mode={mode}
        onMode={nav}
        enabled={visible.length > 0}
        user={authUser}
        onLogout={logout}
        cartCount={cartCount}
        savedCount={savedCount}
        checkoutCount={activeCheckoutCount}
        onOpenCart={() => openLibrary("cart")}
        onOpenSaved={() => openLibrary("saved")}
        onOpenCheckouts={() => openLibrary("checkouts")}
      />
      <LibraryDrawer
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        activeTab={libraryTab}
        onTabChange={(nextTab) => {
          setLibraryTab(nextTab);
          if (nextTab === "checkouts") refreshCheckouts();
        }}
        cartItems={cart}
        savedItems={savedProducts}
        checkoutItems={checkouts}
        checkoutsLoading={checkoutsLoading}
        checkoutsError={checkoutsError}
        onRemoveCartItem={handleRemoveCartItem}
        onRemoveSavedItem={handleRemoveSavedProduct}
        onAddToCart={handleAddToCart}
        onUpdateCartQuantity={handleUpdateCartQuantity}
        onRefreshCheckouts={refreshCheckouts}
        onSyncCheckout={syncCheckoutRecord}
        onRetryCheckout={(checkout) => {
          setLibraryOpen(false);
          setApprovalSession(null);
          setActiveCheckout(null);
          setApprovalStatus("idle");
          setPendingPurchase(checkout);
          setMode("checkout");
          approve(checkout);
        }}
        onSelectProduct={(product) => {
          setSelected(normalizeProduct(product));
          setMode("product");
          setLibraryOpen(false);
        }}
      />
      <AnimatePresence mode="wait">
        {mode === "discover" ? (
          <motion.div
            key="discover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <Discover
              query={query}
              setQuery={setQuery}
              onSubmit={search}
              onUpload={upload}
              messages={messages}
              chat={chat}
              setChat={setChat}
              onSend={send}
              suggestedTasks={suggestedTasks}
              onStartTask={startTask}
              conversationStarted={messages.length > 1 || isStreaming}
              isStreaming={isStreaming || resultsLoading}
            />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-h-0 grid md:grid-cols-[26%_1fr]"
          >
            <div className={`${tab === "chat" ? "block" : "hidden"} md:block min-h-0 max-w-[600px]`}>
              <ConversationPanel
                messages={messages}
                chat={chat}
                setChat={setChat}
                onSend={send}
                suggestedTasks={suggestedTasks}
                onStartTask={startTask}
              />
            </div>
            <main className={`${tab === "chat" ? "hidden" : "block"} md:block min-w-0 min-h-0`}>
              {canvas}
            </main>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="grid md:grid-cols-[1.1fr_0.9fr] min-h-[520px]">
            <div className="border-b md:border-b-0 md:border-r border-border bg-muted/20 p-5 flex flex-col gap-4">
              <DialogHeader className="text-left">
                <DialogTitle>Approve with Prava</DialogTitle>
                <DialogDescription>
                  Open the payment session, approve the checkout, then refresh to sync the result back into the app.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 rounded-[24px] overflow-hidden border border-border bg-background">
                {approvalSession?.approvalUrl ? (
                  <iframe
                    title="Prava approval"
                    src={approvalSession.approvalUrl}
                    className="h-full min-h-[420px] w-full"
                  />
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-sm text-muted-foreground">
                    Approval URL is not available yet.
                  </div>
                )}
              </div>
            </div>
            <div className="p-5">
              <PravaApproval
                purchase={pendingPurchase || checkoutPurchase}
                session={approvalSession}
                status={activeCheckout?.status || approvalStatus}
                isLoading={approvalLoading}
                error={approvalError}
                onApprove={approve}
                onOpenApproval={() => {
                  const url = approvalSession?.approvalUrl || pendingPurchase?.approvalUrl;
                  if (url) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
                onRefreshStatus={refreshApprovalStatus}
                onDismiss={() => {
                  setApprovalOpen(false);
                  if (["approved", "paid"].includes(checkoutApi.normalizeCheckoutStatus(activeCheckout?.status || approvalStatus))) {
                    setTab("chat");
                  }
                }}
              />
              <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Status</p>
                <p className="mt-1">{approvalStatus}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentSuccessOpen} onOpenChange={setPaymentSuccessOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <div className="p-6 text-center">
            <DialogHeader>
              <DialogTitle>{paymentSuccessStatus === "paid" ? "Payment successful" : "Payment approved"}</DialogTitle>
              <DialogDescription>
                {paymentSuccessStatus === "paid"
                  ? "The merchant confirmed your payment."
                  : "Prava approved your payment. Merchant confirmation is still pending, and you can continue chatting."}
              </DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
      {mode !== "discover" && (
        <MobileTabs
          mode={mode}
          tab={tab}
          onSelect={(id) => {
            if (id === "chat") {
              setTab("chat");
            } else {
              setTab("canvas");
              setMode(id);
            }
          }}
        />
      )}
    </div>
  );
}































