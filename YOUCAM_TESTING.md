# YouCam Integration Testing Plan

## Overview

Testing the YouCam virtual try-on integration end-to-end.

## Prerequisites

1. YouCam API credentials configured in `.env`:
   ```
   YOUCAM_API_KEY=xxx
   YOUCAM_WEBHOOK_SECRET=whsec_xxx
   ```

2. Webhook endpoint registered in YouCam Console:
   - URL: `https://your-domain.com/api/tryon/webhook`

3. Test user with a selfie on file

## Testing Scenarios

### Scenario 1: Upload Selfie

```bash
# Create a session
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/sessions)
SESSION_TOKEN=$(echo $SESSION_RESPONSE | jq -r '.sessionToken')
USER_ID=$(echo $SESSION_RESPONSE | jq -r '.userId')
echo "Session token: $SESSION_TOKEN"
echo "User ID: $USER_ID"

# Upload selfie (use any image URL)
curl -X POST http://localhost:3000/api/tryon/selfie \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"imageUrl": "https://example.com/selfie.jpg"}'
```

**Expected response:**
```json
{
  "selfieId": "uuid",
  "imageUrl": "https://example.com/selfie.jpg",
  "message": "Selfie uploaded (prep coming in Phase 3)"
}
```

### Scenario 2: Initiate Try-on (without real API key)

```bash
# This will fail if YOUCAM_API_KEY not configured
curl -X POST http://localhost:3000/api/tryon \
  -H "Content-Type: application/json" \
  -H "x-user-id: $USER_ID" \
  -d '{"productIds": ["apc-us:7223286825059"]}'
```

**Expected response (if no API key):**
```json
{
  "error": "Try-on not available",
  "reason": "YOUCAM_API_KEY not configured"
}
```

**Expected response (if API key configured and has selfie):**
```json
{
  "taskId": "uuid",
  "status": "processing",
  "message": "Processing try-on..."
}
```

### Scenario 3: Check Try-on Task Status

```bash
# After initiating try-on, poll for status
curl http://localhost:3000/api/tryon/{taskId}
```

**Expected responses (depending on state):**
```json
// Processing
{
  "taskId": "uuid",
  "status": "processing",
  "productIds": ["apc-us:7223286825059"],
  "createdAt": "2026-07-26T..."
}

// Completed
{
  "taskId": "uuid",
  "status": "completed",
  "productIds": ["apc-us:7223286825059"],
  "resultImageUrl": "https://result-image-url.jpg",
  "completedAt": "2026-07-26T..."
}

// Failed
{
  "taskId": "uuid",
  "status": "failed",
  "errorMessage": "Error description"
}
```

### Scenario 4: Webhook Handler

Test webhook manually (simulate YouCam callback):

```bash
# Create a mock webhook payload
PAYLOAD='{"webhook_id":"test-123","webhook_timestamp":1234567890,"task_id":"EXTERNAL_TASK_ID","task_type":"ai-cloth","task_status":"success","result":{"result_image_url":"https://example.com/result.jpg"}}'

# Compute HMAC signature (simplified test - use actual secret in production)
# For testing, you can just send the payload and check logs

curl -X POST http://localhost:3000/api/tryon/webhook \
  -H "Content-Type: application/json" \
  -H "x-yce-webhook-signature: test-signature" \
  -d "$PAYLOAD"
```

**Expected logs:**
```
Webhook received: { webhook_id: 'test-123', task_id: 'EXTERNAL_TASK_ID', ... }
```

### Scenario 5: Batch Image Prep Script

```bash
# Run the image prep script (requires YOUCAM_API_KEY)
cd backend
YOUCAM_API_KEY=xxx DATABASE_URL=xxx npx tsx scripts/image-prep.ts
```

**Expected output:**
```
Processing 10 products...
Processing product: apc-us:xxx
  Uploading image...
  Uploaded, file_id: xxx
  Creating background removal task...
  ...
```

## Manual Testing Checklist

- [ ] Server starts without errors
- [ ] `POST /api/tryon/selfie` creates selfie record
- [ ] `POST /api/tryon` without selfie returns 400 error
- [ ] `POST /api/tryon` without API key returns 503 error
- [ ] `POST /api/tryon` with API key uploads images and creates task
- [ ] `GET /api/tryon/:taskId` returns correct status
- [ ] `POST /api/tryon/webhook` verifies signature
- [ ] Webhook updates task status correctly
- [ ] `npm run image-prep` processes images

## Debugging

### Check YouCam API directly

```bash
# Get upload URL
curl -X GET "https://v2-api.yce.perfectcorp.com/s2s/v2.0/file/upload-url" \
  -H "Authorization: Bearer $YOUCAM_API_KEY"

# Create AI-Cloth task
curl -X POST "https://v2-api.yce.perfectcorp.com/s2s/v2.0/task/ai-cloth" \
  -H "Authorization: Bearer $YOUCAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cloth_image_id": "...", "person_image_id": "..."}'

# Check task status
curl -X GET "https://v2-api.yce.perfectcorp.com/s2s/v2.0/task/ai-cloth/{taskId}" \
  -H "Authorization: Bearer $YOUCAM_API_KEY"
```

### Check database records

```bash
# Check tryon tasks
psql $DATABASE_URL -c "SELECT id, user_id, external_task_id, status FROM tryon_tasks;"

# Check user selfies
psql $DATABASE_URL -c "SELECT id, user_id, image_url FROM user_selfies;"
```

## Common Issues

1. **"No selfie on file"** - Need to upload a selfie first with `POST /api/tryon/selfie`

2. **"YOUCAM_API_KEY not configured"** - Add the API key to `.env`

3. **Webhook signature verification fails** - Check that `YOUCAM_WEBHOOK_SECRET` matches the console

4. **Image upload fails** - Verify image URLs are publicly accessible

5. **Task never completes** - Check YouCam console for task status or logs
