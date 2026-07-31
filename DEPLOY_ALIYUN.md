# Alibaba Cloud Deployment Guide

## Quick Deploy

```bash
cd /workspace/project/opencommercelens
python deploy_aliyun.py
```

## Prerequisites

1. **Alibaba Cloud Account** with RAM user credentials
2. **Credentials in `backend/.env`**:
   ```
   ALIBABA_CLOUD_ACCESS_KEY_ID=your_access_key
   ALIBABA_CLOUD_ACCESS_KEY_SECRET=your_secret_key
   ALIBABA_CLOUD_REGION_ID=ap-southeast-1
   ```

## What Gets Deployed

| Component | Service | URL |
|-----------|---------|-----|
| Frontend | OSS (Object Storage) | `https://opencommercelens-frontend.oss-{region}.aliyuncs.com` |

## Manual Setup Required

### 1. Enable Public Access (Console)

The deployment script may not have permissions to make the bucket public. Do this manually:

1. Go to [OSS Console](https://oss.console.aliyun.com)
2. Select bucket `opencommercelens-frontend`
3. **Basic Settings** → **Block Public Access** → Disable
4. **Access Control** → **ACL** → Set to **Public Read**

### 2. Configure RAM Policy (if needed)

Your RAM user needs these permissions:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject",
        "oss:ListBuckets",
        "oss:GetBucketInfo",
        "oss:PutBucket",
        "oss:PutBucketAcl",
        "oss:PutBucketCors",
        "oss:PutBucketPolicy",
        "oss:PutBucketWebsite"
      ],
      "Resource": "*",
      "Effect": "Allow"
    }
  ]
}
```

## Backend Deployment Options

### Option 1: ECS (Elastic Compute Service)

```bash
# SSH to ECS instance
ssh root@your-ecs-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Clone and deploy
cd /opt/opencommercelens
git pull origin main
cd backend && npm install && npm start
```

### Option 2: Function Compute (Serverless)

```bash
# Install FC tool
npm install -g @serverless-devs/core

# Configure
s config add

# Deploy
cd backend && s deploy
```

### Option 3: Container Service (ACK)

```yaml
# docker-compose.yml
services:
  api:
    image: your-registry/opencommercelens-backend:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - VOYAGE_API_KEY=${VOYAGE_API_KEY}
```

## Environment Variables for Backend

```bash
# Supabase
DATABASE_URL=postgresql://...

# APIs
VOYAGE_API_KEY=pa-...
YOUCAM_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...

# Frontend URL (for CORS)
FRONTEND_URL=https://opencommercelens-frontend.oss-ap-southeast-1.aliyuncs.com
```

## CDN Setup (Optional)

For better performance, add Alibaba Cloud CDN:

1. CDN Console → Add Domain
2. Origin: `opencommercelens-frontend.oss-ap-southeast-1.aliyuncs.com`
3. Configure CNAME in DNS

## Troubleshooting

### 403 Access Denied on Bucket
→ Enable public access in OSS Console or update RAM policy

### CORS Errors
→ Configure CORS rules in OSS Console:
```
Allowed Origins: *
Allowed Methods: GET, POST, PUT, DELETE, OPTIONS
Allowed Headers: *
```

### Build Errors
```bash
# Frontend
cd frontend && npm install && npm run build

# Backend
cd backend && npm install
```

## Files

- `deploy_aliyun.py` - Deployment script
- `backend/.env` - Environment variables
- `frontend/dist/` - Built frontend (deploys to OSS)

