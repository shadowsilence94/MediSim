#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <space_id>"
  echo "Example: $0 shadowsilence/MediSim"
  exit 1
fi

SPACE_ID="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFLIGHT_SCRIPT="${ROOT_DIR}/scripts/preflight_machine_sync.sh"

if ! command -v hf >/dev/null 2>&1; then
  echo "Error: hf CLI not found. Install huggingface_hub CLI first."
  exit 1
fi

if [[ -x "${PREFLIGHT_SCRIPT}" ]]; then
  echo "Running cross-machine preflight checks..."
  "${PREFLIGHT_SCRIPT}"
fi

echo "Checking Hugging Face auth..."
hf auth whoami >/dev/null

echo "Ensuring Space exists: ${SPACE_ID}"
# hf repo create "${SPACE_ID}" --repo-type space --space-sdk docker --exist-ok

echo "Uploading MediSim project files to Space..."
cd "${ROOT_DIR}"
hf upload "${SPACE_ID}" . . \
  --repo-type space \
  --exclude ".git/*" \
  --exclude "hf_clean/*" \
  --exclude "hf_clean/**" \
  --exclude "hf_deploy_copy/*" \
  --exclude "hf_deploy_copy/**" \
  --exclude "hf_super_clean/*" \
  --exclude "hf_super_clean/**" \
  --exclude ".env" \
  --exclude "**/.env" \
  --exclude "**/.env.local" \
  --exclude "**/.env.*.local" \
  --exclude ".venv/*" \
  --exclude "venv/*" \
  --exclude "**/.venv/*" \
  --exclude "**/venv/*" \
  --exclude "web_app_pro/backend/keys/*" \
  --exclude "**/.DS_Store" \
  --exclude "**/__pycache__/*" \
  --exclude "**/node_modules/*" \
  --exclude "**/dist/*" \
  --exclude "data/images/*" \
  --exclude "data/images/**" \
  --exclude "notebooks/*" \
  --exclude "reports/*" \
  --exclude "reports/**" \
  --exclude "scripts/*" \
  --exclude "scripts/**" \
  --exclude "DEPLOY_HF_FIREBASE.md" \
  --exclude "PROJECT_REQUIREMENTS_FLOW.md" \
  --exclude "web_app_pro/frontend/public/*" \
  --exclude "web_app_pro/frontend/public/**" \
  --exclude "**/.firebase/*" \
  --exclude "**/*.log" \
  --commit-message "Deploy MediSim container"

echo "Upload complete."
echo "Space URL: https://huggingface.co/spaces/${SPACE_ID}"
echo
echo "Next: set Space Variables/Secrets in Hugging Face UI:"
echo "  - CORS_ALLOWED_ORIGINS=https://<your-space-subdomain>.hf.space,http://localhost:5173"
echo "  - FIREBASE_SERVICE_ACCOUNT_JSON=<service-account-json-as-single-line>"
echo "  - ADMIN_EMAILS=<comma-separated-admin-emails>"
echo "  - Optional: GOOGLE_API_KEY"

