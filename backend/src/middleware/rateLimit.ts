/**
 * Rate Limiting Middleware
 * 
 * Simple in-memory rate limiter for preventing abuse.
 * For production, use Redis-based rate limiting.
 */

import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  max: number;        // Max requests per window
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // 100 requests per minute
};

const STRICT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  max: 20,               // 20 requests per minute (for expensive operations)
};

export function rateLimitMiddleware(config: RateLimitConfig = DEFAULT_CONFIG) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req as any).ip || (req as any).socket?.remoteAddress || "unknown";
    const key = `rate:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      // Start new window
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.max.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.max - entry.count).toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > config.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
      return;
    }

    next();
  };
}

// Pre-configured middleware
export const defaultRateLimit = rateLimitMiddleware(DEFAULT_CONFIG);
export const strictRateLimit = rateLimitMiddleware(STRICT_CONFIG);

// Rate limit for specific endpoints
export const searchRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,  // 30 searches per minute
});

export const visualSearchRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 10,  // 10 visual searches per minute
});

export const tryonRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 5,  // 5 try-on requests per minute
});
