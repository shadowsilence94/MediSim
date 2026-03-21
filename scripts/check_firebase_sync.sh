#!/usr/bin/env bash
set -euo pipefail

APPLY_CHANGES=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY_CHANGES=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Error: firebase CLI not found."
  exit 1
fi

FIREBASE_PROJECT="$(sed -nE 's/.*"default"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' .firebaserc | head -n1)"
if [[ -z "${FIREBASE_PROJECT}" ]]; then
  echo "Error: Could not parse default project from .firebaserc"
  exit 1
fi

FRONTEND_ENV="web_app_pro/frontend/.env"
FRONTEND_PROJECT=""
if [[ -f "${FRONTEND_ENV}" ]]; then
  FRONTEND_PROJECT="$(sed -nE 's/^VITE_FIREBASE_PROJECT_ID=(.*)$/\1/p' "${FRONTEND_ENV}" | tail -n1 | tr -d '"' | xargs)"
fi

echo "Firebase default project (.firebaserc): ${FIREBASE_PROJECT}"
echo "Frontend VITE_FIREBASE_PROJECT_ID: ${FRONTEND_PROJECT:-<missing>}"

if [[ -n "${FRONTEND_PROJECT}" && "${FRONTEND_PROJECT}" != "${FIREBASE_PROJECT}" ]]; then
  echo "Mismatch detected: frontend project ID differs from .firebaserc default."
  echo "Recommendation: align VITE_FIREBASE_PROJECT_ID with ${FIREBASE_PROJECT}."
  exit 2
fi

echo
echo "Checking Firebase access for project ${FIREBASE_PROJECT}..."
firebase firestore:databases:list --project "${FIREBASE_PROJECT}" >/dev/null
echo "Firestore database access: OK"

echo "Listing Firestore indexes (remote):"
firebase firestore:indexes --project "${FIREBASE_PROJECT}" | head -n 50

echo
echo "Local config files used for sync:"
echo "  - firebase.json"
echo "  - firestore.rules"
echo "  - firestore.indexes.json"

if [[ "${APPLY_CHANGES}" == "true" ]]; then
  echo
  echo "Deploying Firestore rules and indexes to ${FIREBASE_PROJECT}..."
  firebase deploy --only firestore:rules,firestore:indexes --project "${FIREBASE_PROJECT}"
  echo "Sync complete."
else
  echo
  echo "Dry check only."
  echo "Run this to apply sync:"
  echo "  ./scripts/check_firebase_sync.sh --apply"
fi
