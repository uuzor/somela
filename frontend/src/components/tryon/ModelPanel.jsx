import React, { useState, useRef } from "react";
import { Upload, Check, Loader2 } from "lucide-react";

export default function ModelPanel({ 
  selectedModel, 
  setSelectedModel,
  selfies = [],
  onUploadSelfie,
  onSelectSelfie,
  isUploading = false
}) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const models = [
    { id: "m1", name: "Aria", image: "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=120&h=150&fit=crop" },
    { id: "m2", name: "Leo", image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=150&fit=crop" },
    { id: "m3", name: "Mia", image: "https://images.unsplash.com/photo-1504593811423-6dd665756598?w=120&h=150&fit=crop" },
    { id: "m4", name: "Kai", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=150&fit=crop" },
  ];

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }
    const imageUrl = URL.createObjectURL(file);
    if (onUploadSelfie) {
      onUploadSelfie(imageUrl);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="border-b border-gray-100 pb-4 mb-4">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-black">Your Photo</h3>
        {selfies.length > 0 && (
          <span className="text-[11px] font-semibold text-gray-400">{selfies.length} uploaded</span>
        )}
      </div>
      
      {selfies.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Your Photos</span>
          </div>
          <div className="grid grid-cols-4 gap-2.5 mb-3">
            {selfies.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  const model = { id: s.id, name: "You", image: s.imageUrl };
                  setSelectedModel(model);
                  if (onSelectSelfie) onSelectSelfie(s);
                }}
                className={`relative rounded-xl overflow-hidden aspect-[3/4] transition-all ${
                  selectedModel?.id === s.id ? "ring-2 ring-black" : "ring-1 ring-gray-100 hover:ring-gray-300"
                }`}
              >
                <img src={s.imageUrl} alt="Your photo" className="w-full h-full object-cover" />
                {selectedModel?.id === s.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                  <span className="text-[10px] font-bold text-white">You</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Or choose a model</span>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mb-3">
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedModel(m)}
            className={`relative rounded-xl overflow-hidden aspect-[3/4] transition-all ${
              selectedModel?.id === m.id ? "ring-2 ring-black" : "ring-1 ring-gray-100 hover:ring-gray-300"
            }`}
          >
            <img src={m.image} alt={m.name} className="w-full h-full object-cover" />
            {selectedModel?.id === m.id && (
              <div className="absolute top-1 right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
              <span className="text-[10px] font-bold text-white">{m.name}</span>
            </div>
          </button>
        ))}
      </div>

      <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className="relative">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full mt-2.5 h-9 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-1.5 text-[12px] font-bold text-gray-500 hover:border-gray-400 hover:text-black transition disabled:opacity-50"
        >
          {isUploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Uploading...</span></>
          ) : (
            <><Upload className="w-3.5 h-3.5" /><span>Upload Your Photo</span></>
          )}
        </button>
        {dragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
            <p className="text-[12px] font-bold text-black">Drop your photo here</p>
          </div>
        )}
      </div>
    </div>
  );
}
