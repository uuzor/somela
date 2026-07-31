import { request, userHeaders } from "./apiClient";
import { normalizeCanvasBootstrap } from "./canvasModel";

export async function bootstrapCanvas(options = {}) {
  const data = await request("/api/canvas/bootstrap", {
    query: options.sessionId ? { sessionId: options.sessionId } : undefined,
    headers: userHeaders(options.userId),
  });

  return normalizeCanvasBootstrap(data);
}

export async function loadCanvasSnapshot(options = {}) {
  return bootstrapCanvas(options);
}
