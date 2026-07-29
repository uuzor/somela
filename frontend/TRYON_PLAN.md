# Multi-Step Try-On Implementation Plan

## Overview

The current frontend has static UI that doesn't connect to the backend. We need to implement a real multi-step try-on flow where:
1. User uploads their photo
2. User selects outfit pieces
3. Backend performs sequential YouCam try-on for each piece
4. Frontend shows progress and final result

## Verified: Multi-Step Try-On Works!

### Test Results (July 28, 2026)

| Step | Product | Category | Status | Result |
|------|---------|----------|--------|--------|
| 1 | APC Jeans | lower_body | Success | Woman wearing jeans |
| 2 | White Shirt | upper_body | Success | Woman wearing jeans + shirt |

**Output files in `/images/`:**
- `man_jeans_only.jpg` - Step 1 result (49KB)
- `man_jeans_shirt.jpg` - Final result (46KB)

### Key Findings

1. **Sequential processing works**: Each step's result becomes the input for the next step
2. **Category matters**: 
   - `lower_body` for pants, jeans, skirts, shorts
   - `upper_body` for shirts, hoodies, jackets
3. **Processing time**: ~10-30 seconds per step
4. **Full-body photos work best** for `lower_body` category

## Current State

### Frontend Components (UPDATED)
```
frontend/src/
├── pages/TryOn.jsx           # Main try-on page
├── components/tryon/
│   ├── TryOnCanvas.jsx       # Shows result + progress UI (UPDATED)
│   ├── ModelPanel.jsx        # Upload photo (UPDATED)
│   └── OutfitPanel.jsx       # Try-On button (UPDATED)
└── hooks/
    └── useTryOn.js           # NEW: Try-on state management
```

### Backend API (UPDATED)
```
POST /api/tryon              # Single product try-on
POST /api/tryon/multi       # NEW: Multi-step try-on
GET  /api/tryon/:taskId     # Get status/result
POST /api/tryon/selfie      # Upload selfie
```

## Multi-Step Flow

```
User uploads photo
       |
       v
User selects outfit pieces (top + bottom)
       |
       v
Backend receives: { productIds: ['jeans', 'shirt'], selfieId }
       |
       v
Step 1: Jeans (lower_body)
       |
       v
Step 2: Shirt (upper_body) <- uses Step 1 result as source
       |
       v
Return final result with all steps
```

## Implementation Status

### Backend
- [x] `POST /api/tryon/multi` - Multi-step endpoint
- [x] Sequential YouCam processing
- [x] Automatic garment category detection
- [x] Error handling per step

### Frontend
- [x] `useTryOn` hook
- [x] `TryOnCanvas` - Progress UI
- [x] `ModelPanel` - Upload functionality
- [x] `OutfitPanel` - Try-On button

## Next Steps

1. Integrate TryOn page with backend API
2. Add image upload to cloud storage
3. Test with real user photos
4. Add error recovery
