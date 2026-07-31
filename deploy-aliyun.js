#!/usr/bin/env node
/**
 * Alibaba Cloud Deployment Script
 * Deploys OpenCommerceLens frontend to OSS and backend configuration
 */

import AlibabaCloud from '@alicloud/openapi-client';
import OSS from 'ali-oss';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './backend/.env' });

const {
  ALIBABA_CLOUD_ACCESS_KEY_ID,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  ALIBABA_CLOUD_REGION_ID = 'ap-southeast-1'
} = process.env;

if (!ALIBABA_CLOUD_ACCESS_KEY_ID || !ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
  console.error('Missing Alibaba Cloud credentials');
  process.exit(1);
}

// Configuration
const BUCKET_NAME = 'opencommercelens-frontend';
const FRONTEND_DIST = './frontend/dist';
const BACKEND_DIR = './backend';

async function deployFrontend() {
  console.log('📦 Deploying frontend to OSS...');
  
  const client = new OSS({
    region: ALIBABA_CLOUD_REGION_ID,
    accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  });

  // Check if bucket exists, create if not
  try {
    await client.getBucketInfo(BUCKET_NAME);
    console.log(`✓ Bucket ${BUCKET_NAME} exists`);
  } catch (err) {
    if (err.code === 'NoSuchBucket') {
      console.log(`Creating bucket ${BUCKET_NAME}...`);
      await client.putBucket(BUCKET_NAME);
      console.log(`✓ Bucket created`);
    } else {
      throw err;
    }
  }

  // Upload files from dist
  const distPath = path.resolve(FRONTEND_DIST);
  if (!fs.existsSync(distPath)) {
    console.error(`Frontend dist not found at ${distPath}. Run 'npm run build' first.`);
    process.exit(1);
  }

  async function uploadDirectory(dirPath, prefix = '') {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        await uploadDirectory(filePath, `${prefix}${file}/`);
      } else {
        const objectName = `${prefix}${file}`;
        console.log(`  Uploading ${objectName}...`);
        await client.put(objectName, filePath);
      }
    }
  }

  await uploadDirectory(distPath);
  console.log('✅ Frontend deployed successfully!');
  
  // Return the bucket endpoint for reference
  return `https://${BUCKET_NAME}.oss-${ALIBABA_CLOUD_REGION_ID}.aliyuncs.com`;
}

async function configureCORS() {
  console.log('🔧 Configuring CORS...');
  
  const client = new OSS({
    region: ALIBABA_CLOUD_REGION_ID,
    accessKeyId: ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  });

  try {
    await client.putBucketCORS(BUCKET_NAME, [
      {
        allowedOrigin: '*',
        allowedMethod: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeader: '*',
        exposeHeader: ['Content-Length', 'Content-Type'],
        maxAgeSeconds: 3600,
      }
    ]);
    console.log('✅ CORS configured');
  } catch (err) {
    console.warn('⚠️ CORS configuration warning:', err.message);
  }
}

async function main() {
  console.log('🚀 Starting Alibaba Cloud deployment...\n');
  console.log(`Region: ${ALIBABA_CLOUD_REGION_ID}`);
  console.log(`Access Key: ${ALIBABA_CLOUD_ACCESS_KEY_ID.substring(0, 8)}...\n`);

  try {
    const frontendUrl = await deployFrontend();
    await configureCORS();
    
    console.log('\n🎉 Deployment complete!');
    console.log(`\n📍 Frontend URL: ${frontendUrl}`);
    console.log('\nNext steps:');
    console.log('1. Configure your domain DNS to point to the OSS bucket');
    console.log('2. Set up CDN for better performance');
    console.log('3. Deploy backend to ECS/FC');
  } catch (err) {
    console.error('\n❌ Deployment failed:', err.message);
    process.exit(1);
  }
}

main();

