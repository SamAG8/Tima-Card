#!/bin/bash
# --- Deploy_Admin.sh ---
# Deploy the Time Clock Admin Panel to Google Cloud Run

set -e

PROJECT_ID="gen-lang-client-0991330675"
REGION="us-central1"
SERVICE_NAME="timeclock-app"
TAG="v$(date +%Y%m%d%H%M%S)"
API_URL="https://timeclock-api-bo36s2wolq-uc.a.run.app"

SUPABASE_URL="https://nedljlorkpwpacuphqwb.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_aWw943ZLxWe4dz0i3OYrkA_oZb7Tqab"

echo "📦 Building Time Clock Admin ($SERVICE_NAME) with tag: $TAG..."

gcloud builds submit \
  --config "/Users/hosseinasgari/Developer/Time Clock/cloudbuild_app.yaml" \
  --substitutions "_IMAGE_NAME=gcr.io/$PROJECT_ID/$SERVICE_NAME:$TAG,_VITE_SUPABASE_URL=$SUPABASE_URL,_VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY,_VITE_API_BASE_URL=$API_URL" \
  "/Users/hosseinasgari/Developer/Time Clock/timeclock-app"

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:$TAG \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 80 \
  --memory 256Mi

echo "✅ Time Clock Admin Deployment Finished!"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🔗 Admin URL: $SERVICE_URL"
