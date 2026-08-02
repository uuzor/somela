import { useState } from "react";
import { ChevronDown, Heart, ShoppingBag, Minus, Plus, ReceiptText, RotateCcw, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

import { ACTIVE_CHECKOUT_STATUSES, groupCheckoutsByGroupId } from '@/services/checkoutService';

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

const CHECKOUT_STATUS_LABELS = {
  created: "Preparing",
  awaiting_approval: "Awaiting approval",
  approved: "Approved · Processing",
  paid: "Paid",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

function CheckoutHistoryGroup({ group, onSync, onRetry }) {
  const checkouts = Array.isArray(group?.checkouts) ? group.checkouts : [];
  const itemCount = checkouts.reduce((sum, checkout) => sum + (Array.isArray(checkout?.items) ? checkout.items.reduce((itemSum, item) => itemSum + Number(item?.quantity || 1), 0) : 0), 0);
  const total = checkouts.reduce((sum, checkout) => sum + Number(checkout?.total || 0), 0);
  const currencies = [...new Set(checkouts.map((checkout) => checkout?.currency).filter(Boolean))];
  const currency = currencies.length === 1 ? currencies[0] : 'USD';
  const createdAt = group?.createdAt ? new Date(group.createdAt) : null;

  return (
    <section className='rounded-2xl border border-border bg-muted/20 p-2.5'>
      <div className='mb-2 flex items-start justify-between gap-3 px-1'>
        <div className='min-w-0'>
          <p className='text-xs font-medium'>Checkout group</p>
          <p className='truncate text-[10px] text-muted-foreground'>{group?.id}</p>
          {createdAt && !Number.isNaN(createdAt.getTime()) && (
            <p className='mt-1 text-[10px] text-muted-foreground'>{createdAt.toLocaleString()}</p>
          )}
        </div>
        <div className='shrink-0 text-right'>
          <p className='text-sm font-medium'>{formatMoney(total, currency)}</p>
          <p className='text-[10px] text-muted-foreground'>
            {checkouts.length} order{checkouts.length === 1 ? '' : 's'} / {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className='space-y-2'>
        {checkouts.map((checkout) => (
          <CheckoutHistoryItem key={checkout.id} checkout={checkout} onSync={onSync} onRetry={onRetry} />
        ))}
      </div>
    </section>
  );
}

function CheckoutHistoryItem({ checkout, onSync, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const items = Array.isArray(checkout?.items) ? checkout.items : [];
  const status = checkout?.status || "created";
  const active = status === "awaiting_approval" || status === "approved";
  const retryable = status === "failed" || status === "expired" || status === "cancelled";
  const statusTone = status === "paid"
    ? "text-emerald-500"
    : status === "failed" || status === "expired" || status === "cancelled"
      ? "text-destructive"
      : "text-primary";
  const createdAt = checkout?.createdAt ? new Date(checkout.createdAt) : null;

  return (
    <article className="rounded-2xl border border-border bg-background/50 p-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start gap-3 text-left">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-muted/40">
          <ReceiptText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{checkout?.merchantName || "Merchant checkout"}</p>
              <p className={`mt-0.5 text-[11px] ${statusTone}`}>{CHECKOUT_STATUS_LABELS[status] || status}</p>
            </div>
            <ChevronDown size={14} className={`mt-1 text-muted-foreground transition ${expanded ? "rotate-180" : ""}`} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{formatMoney(checkout?.total, checkout?.currency)}</span>
            <span className="text-[10px] text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>
          {createdAt && !Number.isNaN(createdAt.getTime()) && (
            <p className="mt-1 text-[10px] text-muted-foreground">{createdAt.toLocaleString()}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item?.cartItemId || item?.productId || `${checkout?.id}-${index}`} className="flex items-center gap-2 text-xs">
                {item?.image ? (
                  <img src={item.image} alt={item?.name || "Checkout item"} className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item?.name || item?.description || "Product"}</p>
                  <p className="text-[10px] text-muted-foreground">Qty {Number(item?.quantity || 1)}</p>
                </div>
                <span>{formatMoney(item?.unitPrice ?? item?.unit_price, checkout?.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[10px] text-muted-foreground">
            <p>Order ID: {checkout?.providerOrderId || "Pending"}</p>
            <p>Prava session: {checkout?.providerSessionId || "Pending"}</p>
          </div>
          {(active || retryable) && (
            <div className="mt-3 flex gap-2">
              {active && (
                <button type="button" onClick={() => onSync?.(checkout)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                  <RotateCcw size={13} /> Refresh
                </button>
              )}
              {retryable && (
                <button type="button" onClick={() => onRetry?.(checkout)} className="primary flex-1">Retry checkout</button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function LibraryDrawer({
  open,
  onOpenChange,
  activeTab = "cart",
  onTabChange,
  cartItems = [],
  savedItems = [],
  checkoutItems = [],
  checkoutsLoading = false,
  checkoutsError = "",
  onRemoveCartItem,
  onRemoveSavedItem,
  onAddToCart,
  onUpdateCartQuantity,
  onSelectProduct,
  onRefreshCheckouts,
  onSyncCheckout,
  onRetryCheckout,
}) {
  const cartCount = Array.isArray(cartItems) ? cartItems.reduce((sum, item) => sum + Number(item?.qty ?? item?.quantity ?? 1), 0) : 0;
  const savedCount = Array.isArray(savedItems) ? savedItems.length : 0;
  const checkoutGroups = groupCheckoutsByGroupId(checkoutItems);
  const activeCheckoutCount = checkoutGroups.filter((group) => group.checkouts.some((checkout) => ACTIVE_CHECKOUT_STATUSES.has(checkout.status))).length;
  const isCart = activeTab === "cart";
  const isSaved = activeTab === "saved";
  const isCheckouts = activeTab === "checkouts";
  const items = isCart ? cartItems : isSaved ? savedItems : checkoutGroups;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="text-lg">Your library</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Saved products, cart items, and orders in one place.
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
              <button type="button" onClick={() => onTabChange?.("saved")} className={`rounded-full px-3 py-1.5 ${isSaved ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <span className="inline-flex items-center gap-2">
                  <Heart size={14} />
                  Saved
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{savedCount}</span>
                </span>
              </button>
              <button type="button" onClick={() => onTabChange?.("checkouts")} className={`rounded-full px-3 py-1.5 ${isCheckouts ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <span className="inline-flex items-center gap-2">
                  <ReceiptText size={14} />
                  Orders
                  {activeCheckoutCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{activeCheckoutCount}</span>}
                </span>
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {isCheckouts && checkoutsLoading ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">Loading orders...</div>
            ) : isCheckouts && checkoutsError ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                <p>{checkoutsError}</p>
                <button type="button" onClick={onRefreshCheckouts} className="mt-3 text-primary">Try again</button>
              </div>
            ) : isCheckouts && Array.isArray(items) && items.length > 0 ? (
              items.map((group) => (
                <CheckoutHistoryGroup key={group.id} group={group} onSync={onSyncCheckout} onRetry={onRetryCheckout} />
              ))
            ) : Array.isArray(items) && items.length > 0 ? (
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
                {isCart ? "Your cart is empty." : isSaved ? "No saved items yet." : "No checkout history yet."}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
