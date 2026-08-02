import "dotenv/config";
import express from "express";
import cors from "cors";
import { catalogRouter } from "./routes/catalog.js";
import { searchRouter } from "./routes/search.js";
import { chatRouter } from "./routes/chat.js";
import { tryonRouter } from "./routes/tryon.js";
import { preferencesRouter } from "./routes/preferences.js";
import { visualSearchRouter } from "./routes/visual-search.js";
import { sessionsRouter } from "./routes/sessions.js";
import { cartRouter } from "./routes/cart.js";
import { savedProductsRouter } from "./routes/saved-products.js";
import { uploadRouter } from "./routes/upload.js";
import { canvasRouter } from "./routes/canvas.js";
import { paymentsRouter } from "./routes/payments.js";
import { checkoutsRouter } from "./routes/checkouts.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Raw body for webhook signature verification (before JSON parsing)
app.use("/api/tryon/webhook", express.raw({ type: "application/json", limit: "10mb" }), (req, _res, next) => {
  (req as any).rawBody = (req as any).body?.toString() || "";
  next();
});

app.use("/api/visual-search/webhook", express.raw({ type: "application/json", limit: "10mb" }), (req, _res, next) => {
  (req as any).rawBody = (req as any).body?.toString() || "";
  next();
});

// Raw body for file uploads (before JSON parsing)
app.use("/api/upload", express.raw({ type: "multipart/form-data", limit: "10mb" }), (req, _res, next) => {
  (req as any).rawBody = req.body;
  next();
});

// JSON parsing for all other routes
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/catalog", catalogRouter);
app.use("/api/search", searchRouter);
app.use("/api/chat", chatRouter);
app.use("/api/tryon", tryonRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/visual-search", visualSearchRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/saved-products", savedProductsRouter);
app.use("/api/upload", uploadRouter); // Serves /api/upload/selfie, /api/upload/image, /api/upload/from-url
app.use("/api/canvas", canvasRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/checkouts", checkoutsRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 OpenCommerceLens backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});

export default app;


