const CANVAS_MODES = Object.freeze({
  discover: "discover",
  searching: "searching",
  results: "results",
  product: "product",
  comparison: "comparison",
  tryon: "tryon",
  checkout: "checkout",
  processing: "processing",
  confirmation: "confirmation",
});

const CANVAS_TABS = Object.freeze({
  chat: "chat",
  canvas: "canvas",
});

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(minPrice, maxPrice, currency = "USD") {
  const min = toNumber(minPrice);
  const max = toNumber(maxPrice);
  if (min === null && max === null) return null;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  if (min !== null && max !== null && min !== max) {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }
  return formatter.format(min ?? max ?? 0);
}

function firstImage(images, fallback = null) {
  const list = toArray(images).filter(Boolean);
  return list.length > 0 ? list[0] : fallback;
}

export function normalizeProduct(raw = {}) {
  const images = toArray(raw.images).filter(Boolean);
  const variants = toArray(raw.variants);
  const options = toArray(raw.options);
  const collections = toArray(raw.collections).filter(Boolean);
  const minPrice = toNumber(raw.minPrice);
  const maxPrice = toNumber(raw.maxPrice);
  const compareAtPriceMin = toNumber(raw.compareAtPriceMin ?? raw.compareAtPrice);
  const compareAtPriceMax = toNumber(raw.compareAtPriceMax ?? raw.compareAtPrice);
  const merchant = raw.vendor || raw.merchant || raw.merchantName || raw.shopName || raw.shopId || null;
  const image = firstImage(images, raw.primaryImage || raw.image || null);
  const title = raw.title || raw.name || "Untitled product";
  const price = raw.price ?? formatPrice(minPrice, maxPrice, raw.currency);
  const available = (raw.available ?? raw.inStock ?? raw.status === "available") || raw.status === "active";
  const status = raw.status || (available ? "available" : "unavailable");
  const onSale = Boolean(raw.onSale || (compareAtPriceMin != null && minPrice != null && compareAtPriceMin > minPrice));

  return {
    id: raw.id || raw.productId || null,
    productId: raw.productId || raw.id || null,
    shopId: raw.shopId || null,
    handle: raw.handle || null,
    title,
    name: title,
    description: raw.description || "",
    category: raw.category || raw.productType || null,
    productType: raw.productType || null,
    vendor: raw.vendor || null,
    images,
    image,
    primaryImage: image,
    processedImages: toArray(raw.processedImages).filter(Boolean),
    price,
    displayPrice: price,
    currency: raw.currency || "USD",
    minPrice,
    maxPrice,
    compareAtPriceMin,
    compareAtPriceMax,
    onSale,
    tags: toArray(raw.tags).filter(Boolean),
    options,
    collections,
    url: raw.url || null,
    variants,
    variantCount: variants.length,
    available: Boolean(available),
    match: typeof raw.match === "number" ? raw.match : raw.matchScore ?? null,
    color: raw.color || variants.find((variant) => variant && variant.color)?.color || null,
    size: raw.size || variants.find((variant) => variant && variant.size)?.size || null,
    merchant,
    merchantName: merchant,
    status,
    source: raw.source || null,
    raw,
  };
}

export function normalizeCartItem(raw = {}) {
  const product = raw.product ? normalizeProduct(raw.product) : null;
  return {
    id: raw.id || raw.itemId || null,
    productId: raw.productId || product?.id || null,
    variantId: raw.variantId || null,
    quantity: raw.quantity ?? 1,
    product,
  };
}

export function normalizeCartSnapshot(raw = {}) {
  const items = toArray(raw.items).map(normalizeCartItem);
  return {
    id: raw.id || raw.cartId || null,
    status: raw.status || "active",
    itemCount: typeof raw.itemCount === "number" ? raw.itemCount : items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    items,
    raw,
  };
}

export function normalizeConversationSnapshot(raw = {}) {
  const messages = toArray(raw.messages).map((message) => ({
    id: message?.id || null,
    role: message?.role || "assistant",
    type: message?.type || "text",
    text: message?.text || message?.content || "",
    createdAt: message?.createdAt || null,
    uiPayload: message?.uiPayload || null,
    actions: toArray(message?.actions),
    raw: message,
  }));

  return {
    id: raw.id || null,
    sessionId: raw.sessionId || null,
    messageCount: typeof raw.messageCount === "number" ? raw.messageCount : messages.length,
    lastMessage: raw.lastMessage || (messages.length > 0 ? messages[messages.length - 1].text : ""),
    updatedAt: raw.updatedAt || null,
    messages,
    lastPreferences: raw.lastPreferences || null,
    raw,
  };
}

export function normalizePreferencesSnapshot(raw = {}) {
  if (!raw) return null;
  return {
    category: raw.category || null,
    colors: toArray(raw.colors || raw.preferredColors),
    styles: toArray(raw.styles || raw.preferredStyles),
    sizes: toArray(raw.sizes),
    minPrice: toNumber(raw.minPrice),
    maxPrice: toNumber(raw.maxPrice),
    dislikedItems: toArray(raw.dislikedItems),
    raw,
  };
}

export function normalizeCanvasBootstrap(raw = {}) {
  const catalog = toArray(raw.catalog).map(normalizeProduct);
  const cart = raw.cart ? normalizeCartSnapshot(raw.cart) : null;
  const conversation = raw.conversation ? normalizeConversationSnapshot(raw.conversation) : null;
  const preferences = raw.preferences ? normalizePreferencesSnapshot(raw.preferences) : null;

  return {
    session: {
      userId: raw.session?.userId || null,
      sessionId: raw.session?.sessionId || null,
    },
    preferences,
    cart,
    conversation,
    catalog,
    canvasHints: {
      hasConversation: Boolean(conversation),
      hasCart: Boolean(cart),
      hasPreferences: Boolean(preferences),
      ...(raw.canvasHints || {}),
    },
    raw,
  };
}

export { CANVAS_MODES, CANVAS_TABS };

