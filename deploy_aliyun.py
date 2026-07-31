#!/usr/bin/env python3
"""
Alibaba Cloud Deployment Script for OpenCommerceLens
Deploys frontend to OSS, backend config
"""

import os
import sys
import json
import base64
import hashlib
import hmac
import urllib.request
import urllib.parse
import urllib.error
import time
from pathlib import Path

# Load environment
from dotenv import load_dotenv
load_dotenv('./backend/.env')

# Credentials
ACCESS_KEY_ID = os.getenv('ALIBABA_CLOUD_ACCESS_KEY_ID')
ACCESS_KEY_SECRET = os.getenv('ALIBABA_CLOUD_ACCESS_KEY_SECRET')
REGION_ID = os.getenv('ALIBABA_CLOUD_REGION_ID', 'ap-southeast-1')
BUCKET_NAME = 'opencommercelens-frontend'

if not ACCESS_KEY_ID or not ACCESS_KEY_SECRET:
    print("❌ Missing Alibaba Cloud credentials in backend/.env")
    sys.exit(1)


def create_signature(method, path, params, secret):
    """Create signature for API request (OSS style)"""
    sorted_params = sorted(params.items())
    canonical = '&'.join([f"{urllib.parse.quote(k, safe='')}:{urllib.parse.quote(v, safe='')}" for k, v in sorted_params])
    string_to_sign = f"{method}\n{path}\n{canonical}"
    return base64.b64encode(hmac.new(
        (secret + '&').encode('utf-8') if len(secret) < 32 else secret.encode('utf-8'),
        string_to_sign.encode('utf-8'),
        hashlib.sha1
    ).digest()).decode('utf-8')


def make_request(action, params=None):
    """Make API request to Alibaba Cloud OSS"""
    base_url = f"https://{BUCKET_NAME}.oss-{REGION_ID}.aliyuncs.com"
    
    all_params = {
        'acl': 'public-read',
        'Content-Type': 'application/json',
    }
    
    if params:
        all_params.update(params)
    
    url = base_url
    
    try:
        # Try using oss2 SDK instead
        import oss2
        auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
        bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
        
        # Check if bucket exists
        try:
            bucket.get_bucket_info()
            return {'success': True, 'message': 'Bucket exists'}
        except:
            # Create bucket
            bucket.put_bucket('public-read')
            return {'success': True, 'message': 'Bucket created'}
            
    except Exception as e:
        return {'error': str(e)}


def check_bucket_exists():
    """Check if bucket exists using oss2"""
    import oss2
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    try:
        bucket.get_bucket_info()
        return True
    except oss2.exceptions.NoSuchBucket:
        return False
    except:
        return True  # Assume exists on other errors


def create_bucket():
    """Create OSS bucket using oss2"""
    import oss2
    
    print(f"📦 Setting up bucket: {BUCKET_NAME}")
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    try:
        # Check if exists
        bucket.get_bucket_info()
        print(f"  ✓ Bucket already exists")
        return True
    except oss2.exceptions.NoSuchBucket:
        try:
            # Create bucket with public-read ACL
            bucket.create_bucket(oss2.BUCKET_ACL_PUBLIC_READ)
            print(f"  ✓ Bucket created with public-read ACL")
            return True
        except oss2.exceptions.ServerError as e:
            print(f"  ❌ Failed to create bucket: {e}")
            return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False


def upload_file(local_file, object_name):
    """Upload file to OSS"""
    import oss2
    
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    try:
        bucket.put_object_from_file(object_name, local_file)
        return True
    except Exception as e:
        print(f"  ❌ {object_name}: {e}")
        return False


def upload_directory(dist_path):
    """Upload all files from dist directory"""
    dist_path = Path(dist_path)
    
    if not dist_path.exists():
        print(f"❌ Frontend dist not found at {dist_path}")
        print("   Run: cd frontend && npm run build")
        return False
    
    print(f"\n📁 Uploading files from {dist_path}")
    
    success = 0
    failed = 0
    
    for file_path in dist_path.rglob('*'):
        if file_path.is_file():
            relative_path = file_path.relative_to(dist_path)
            object_name = str(relative_path).replace('\\', '/')
            
            # Skip hidden files
            if any(part.startswith('.') for part in relative_path.parts):
                continue
            
            print(f"  Uploading {object_name}...", end=' ')
            if upload_file(str(file_path), object_name):
                print("✓")
                success += 1
            else:
                failed += 1
    
    print(f"\n  Uploaded: {success} files" + (f", Failed: {failed}" if failed else ""))
    return failed == 0


