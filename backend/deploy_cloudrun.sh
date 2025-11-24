#!/bin/bash
# Usage: ./deploy_cloudrun.sh GCP_PROJECT REGION
PROJECT=${1:-"my-gcp-project"}
REGION=${2:-"us-central1"}
IMAGE=gcr.io/${PROJECT}/cmass-sales-backend
docker build -t ${IMAGE} .
docker push ${IMAGE}
gcloud run deploy cmass-sales-backend --image ${IMAGE} --region ${REGION} --platform managed --allow-unauthenticated --set-env-vars PORT=8080
