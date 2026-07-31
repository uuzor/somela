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

  try {
    const data = await request("/api/tryon", {
      method: "POST",
      headers: userHeaders(options.userId),
      body: {
        productIds,
      },
    });

    return {
      id: data.taskId || randomId(),
      product: Array.isArray(product) ? product.map(normalizeProduct) : normalizeProduct(product),
      status: data.status || "queued",
      externalTaskId: data.externalTaskId,
    };
  } catch {
    await wait(350);
    return { id: randomId(), product, status: "queued" };
  }
}

export async function getTryOnStatus(job, options = {}) {
  const jobId = typeof job === "string" ? job : job?.id;

  try {
    const data = await request(`/api/tryon/${encodeURIComponent(jobId)}`, {
      headers: userHeaders(options.userId),
    });

    return {
      ...(typeof job === "object" ? job : { id: jobId }),
      ...data,
      id: job?.id || jobId,
    };
  } catch {
    await wait(1200);
    return { ...(typeof job === "object" ? job : { id: jobId }), status: "ready" };
  }
}

export async function preparePurchase(options = {}) {
  try {
    if (options.userId || options.sessionId) {
      const query = options.sessionId ? { sessionId: options.sessionId } : undefined;
      const data = await request("/api/cart", {
        query,
        headers: userHeaders(options.userId),
      });
      return data.cart?.items || cartSeed;
    }
  } catch {
    // fall through to demo data
  }

  await wait(500);
  return cartSeed;
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

export async function getOrderStatus(id) {
  await wait(300);
  return { id, status: "confirmed" };
}
