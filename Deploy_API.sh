#!/bin/bash
# --- Deploy_API.sh ---
# Deploy the Time Clock FastAPI backend to Google Cloud Run

set -e

PROJECT_ID="gen-lang-client-0991330675"
REGION="us-central1"
SERVICE_NAME="timeclock-api"
TAG="v$(date +%Y%m%d%H%M%S)"

echo "📦 Building Time Clock API ($SERVICE_NAME) with tag: $TAG..."

gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/$SERVICE_NAME:$TAG \
  "/Users/hosseinasgari/Developer/Time Clock/timeclock-api"

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:$TAG \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --set-env-vars "DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@aws-0-us-west-2.pooler.supabase.com:6543/postgres" \
  --set-env-vars "SUPABASE_URL=https://<PROJECT_REF>.supabase.co" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>" \
  --set-env-vars "SUPABASE_JWT_SECRET=<SUPABASE_JWT_SECRET>" \
  --set-env-vars "^|^ALLOWED_ORIGINS=https://timeclock-admin-bo36s2wolq-uc.a.run.app,https://timeclock-app-bo36s2wolq-uc.a.run.app,http://localhost:5174,http://localhost:5175^|^ENVIRONMENT=production" \
  --set-env-vars "DEBUG=false"

echo "✅ Time Clock API Deployment Finished!"
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🔗 API URL: $SERVICE_URL"
echo "📄 Swagger: $SERVICE_URL/docs"