def configure_cors():
    """Configure CORS for the bucket"""
    print("\n🔧 Configuring CORS...")
    
    import oss2
    from oss2.models import CorsRule
    
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    try:
        # Create fresh CORS rules
        rules = [
            CorsRule(
                allowed_origins=['*'],
                allowed_methods=['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
                allowed_headers=['*'],
                expose_headers=['Content-Length', 'Content-Type', 'x-oss-request-id'],
                max_age_seconds=3600
            )
        ]
        
        bucket.put_bucket_cors(rules)
        print("  ✓ CORS configured")
    except Exception as e:
        print(f"  ⚠️ CORS config warning: {e}")


def set_bucket_acl():
    """Set bucket ACL to public-read or use policy"""
    print("\n🔧 Setting bucket public access...")
    
    import oss2
    
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    # Try ACL first
    try:
        bucket.put_bucket_acl(oss2.BUCKET_ACL_PUBLIC_READ)
        print("  ✓ ACL set to public-read")
        return
    except Exception as acl_error:
        pass
    
    # If ACL fails, try bucket policy
    print("  ℹ️ ACL not allowed, trying bucket policy...")
    try:
        policy = {
            "Version": "1",
            "Statement": [
                {
                    "Action": ["oss:GetObject"],
                    "Effect": "Allow",
                    "Principal": "*",
                    "Resource": f"acs:oss:::{BUCKET_NAME}/*"
                }
            ]
        }
        bucket.put_bucket_policy(json.dumps(policy))
        print("  ✓ Bucket policy set for public read")
    except Exception as e:
        print(f"  ⚠️ Policy warning: {e}")
        print("  ℹ️ Bucket may need manual public access enablement in console")


def set_index_page():
    """Set index page for static website hosting"""
    print("\n🔧 Configuring static website hosting...")
    
    import oss2
    from oss2.models import BucketWebsite
    
    auth = oss2.Auth(ACCESS_KEY_ID, ACCESS_KEY_SECRET)
    bucket = oss2.Bucket(auth, f'oss-{REGION_ID}.aliyuncs.com', BUCKET_NAME)
    
    try:
        bucket.put_bucket_website(BucketWebsite('index.html', 'error.html'))
        print("  ✓ Static website hosting enabled")
    except Exception as e:
        print(f"  ⚠️ Website config warning: {e}")


def main():
    print("🚀 Alibaba Cloud Deployment for OpenCommerceLens\n")
    print(f"Region: {REGION_ID}")
    print(f"Access Key: {ACCESS_KEY_ID[:8]}...")
    print(f"Bucket: {BUCKET_NAME}\n")
    
    # Create/check bucket
    print("📦 Setting up OSS bucket...")
    if not create_bucket():
        print("\n⚠️  Bucket creation failed. Trying to upload anyway...")
    
    # Set ACL
    set_bucket_acl()
    
    # Upload files
    frontend_dist = Path('./frontend/dist')
    if upload_directory(frontend_dist):
        # Configure CORS
        configure_cors()
        
        # Set index page
        set_index_page()
        
        print(f"\n✅ Deployment complete!")
        print(f"\n📍 Frontend URL: https://{BUCKET_NAME}.oss-{REGION_ID}.aliyuncs.com")
        print("\n📝 Next steps:")
        print("1. Point your domain DNS to the OSS bucket endpoint")
        print("2. Enable CDN for better performance")
        print("3. Deploy backend to ECS or Function Compute")
    else:
        print("\n❌ Upload failed")
        sys.exit(1)


if __name__ == '__main__':
    # Install oss2 if not present
    try:
        import oss2
    except ImportError:
        print("Installing oss2 SDK...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'oss2', '-q'])
        import oss2
    
    main()

