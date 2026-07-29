import React from "react";
import { Download, RotateCw, Check, Loader2 } from "lucide-react";

export default function TryOnCanvas({ 
  selectedModel, 
  resultImage,
  status = "idle", // idle | loading | processing | success | error
  currentStep = 0,
  totalSteps = 0,
  steps = [],
  onSwapClothing,
  onReset
}) {
  const isProcessing = status === "loading" || status === "processing";
  
  // Get current step info
  const currentStepInfo = steps.find(s => s.step === currentStep);
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {/* Canvas — fills to screen bottom */}
      <div className="flex-1 rounded-2xl bg-gray-50 border border-gray-100 relative overflow-hidden flex items-center justify-center min-h-0 mx-5 mt-5">
        {/* Loading Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-black mx-auto mb-4" />
              <p className="text-[14px] font-bold text-black mb-1">
                {status === "loading" ? "Starting try-on..." : `Step ${currentStep} of ${totalSteps}`}
              </p>
              <p className="text-[12px] text-gray-600 mb-4">
                {currentStepInfo ? `Applying ${currentStepInfo.productTitle}...` : "Processing..."}
              </p>
              
              {/* Progress bar */}
              <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden mx-auto">
                <div 
                  className="h-full bg-black transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              {/* Step indicators */}
              {totalSteps > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  {steps.map((step, idx) => (
                    <div 
                      key={step.step}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        step.status === "success" ? "bg-green-500" :
                        step.step === currentStep ? "bg-black animate-pulse" :
                        "bg-gray-300"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Result Image */}
        {resultImage ? (
          <img
            src={resultImage}
            alt="Try-on result"
            className="h-full w-auto object-contain max-w-full"
          />
        ) : selectedModel ? (
          <img
            src={selectedModel.image.replace("w=120&h=150", "w=500&h=700")}
            alt="Selected model"
            className="h-full w-auto object-contain max-w-full"
          />
        ) : (
          <p className="text-[13px] font-semibold text-gray-400">Upload your photo to begin</p>
        )}

        {/* Success Badge */}
        {status === "success" && resultImage && (
          <div className="absolute top-4 left-4 bg-green-500 text-white rounded-full px-3 py-1 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold">Complete</span>
          </div>
        )}

        {/* Error Badge */}
        {status === "error" && (
          <div className="absolute top-4 left-4 bg-red-500 text-white rounded-full px-3 py-1 flex items-center gap-1.5">
            <span className="text-[11px] font-bold">Error</span>
          </div>
        )}

        {/* Cloth overlay tag */}
        {resultImage && status !== "processing" && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">Now Wearing</p>
            <p className="text-[13px] font-extrabold text-white">
              {steps.length > 0 ? steps.map(s => s.productTitle).join(" + ") : "Outfit"}
            </p>
          </div>
        )}

        {/* Floating actions */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {status === "success" && onSwapClothing && (
            <button 
              onClick={onSwapClothing}
              className="w-9 h-9 rounded-lg bg-white/90 backdrop-blur border border-gray-100 flex items-center justify-center text-gray-700 hover:bg-white transition"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
          {resultImage && (
            <a 
              href={resultImage} 
              download="somela-tryon.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-lg bg-black text-white text-[12px] font-bold flex items-center gap-1.5 hover:bg-gray-800 transition"
            >
              <Download className="w-3.5 h-3.5" /> Save
            </a>
          )}
        </div>
      </div>

      {/* Steps History */}
      {steps.length > 0 && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-black">Try-On Steps</h3>
            {onReset && (
              <button 
                onClick={onReset}
                className="text-[11px] font-semibold text-gray-400 hover:text-black transition"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {steps.map((step) => (
              <div 
                key={step.step}
                className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                  step.status === "success" ? "border-green-500" : 
                  step.status === "error" ? "border-red-500" :
                  "border-gray-200"
                }`}
              >
                {step.status === "success" && step.resultUrl ? (
                  <img src={step.resultUrl} alt={step.productTitle} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}