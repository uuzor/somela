import { Heart, ShoppingBag, Minus, Plus, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value, currency = "USD") {
  const amount = toNumber(value);
  if (amount === null) return "$0.00";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
  } catch {
    return `$${amount.toFixed(Number.isInteger(amount) ? 0 : 2)}`;
  }
}

function getImage(product) {
  if (!product) return "";
  if (product.primaryImage) return product.primaryImage;
  if (product.image) return product.image;
  if (Array.isArray(product.images) && product.images.length > 0) return product.images[0];
  return "";
}

function getTitle(product) {
  return product?.title || product?.name || "Untitled item";
}

function getMerchant(product) {
  return product?.vendor || product?.merchantName || product?.merchant || product?.shopName || product?.shop || "";
}

function getPrice(product) {
  return product?.minPrice ?? product?.price ?? product?.displayPrice ?? null;
}

function getProductId(product) {
  return product?.id || product?.productId || null;
}

function getCartItemId(item) {
  return item?.cartId || item?.itemId || item?.id || null;
}

function normalizeSavedItem(item) {
  const product = item?.product || item;
  return {
    savedId: item?.savedId || item?.id || getProductId(product),
    productId: item?.productId || getProductId(product),
    product,
  };
}

function normalizeCartItem(item) {
  return {
    cartId: getCartItemId(item),
    productId: item?.productId || getProductId(item?.product),
    qty: Number(item?.qty ?? item?.quantity ?? 1),
    name: item?.name || getTitle(item?.product || item),
    merchant: item?.merchant || getMerchant(item?.product || item),
    price: Number.isFinite(Number(item?.price)) ? Number(item.price) : Number(getPrice(item?.product || item) || 0),
    image: item?.image || getImage(item?.product || item),
    color: item?.color || item?.product?.color || "",
    size: item?.size || item?.product?.size || "",
    available: item?.available ?? item?.product?.available ?? true,
  };
}

function DrawerItem({ item, mode, onRemove, onAddToCart, onUpdateCartQuantity, onSelect }) {
  const product = mode === "saved" ? normalizeSavedItem(item).product : item;
  const cartItem = mode === "cart" ? normalizeCartItem(item) : null;
  const image = mode === "saved" ? getImage(product) : cartItem?.image;
  const title = mode === "saved" ? getTitle(product) : cartItem?.name;
  const merchant = mode === "saved" ? getMerchant(product) : cartItem?.merchant;
  const price = mode === "saved" ? getPrice(product) : cartItem?.price;
  const qty = mode === "cart" ? cartItem?.qty || 1 : null;
  const productId = mode === "saved" ? normalizeSavedItem(item).productId : cartItem?.productId;
  const cartItemId = mode === "cart" ? getCartItemId(item) : null;

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-background/50 p-3">
      <button type="button" onClick={() => onSelect?.(product || item)} className="shrink-0">
        <img src={image} alt={title} className="w-16 h-16 rounded-xl object-cover" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => onSelect?.(product || item)} className="block text-left">
              <p className="text-sm font-medium truncate">{title}</p>
            </button>
            <p className="text-[11px] text-muted-foreground truncate">{merchant}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {mode === "cart" ? `${qty} in cart` : "Saved for later"}
            </p>
          </div>
          <button type="button" onClick={() => onRemove?.(mode === "cart" ? cartItemId : productId, item)} className="text-muted-foreground hover:text-destructive" aria-label={mode === "cart" ? "Remove from cart" : "Remove from saved items"}>
            <Trash2 size={14} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-medium">{formatMoney(price)}</span>
          {mode === "saved" && (
            <button type="button" onClick={() => onAddToCart?.(product || item)} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted">
              <ShoppingBag size={12} />
              Add to cart
            </button>
          )}
          {mode === "cart" && (
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => onUpdateCartQuantity?.(product || item, Math.max(0, qty - 1))} className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground" aria-label="Decrease quantity">
                <Minus size={12} />
              </button>
              <span className="min-w-6 text-center text-xs">{qty}</span>
              <button type="button" onClick={() => onUpdateCartQuantity?.(product || item, qty + 1)} className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground" aria-label="Increase quantity">
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LibraryDrawer({
  open,
  onOpenChange,
  activeTab = "cart",
  onTabChange,
  cartItems = [],
  savedItems = [],
  onRemoveCartItem,
  onRemoveSavedItem,
  onAddToCart,
  onUpdateCartQuantity,
  onSelectProduct,
}) {
  const cartCount = Array.isArray(cartItems) ? cartItems.reduce((sum, item) => sum + Number(item?.qty ?? item?.quantity ?? 1), 0) : 0;
  const savedCount = Array.isArray(savedItems) ? savedItems.length : 0;
  const isCart = activeTab === "cart";
  const items = isCart ? cartItems : savedItems;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="text-lg">Your library</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Saved products and cart items in one place.
                </SheetDescription>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-full border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={14} />
              </button>
            </div>
            <div className="mt-4 inline-flex rounded-full border border-border bg-muted/50 p-1 text-sm">
              <button type="button" onClick={() => onTabChange?.("cart")} className={`rounded-full px-3 py-1.5 ${isCart ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag size={14} />
                  Cart
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{cartCount}</span>
                </span>
              </button>
              <button type="button" onClick={() => onTabChange?.("saved")} className={`rounded-full px-3 py-1.5 ${!isCart ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <span className="inline-flex items-center gap-2">
                  <Heart size={14} />
                  Saved
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{savedCount}</span>
                </span>
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {Array.isArray(items) && items.length > 0 ? (
              items.map((item) => (
                <DrawerItem
                  key={isCart ? getCartItemId(item) || getProductId(item?.product || item) : normalizeSavedItem(item).savedId || getProductId(item?.product || item)}
                  item={item}
                  mode={isCart ? "cart" : "saved"}
                  onRemove={isCart ? onRemoveCartItem : onRemoveSavedItem}
                  onAddToCart={onAddToCart}
                  onUpdateCartQuantity={onUpdateCartQuantity}
                  onSelect={onSelectProduct}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                {isCart ? "Your cart is empty." : "No saved items yet."}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
