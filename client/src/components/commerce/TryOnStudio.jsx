import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Heart,
  ImageUp,
  Loader2,
  RefreshCcw,
  Scale,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import TryOnQueue from "./TryOnQueue";

function imageFor(product) {
  return product?.primaryImage || product?.image || product?.images?.[0] || "";
}

function nameFor(product) {
  return product?.name || product?.title || "Selected garment";
}

function jobProducts(job, fallback) {
  if (job?.outfitProducts?.length) return job.outfitProducts;
  if (job?.products?.length) return job.products;
  if (Array.isArray(job?.product)) return job.product;
  if (job?.product) return [job.product];
  return Array.isArray(fallback) ? fallback.filter(Boolean) : [fallback].filter(Boolean);
}

function stageLabel(job) {
  if (job?.stage === "preparing" || job?.status === "selfie_processing") return "Preparing your photo";
  if (job?.stage === "applying_garment") {
    return `Applying garment ${Math.max(job.currentStep || 1, 1)} of ${Math.max(job.totalSteps || 1, 1)}`;
  }
  if (job?.stage === "finalizing") return "Finishing your look";
  return "Starting virtual try-on";
}

export default function TryOnStudio({
  product,
  products,
  jobs = [],
  activeJobId,
  onSelectJob,
  onMode,
  onUploadSelfie,
  onRetry,
  onTryProduct,
  onSaveLook,
  onAddToCart,
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState("result");
  const currentJob = jobs.find((job) => job.id === activeJobId) || jobs[0] || null;
  const wardrobeProducts = Array.isArray(products) && products.length ? products : [product].filter(Boolean);
  const selectedProducts = jobProducts(currentJob, products?.length ? products : product);
  const primaryProduct = selectedProducts[0] || product || null;
  const ready = currentJob?.status === "completed";
  const failed = currentJob?.status === "failed";
  const needsSelfie = !currentJob || currentJob.status === "needs_selfie";
  const selfieImage = currentJob?.selfie?.processedImageUrl || currentJob?.selfie?.imageUrl || currentJob?.userSelfieUrl || "";
  const resultImage = currentJob?.resultImageUrl || "";
  const phase = preview ? "prepare" : ready ? "review" : needsSelfie || failed ? "prepare" : "generate";

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const chooseFile = (file) => {
    if (!file) return;
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file) };
    });
  };

  const confirmSelfie = async () => {
    if (!preview?.file || uploading) return;
    setUploading(true);
    try {
      await onUploadSelfie?.(preview.file);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const downloadResult = async () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.href = resultImage;
    link.download = "opencommercelens-try-on.jpg";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {phase === "prepare" ? "Prepare" : phase === "generate" ? "Generating" : "Review"}
          </p>
          <h1 className="text-2xl font-semibold">Virtual try-on</h1>
          <p className="text-xs text-muted-foreground">
            {selectedProducts.length > 1 ? `${selectedProducts.length} piece outfit` : nameFor(primaryProduct)}
          </p>
        </div>
        <button type="button" onClick={() => onMode?.("results")} className="control"><ArrowLeft size={15} />Results</button>
      </header>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {phase === "prepare" && (
        <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 mt-4">
          <section className="panel p-5 grid place-items-center min-h-[420px]">
            {preview ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <img src={preview.url} alt="Selected selfie preview" className="max-h-[460px] w-full object-contain rounded-[20px] bg-muted" />
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => inputRef.current?.click()} className="control">Choose another</button>
                  <button type="button" onClick={confirmSelfie} className="primary" disabled={uploading}>
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Use this photo
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm text-center">
                <div className="w-16 h-16 rounded-full bg-muted grid place-items-center mx-auto mb-4"><ImageUp size={24} /></div>
                <h2 className="text-lg font-medium">Add a clear full-body photo</h2>
                <p className="text-xs text-muted-foreground mt-2">
                  Face the camera, keep your arms slightly away from your body, and use an uncluttered, well-lit background.
                </p>
                {currentJob?.errorMessage && <p className="text-xs text-destructive mt-3">{currentJob.errorMessage}</p>}
                <button type="button" onClick={() => inputRef.current?.click()} className="primary mt-5"><ImageUp size={15} />Choose photo</button>
              </div>
            )}
          </section>
          <aside>
            <TryOnWardrobe products={wardrobeProducts} onTry={onTryProduct} disabled={uploading} />
            {currentJob?.outfitProducts?.length > 0 && <GarmentStack products={selectedProducts} />}
          </aside>
        </div>
      )}

      {phase === "generate" && (
        <div className="flex-1 grid md:grid-cols-2 gap-4 mt-4">
          <section className="panel relative min-h-[460px] overflow-hidden grid place-items-center">
            {selfieImage ? (
              <img src={selfieImage} alt="Your try-on photo" className="w-full h-full max-h-[620px] object-contain bg-muted/40 opacity-60" />
            ) : (
              <div className="w-full h-full bg-muted/40" />
            )}
            <div className="absolute inset-0 grid place-items-center bg-background/20">
              <div className="panel px-5 py-4 text-center shadow-card">
                <Loader2 className="animate-spin mx-auto text-primary" size={28} />
                <p className="text-sm font-medium mt-3">{stageLabel(currentJob)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">You can leave this screen. The look will stay in Recent looks.</p>
              </div>
            </div>
          </section>
          <aside>
            <TryOnWardrobe products={wardrobeProducts} onTry={onTryProduct} disabled />
            <GarmentStack products={selectedProducts} />
            <TryOnQueue jobs={jobs} activeJobId={currentJob?.id} onSelect={onSelectJob} />
          </aside>
        </div>
      )}

      {phase === "review" && (
        <>
          <div className="flex flex-wrap gap-2 mt-4" role="tablist" aria-label="Try-on view">
            {["result", "before", "side-by-side"].map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setView(option)}
                className={view === option ? "primary" : "control"}
              >
                {option === "side-by-side" ? "Side by side" : option === "before" ? "Original" : "Result"}
              </button>
            ))}
          </div>
          <div className="flex-1 grid md:grid-cols-2 gap-4 mt-4">
            <div className={"flex-1 grid gap-3 mt-3 min-h-[460px] " + (view === "side-by-side" ? "md:grid-cols-2" : "grid-cols-1")}>
            {(view === "before" || view === "side-by-side") && (
              <figure className="panel relative overflow-hidden">
                <img src={selfieImage} alt="Original selfie" className="w-full h-full max-h-[640px] object-contain bg-muted/30" />
                <figcaption className="badge absolute top-3 left-3 bg-card">Original</figcaption>
              </figure>
            )}
            {(view === "result" || view === "side-by-side") && (
              <figure className="panel relative overflow-hidden">
                <img src={resultImage} alt="Generated virtual try-on" className="w-full h-full max-h-[640px] object-contain bg-muted/30" />
                <figcaption className="badge absolute top-3 left-3 bg-card">Your look</figcaption>
              </figure>
            )}
          </div>
          <div className="flex flex-col gap-2 mt-3 p-6">
            <div className="panel p-3 mt-4 flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => onRetry?.(currentJob?.products?.[0] || primaryProduct)} className="control">
              <RefreshCcw size={15} />Try again
            </button>
            <button type="button" onClick={() => onSaveLook?.(selectedProducts)} className="control"><Heart size={15} />Save pieces</button>
            <button type="button" onClick={downloadResult} className="control"><Download size={15} />Download</button>
            <button type="button" onClick={() => onAddToCart?.(selectedProducts)} className="primary ml-auto"><ShoppingBag size={15} />Add look to cart</button>
          </div>
          <TryOnWardrobe products={wardrobeProducts} onTry={onTryProduct} />
          <TryOnQueue jobs={jobs} activeJobId={currentJob?.id} onSelect={onSelectJob} />
          </div>

          </div>

        </>
      )}

      {phase !== "review" && (
        <div className="panel p-3 mt-4 flex flex-wrap gap-2 items-center">
          <button type="button" onClick={() => onMode?.("comparison")} className="control"><Scale size={15} />Compare another</button>
          {!needsSelfie && (
            <button type="button" onClick={() => inputRef.current?.click()} className="control ml-auto"><ImageUp size={15} />Replace selfie</button>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-2">Virtual preview only. Confirm fit and sizing with the merchant before purchase.</p>
    </div>
  );
}

function GarmentStack({ products }) {
  return (
    <aside className="panel p-4 h-fit">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} />
        <h2 className="text-xs font-medium">{products.length > 1 ? "Outfit pieces" : "Selected garment"}</h2>
      </div>
      <div className="space-y-3">
        {products.map((item, index) => (
          <div key={item.id || item.raw?.productId || index} className="flex gap-2">
            <img src={imageFor(item)} alt="" className="w-14 h-14 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{nameFor(item)}</p>
              <p className="text-[10px] text-muted-foreground">{[item.color, item.size].filter(Boolean).join(" / ") || "Default variant"}</p>
              <p className="text-[10px]">{item.displayPrice || item.price || (item.minPrice != null ? "$" + item.minPrice : "")}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TryOnWardrobe({ products, onTry, disabled = false }) {
  if (!products.length) return null;
  return (
    <aside className="panel p-4 h-fit mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} />
        <div>
          <h2 className="text-xs font-medium">Your try-on wardrobe</h2>
          <p className="text-[10px] text-muted-foreground">Pick one item to apply to the current look.</p>
        </div>
      </div>
      <div className="space-y-2">
        {products.slice(0, 5).map((item, index) => (
          <div key={item.id || item.raw?.productId || index} className="flex items-center gap-2">
            <img src={imageFor(item)} alt="" className="w-12 h-12 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{nameFor(item)}</p>
              <p className="text-[10px] text-muted-foreground">{item.displayPrice || item.price || (item.minPrice != null ? "$" + item.minPrice : "")}</p>
            </div>
            <button type="button" onClick={() => onTry?.(item)} className="control" disabled={disabled}>
              <Sparkles size={13} />Try on
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
