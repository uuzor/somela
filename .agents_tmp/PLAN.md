# Stop Embeddings & Test Visual Search

## 1. OBJECTIVE
Stop the ongoing embedding process (1000 embeddings is sufficient for testing) and validate the visual search API functionality to ensure the full pipeline works before continuing with other features.

## 2. CONTEXT SUMMARY

### Current State
- **Embedding process:** Running in background via `nohup`, hitting Voyage AI rate limits (429 errors), only ~10 products processed before hitting rate limits
- **Visual search API:** Implemented in `backend/src/routes/visual-search.ts` - accepts text or imageUrl queries, returns taskId for polling
- **Backend server:** Has port conflict issues (EADDRINUSE on 3000), needs restart
- **Database:** Has `product_embeddings` table with existing embeddings (up to ~15 embedded before rate limits)

### Key Components
- `backend/src/routes/visual-search.ts` - Visual search endpoint
- `backend/scripts/embeddings.ts` - Embedding generation script
- `backend/src/db/schema.ts` - Database schema with `product_embeddings` table

## 3. APPROACH OVERVIEW

1. **Kill the embedding process** - Stop the background nohup embedding script
2. **Kill and restart the backend server** - Fix port conflict, ensure clean state
3. **Test visual search API** - Verify the visual search endpoint works with current embeddings
4. **Continue with other work** - Based on priorities (likely frontend or other backend features)

## 4. IMPLEMENTATION STEPS

### Step 1: Kill Embedding Process
- **Goal:** Stop the background embedding script that's hitting rate limits
- **Method:** Find and kill any running embedding processes (nohup/tsx/node)
- **Reference:** `backend/scripts/embeddings.ts`, `backend/embeddings.log`

### Step 2: Kill and Restart Backend Server
- **Goal:** Fix port conflict and ensure backend is running cleanly
- **Method:** Kill existing node process on port 3000, restart backend with tsx
- **Reference:** `backend/src/index.ts`

### Step 3: Check Current Embedding Count
- **Goal:** Verify how many products are currently embedded
- **Method:** Query the database to count rows in `product_embeddings` table
- **Reference:** `backend/src/db/schema.ts`

### Step 4: Fix Visual Search to Support Text AND Image Together
- **Goal:** Ensure visual search accepts BOTH text and image (multimodal query)
- **Method:** Update `processVisualSearch` in `visual-search.ts` to combine embeddings when both are provided, rather than using only one
- **Reference:** `backend/src/routes/visual-search.ts`

### Step 5: Test Visual Search API (Text, Image, and Combined)
- **Goal:** Validate visual search works with text-only, image-only, and text+image queries
- **Method:** 
  - Test 1: POST with `{"text": "denim jacket"}` only
  - Test 2: POST with `{"imageUrl": "..."}` only (if available)
  - Test 3: POST with `{"text": "something like this", "imageUrl": "..."}` combined
- **Reference:** `backend/src/routes/visual-search.ts`

### Step 6: Continue with Other Work (TBD)
- **Goal:** Based on priority, continue with remaining features
- **Method:** Options include:
  - Frontend integration for visual search UI
  - Try-on API implementation  
  - Chat/discovery agent wiring
  - Other backend features
- **Reference:** TBD based on priority decision

## 5. TESTING AND VALIDATION

### Visual Search API Test
1. Start backend server successfully (no port conflict)
2. **Test text-only query:** POST `{"text": "casual summer dress"}` → poll for results
3. **Test image-only query:** POST `{"imageUrl": "https://..."}` → poll for results  
4. **Test combined query:** POST `{"text": "something like this", "imageUrl": "https://..."}` → poll for results
5. Verify results contain product matches with similarity scores for all query types

### Success Criteria
- Backend server runs cleanly on port 3000
- Visual search endpoint returns valid taskId for all query types
- Text-only query returns results
- Image-only query returns results
- Combined text+image query returns results (with both modalities combined)
- No rate limit errors in logs
