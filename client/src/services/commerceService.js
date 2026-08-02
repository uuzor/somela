import { products, cartSeed, merchantNames } from "@/data/commerceData";
import { request, userHeaders, buildUrl } from "./apiClient";
import { normalizeProduct } from "./canvasModel";

async function parseSseResponse(response, handlers = {}) {
  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];

  const emit = (name, raw) => {
    if (!raw) return;

    let data = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Leave plain text payloads untouched.
    }

    const event = { event: name, data };
    handlers.onEvent?.(event);

    if (name === "text") handlers.onText?.(data);
    else if (name === "ui_state") handlers.onState?.(data);
    else if (name === "ui_payload") handlers.onPayload?.(data);
    else if (name === "ui_action") handlers.onAction?.(data);
    else if (name === "done") handlers.onDone?.(data);
    else if (name === "error") handlers.onError?.(data);
  };

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }

    emit(eventName, dataLines.join("\n"));
    dataLines = [];
    eventName = "message";
  };

  const processChunk = (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }

      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
        continue;
      }

      if (line === "") {
        flush();
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    processChunk(decoder.decode(value, { stream: true }));
  }

  if (buffer) {
    processChunk("\n");
  }

  if (dataLines.length > 0) {
    flush();
  }
}

export async function streamChatMessage(text, options = {}, handlers = {}) {
  const response = await fetch(buildUrl("/api/chat/stream"), {
    method: "POST",
    headers: {
      ...(options.userId ? { "x-user-id": options.userId } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: options.sessionId,
      userId: options.userId,
      message: text,
      imageUrl: options.imageUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  let finalResult = null;
  await parseSseResponse(response, {
    ...handlers,
    onDone: (data) => {
      finalResult = data;
      handlers.onDone?.(data);
    },
  });

  return finalResult;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomId = () => globalThis.crypto?.randomUUID?.() || `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function fallbackProducts() {
  await wait(250);
  return products.map(normalizeProduct);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function uploadImageFile(file, options = {}) {
  if (!file) {
    throw new Error("File is required");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const commaIndex = dataUrl.indexOf(",");
  const imageData = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const contentType = file.type || "image/jpeg";

  const data = await request("/api/upload/image", {
    method: "POST",
    body: {
      imageData,
      contentType,
      folder: options.folder || "chat-uploads",
    },
  });

  return data.url;
}

export async function searchProducts(params = {}) {
  try {
    const data = await request("/api/catalog", {
      query: params,
    });
    return (data.products || []).map(normalizeProduct);
  } catch {
    return fallbackProducts();
  }
}

export async function sendChatMessage(text, options = {}) {
  try {
    const data = await request("/api/chat", {
      method: "POST",
      headers: userHeaders(options.userId),
      body: {
        sessionId: options.sessionId,
        userId: options.userId,
        message: text,
        imageUrl: options.imageUrl,
      },
    });

    return {
      id: randomId(),
      role: "assistant",
      type: "text",
      text: data.reply || data.chatReply || "I could not generate a response.",
      uiPayload: data.uiPayload,
      actions: data.actions || [],
      conversationId: data.conversationId,
      state: data.state || "chat",
    };
  } catch {
    await wait(350);
    return {
      id: randomId(),
      role: "assistant",
      type: "text",
      text: `Done. I updated the canvas for "${text}".`,
    };
  }
}

export async function getProductDetails(id) {
  try {
    return normalizeProduct(await request(`/api/catalog/${encodeURIComponent(id)}`));
  } catch {
    await wait(250);
    return normalizeProduct(products.find((product) => product.id === id));
  }
}

export async function startTryOn(product, options = {}) {
  const productIds = Array.isArray(product)
    ? product.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean)
    : [typeof product === "string" ? product : product?.id].filter(Boolean);

  if (productIds.length === 0) throw new Error("A valid product is required for try-on.");
  const data = await request(productIds.length > 1 ? "/api/tryon/multi" : "/api/tryon", {
    method: "POST",
    headers: userHeaders(options.userId),
    body: {
      productIds,
      selfieId: options.selfieId,
    },
  });

  return {
    id: data.taskId || randomId(),
    product: Array.isArray(product) ? product.map(normalizeProduct) : normalizeProduct(product),
    status: data.status || "processing",
    externalTaskId: data.externalTaskId,
    resultImageUrl: data.resultImageUrl || null,
    errorMessage: data.errorMessage || null,
  };
}

export async function getTryOnStatus(job, options = {}) {
  const jobId = typeof job === "string" ? job : job?.id;

  const data = await request("/api/tryon/" + encodeURIComponent(jobId), {
    headers: userHeaders(options.userId),
    signal: options.signal,
  });

  return {
    ...(typeof job === "object" ? job : { id: jobId }),
    ...data,
    id: job?.id || jobId,
  };
}

export async function pollTryOnStatus(job, options = {}) {
  const intervalMs = options.intervalMs || 2500;
  const maxAttempts = options.maxAttempts || 90;
  let current = job;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException("Try-on polling cancelled", "AbortError");
    current = await getTryOnStatus(current, options);
    options.onUpdate?.(current);
    if (current.status === "completed" || current.status === "failed") return current;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Try-on polling cancelled", "AbortError"));
      }, { once: true });
    });
  }

  throw new Error("Try-on is taking longer than expected. You can return and check again.");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read selfie image."));
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadTryOnSelfie(file, options = {}) {
  if (!file?.type?.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Selfie must be smaller than 10 MB.");
  const imageData = await fileToBase64(file);
  return request("/api/upload/selfie", {
    method: "POST",
    headers: userHeaders(options.userId),
    body: { imageData },
  });
}

export async function listTryOnSelfies(options = {}) {
  const data = await request("/api/tryon/selfies", {
    headers: userHeaders(options.userId),
    signal: options.signal,
  });
  return Array.isArray(data?.selfies) ? data.selfies : [];
}

export async function waitForSelfie(selfieId, options = {}) {
  const maxAttempts = options.maxAttempts || 90;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw new DOMException("Selfie polling cancelled", "AbortError");
    const selfies = await listTryOnSelfies(options);
    const selfie = selfies.find((item) => item.id === selfieId);
    options.onUpdate?.(selfie);
    if (selfie?.status === "completed") return selfie;
    if (selfie?.status === "failed") throw new Error(selfie.errorMessage || "Selfie preparation failed.");
    await wait(options.intervalMs || 2500);
  }
  throw new Error("Selfie preparation is taking longer than expected.");
}

export async function preparePurchase(options = {}) {
  return fetchCartItems(options);
}

export async function createPravaApproval() {
  await wait(500);
  return { status: "authorized" };
}

export async function completeCheckout() {
  await wait(2600);
  return merchantNames.map((name, i) => ({
    merchantName: name,
    status: "confirmed",
    orderId: `OCL-${8421 + i}`,
    amount: [121, 110, 42][i],
    eta: `Aug ${6 + i}-${9 + i}`,
  }));
}


function getProductId(product) {
  return product?.id || product?.productId || null;
}

function getPrimaryImage(product) {
  if (!product) return "";
  if (product.primaryImage) return product.primaryImage;
  if (product.image) return product.image;
  if (Array.isArray(product.images) && product.images.length > 0) return product.images[0];
  return "";
}

function getDisplayPrice(product) {
  return product?.minPrice ?? product?.price ?? product?.displayPrice ?? null;
}

function normalizeCartItem(product, overrides = {}) {
  const source = product || {};
  const numericPrice = Number.parseFloat(String(getDisplayPrice(source) ?? overrides.price ?? 0).replace(/[^0-9.-]/g, ""));
  return {
    cartId: overrides.cartId || source.cartId || source.itemId || source.id || randomId(),
    productId: getProductId(source),
    qty: Number(overrides.qty ?? overrides.quantity ?? source.qty ?? source.quantity ?? 1),
    name: source.title || source.name || "Item",
    merchant: source.vendor || source.merchantName || source.merchant || source.shopName || source.shop || "Store",
    price: Number.isFinite(numericPrice) ? numericPrice : 0,
    image: getPrimaryImage(source),
    color: source.color || overrides.color || "",
    size: source.size || overrides.size || "",
    available: source.available ?? true,
  };
}

function normalizeBackendCartItem(item) {
  if (!item) return null;
  const product = item.product || {};
  return normalizeCartItem({
    ...product,
    id: item.productId || product.id,
    price: product.minPrice ?? product.price ?? item.price,
    images: product.images,
    primaryImage: product.primaryImage,
    vendor: product.vendor,
    merchant: product.merchant,
    available: product.available,
  }, {
    cartId: item.itemId || item.cartItemId || item.id,
    quantity: item.quantity,
  });
}

function normalizeSavedProductItem(item) {
  if (!item) return null;
  const product = item.product || item;
  return {
    savedId: item.savedId || item.id || randomId(),
    productId: item.productId || product?.id || null,
    product: normalizeProduct(product),
  };
}

export async function fetchCartItems(options = {}) {
  try {
    if (options.userId || options.sessionId) {
      const data = await request("/api/cart", {
        query: options.sessionId ? { sessionId: options.sessionId } : undefined,
        headers: userHeaders(options.userId),
      });
      const items = Array.isArray(data.cart?.items) ? data.cart.items : [];
      return items.map(normalizeBackendCartItem).filter(Boolean);
    }
  } catch {
    // fall through to a scoped fallback below
  }

  return options.userId || options.sessionId ? [] : cartSeed;
}

export async function fetchSavedProducts(options = {}) {
  try {
    if (options.userId || options.sessionId) {
      const data = await request("/api/saved-products", {
        query: options.sessionId ? { sessionId: options.sessionId } : undefined,
        headers: userHeaders(options.userId),
      });
      const items = Array.isArray(data.savedProducts) ? data.savedProducts : [];
      return items.map(normalizeSavedProductItem).filter(Boolean);
    }
  } catch {
    // fall through to empty list
  }

  return [];
}

function normalizeCartMutationResponse(data, fallbackProduct) {
  const item = data?.savedProduct || data?.cartItem || data?.item || data;
  const normalized = normalizeBackendCartItem(item);
  if (normalized) return normalized;
  return normalizeCartItem(fallbackProduct, {
    cartId: data?.itemId || data?.cartItemId || data?.id,
    quantity: data?.quantity,
  });
}

function normalizeSavedMutationResponse(data, fallbackProduct) {
  const item = data?.savedProduct || data?.item || data;
  const normalized = normalizeSavedProductItem(item);
  if (normalized) return normalized;
  return {
    savedId: data?.savedId || data?.id || randomId(),
    productId: getProductId(fallbackProduct),
    product: normalizeProduct(fallbackProduct),
  };
}

export async function addToCart(product, options = {}) {
  const productId = getProductId(product);
  if (!productId) {
    throw new Error("Product ID is required");
  }

  const data = await request("/api/cart/items", {
    method: "POST",
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
    body: {
      productId,
      variantId: options.variantId,
      quantity: options.quantity || 1,
      sessionId: options.sessionId,
    },
  });

  return normalizeCartMutationResponse(data, product);
}

export async function updateCartItemQuantity(itemId, quantity, options = {}) {
  if (!itemId) {
    throw new Error("Cart item ID is required");
  }

  await request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
    body: {
      quantity,
    },
  });

  return true;
}

export async function removeCartItem(itemId, options = {}) {
  if (!itemId) {
    throw new Error("Cart item ID is required");
  }

  await request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
  });

  return true;
}

export async function saveProduct(product, options = {}) {
  const productId = getProductId(product);
  if (!productId) {
    throw new Error("Product ID is required");
  }

  const data = await request("/api/saved-products/items", {
    method: "POST",
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
    body: {
      productId,
      sessionId: options.sessionId,
    },
  });

  return normalizeSavedMutationResponse(data, product);
}

export async function removeSavedProduct(productId, options = {}) {
  await request("/api/saved-products/items/" + encodeURIComponent(productId), {
    method: "DELETE",
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
  });
  return true;
}

export async function getOrderStatus(id) {
  await wait(300);
  return { id, status: "confirmed" };
}


