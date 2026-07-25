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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // For image uploads

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
