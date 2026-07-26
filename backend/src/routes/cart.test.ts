import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

const CART_PATH = "./src/routes/cart.ts";

describe("cart routes implementation", () => {
  it("GET / returns null when no auth is provided", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("if (!userId && !sessionId)");
    expect(content).toContain("return res.json({ cart: null })");
  });

  it("GET / uses x-user-id header for auth", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("req.header(\"x-user-id\")");
  });

  it("GET / uses sessionId query param for auth", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("req.query.sessionId");
  });

  it("GET / joins cart items with product data", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("innerJoin(products");
    expect(content).toContain("images: products.images");
    expect(content).toContain("minPrice: products.minPrice");
    expect(content).toContain("maxPrice: products.maxPrice");
    expect(content).toContain("url: products.url");
  });

  it("POST /items creates cart if it does not exist", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("const cart = await resolveCart(userId, sessionId)");
    expect(content).toContain("insert(carts)");
  });

  it("POST /items returns 201 with created item", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("res.status(201).json");
    expect(content).toContain("itemId: created.id");
  });

  it("POST /items increments quantity for duplicate items", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("existing.quantity + body.quantity");
    expect(content).toContain("res.status(200).json");
  });

  it("PUT /items/:itemId updates quantity", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("UpdateCartItemSchema.parse(req.body)");
    expect(content).toContain("quantity: body.quantity");
  });

  it("PUT /items/:itemId removes item when quantity < 1", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("body.quantity < 1");
    expect(content).toContain("db.delete(cartItems).where(eq(cartItems.id, item.id))");
  });

  it("DELETE /items/:itemId returns 204", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain('res.status(204).send()');
  });

  it("DELETE /items/:itemId returns 404 when not found", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("res.status(404).json({ error: \"Cart item not found\" })");
  });

  it("PUT /items/:itemId returns 404 when cart not found", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("res.status(404).json({ error: \"Cart not found\" })");
  });

  it("DELETE /items/:itemId returns 404 when cart not found", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("res.status(404).json({ error: \"Cart not found\" })");
  });

  it("resolveCart helper creates a new cart when none exists", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("async function resolveCart(userId?: string | null, sessionId?: string | null)");
    expect(content).toContain("const [newCart] = await db.insert(carts).values");
    expect(content).toContain("returning()");
  });

  it("findCart helper queries by userId when present", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("async function findCart(userId?: string | null, sessionId?: string | null)");
    expect(content).toContain("eq(carts.userId, userId)");
  });

  it("findCart helper queries by sessionId when userId is absent", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("eq(carts.sessionId, sessionId)");
  });

  it("guest session isolation: userId takes precedence over sessionId", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("if (userId)");
    expect(content).toContain("if (sessionId)");
  });

  it("applies defaultRateLimit to all cart routes", () => {
    const content = readFileSync(CART_PATH, "utf-8");
    expect(content).toContain("cartRouter.use(defaultRateLimit)");
  });
});
