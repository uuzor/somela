import { ImagePlus, Camera, Mic, ArrowRight, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import { uploadImageFile } from "@/services/commerceService";

export default function DiscoverComposer({
  value,
  onChange,
  query,
  setQuery,
  onSubmit,
  onUpload,
  placeholder = "What are you looking for?",
  footerNote = true,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const draft = value ?? query ?? "";
  const setDraft = onChange ?? setQuery ?? (() => {});
  const busy = disabled || uploading;

  const openFilePicker = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const clearAttachment = (preserveError = false) => {
    setAttachmentUrl("");
    setAttachmentName("");
    if (!preserveError) {
      setUploadError("");
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleUpload = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || busy) return;

    setUploading(true);
    setUploadError("");

    try {
      const url = await uploadImageFile(file, { folder: "discover" });
      setAttachmentUrl(url);
      setAttachmentName(file.name || "Uploaded image");
      onUpload?.({ file, url });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Image upload failed");
      clearAttachment(true);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (busy) return;
    const text = draft.trim();
    if (!text && !attachmentUrl) return;
    onSubmit?.(text || draft, attachmentUrl || null);
    clearAttachment();
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {(attachmentUrl || uploadError) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-background/80 px-3 py-2 text-xs shadow-card">
          {attachmentUrl && (
            <div className="flex items-center gap-2">
              <img src={attachmentUrl} alt={attachmentName || "Uploaded reference"} className="h-10 w-10 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="font-medium truncate max-w-[12rem]">{attachmentName || "Uploaded image"}</div>
                <div className="text-muted-foreground">Ready to send with your message</div>
              </div>
            </div>
          )}
          {uploadError && <div className="text-destructive">{uploadError}</div>}
          <button
            type="button"
            onClick={clearAttachment}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-card text-muted-foreground transition hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-card rounded-3xl border h-16 border-black/10 p-1 flex items-center gap-1 shadow-elevated">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleUpload}
          disabled={busy}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent rounded-xl focus-visible:ring-0 focus-visible:border-0 hover:border-0 focus-within:border-0 focus:border-0 focus:outline-none border-0 outline-0 px-5 py-3 outline-none text-sm tracking-tight placeholder:text-muted-foreground"
          disabled={busy}
        />
        <button
          className="icon-control cursor-pointer shrink-0"
          type="button"
          onClick={openFilePicker}
          disabled={busy}
          aria-label="Upload image"
        >
          {uploading ? <span className="text-[10px] font-medium">...</span> : <ImagePlus size={16} />}
        </button>
        <button className="icon-control shrink-0" type="button" disabled={busy} aria-label="Camera">
          <Camera size={16} />
        </button>
        <button className="icon-control shrink-0" type="button" disabled={busy} aria-label="Microphone">
          <Mic size={16} />
        </button>
        <button
          onClick={submit}
          type="button"
          disabled={busy}
          className="w-12 h-12 rounded-full bg-primary text-white grid place-items-center shadow-violet shrink-0"
        >
          <ArrowRight size={18} />
        </button>
      </div>
      {footerNote && (
        <p className="mt-4 text-center text-xs text-muted-foreground flex justify-center gap-2">
          <ShieldCheck size={14} />
          You approve every purchase before Prava pays.
        </p>
      )}
    </div>
  );
}
