#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_ENV="${ROOT_DIR}/web_app_pro/frontend/.env"
BACKEND_ENV="${ROOT_DIR}/web_app_pro/backend/.env"
FIREBASE_RC="${ROOT_DIR}/.firebaserc"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
}

echo "== MediSim Cross-Machine Preflight =="

require_cmd node
require_cmd npm
require_cmd python3
require_cmd firebase
require_cmd hf

NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js v20+ required. Found: $(node -v)"
  exit 1
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "Python: $(python3 --version)"
echo "firebase: $(firebase --version)"
echo "hf: $(hf --version 2>/dev/null || echo 'installed')"

if [[ ! -f "${FIREBASE_RC}" ]]; then
  echo "Missing .firebaserc in repo root."
  exit 1
fi

DEFAULT_PROJECT="$(sed -nE 's/.*"default"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "${FIREBASE_RC}" | head -n1)"
if [[ -z "${DEFAULT_PROJECT}" ]]; then
  echo "Could not parse default Firebase project from .firebaserc"
  exit 1
fi

echo "Firebase default project: ${DEFAULT_PROJECT}"

# Cross-machine safety: never rely on repo-local synced virtual environments.
VENV_DIRS="$(find "${ROOT_DIR}" -maxdepth 4 -type d \( -name '.venv' -o -name 'venv' \) 2>/dev/null || true)"
if [[ -n "${VENV_DIRS}" ]]; then
  echo ""
  echo "Detected virtualenv folder(s) inside synced repo:"
  echo "${VENV_DIRS}"
  echo ""
  echo "This is unsafe across machines (partial sync causes broken envs)."
  echo "Use one local venv per machine OUTSIDE the synced folder, for example:"
  echo "  python3 -m venv \"$HOME/.venvs/medisim\""
  echo "  source \"$HOME/.venvs/medisim/bin/activate\""
  echo "Then reinstall dependencies locally on each machine."
  exit 3
fi

if [[ ! -f "${FRONTEND_ENV}" ]]; then
  echo "Missing ${FRONTEND_ENV}. Create it from web_app_pro/frontend/.env.example"
  exit 1
fi
if [[ ! -f "${BACKEND_ENV}" ]]; then
  echo "Missing ${BACKEND_ENV}. Create it from web_app_pro/backend/.env.example"
  exit 1
fi

FRONTEND_PROJECT="$(sed -nE 's/^VITE_FIREBASE_PROJECT_ID=(.*)$/\1/p' "${FRONTEND_ENV}" | tail -n1 | tr -d '"' | xargs)"
if [[ -z "${FRONTEND_PROJECT}" ]]; then
  echo "VITE_FIREBASE_PROJECT_ID is missing in frontend .env"
  exit 1
fi
if [[ "${FRONTEND_PROJECT}" != "${DEFAULT_PROJECT}" ]]; then
  echo "Project mismatch: frontend .env (${FRONTEND_PROJECT}) != .firebaserc (${DEFAULT_PROJECT})"
  exit 2
fi

if ! grep -q '^ADMIN_EMAILS=' "${BACKEND_ENV}"; then
  echo "ADMIN_EMAILS missing in backend .env"
  exit 1
fi

echo "Env consistency checks passed."

echo "Recommended install commands on each machine:"
echo "  cd web_app_pro/frontend && npm ci"
echo "  python3 -m venv \"$HOME/.venvs/medisim\""
echo "  source \"$HOME/.venvs/medisim/bin/activate\""
echo "  cd web_app_pro/backend && python3 -m pip install -r requirements.txt"
echo "  ./scripts/check_firebase_sync.sh"
