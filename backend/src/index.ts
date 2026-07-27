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
  console.log(`🚀 Somela backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});

export default app;
