"""
One-time script to set HF Space secrets for MediSim.
Reads local Firebase credentials and sets them as Space secrets.
Run: python3 setup_hf_secrets.py
"""
import json, os
from huggingface_hub import HfApi

SPACE_ID = "shadowsilence/medisim"
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "web_app_pro", "backend")
FRONTEND_ENV = os.path.join(os.path.dirname(__file__), "web_app_pro", "frontend", ".env")
SA_PATH = os.path.join(BACKEND_DIR, "keys", "firebase-service-account.json")

api = HfApi()

# ---- 1. Read Firebase service account JSON (for backend runtime) ----
with open(SA_PATH) as f:
    sa_json = json.dumps(json.load(f))

# ---- 2. Read frontend .env values ----
fe_vars = {}
with open(FRONTEND_ENV) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            fe_vars[key.strip()] = val.strip()

# ---- 3. Define all secrets to set ----
secrets = {
    # Backend runtime secrets
    "FIREBASE_SERVICE_ACCOUNT_JSON": sa_json,
    "ADMIN_EMAILS": "htutkoko1994@gmail.com",
    "CORS_ALLOWED_ORIGINS": "https://shadowsilence-medisim.hf.space,http://localhost:5173",
    "LOAD_MODEL_ON_STARTUP": "true",

    # Frontend build-time secrets (Vite reads VITE_* at build)
    "VITE_FIREBASE_PROJECT_ID": fe_vars.get("VITE_FIREBASE_PROJECT_ID", ""),
    "VITE_FIREBASE_APP_ID": fe_vars.get("VITE_FIREBASE_APP_ID", ""),
    "VITE_FIREBASE_API_KEY": fe_vars.get("VITE_FIREBASE_API_KEY", ""),
    "VITE_FIREBASE_AUTH_DOMAIN": fe_vars.get("VITE_FIREBASE_AUTH_DOMAIN", ""),
    "VITE_FIREBASE_STORAGE_BUCKET": fe_vars.get("VITE_FIREBASE_STORAGE_BUCKET", ""),
    "VITE_FIREBASE_MESSAGING_SENDER_ID": fe_vars.get("VITE_FIREBASE_MESSAGING_SENDER_ID", ""),
    "VITE_ADMIN_EMAIL": fe_vars.get("VITE_ADMIN_EMAIL", ""),
    "VITE_API_BASE_URL": "https://shadowsilence-medisim.hf.space",
}

print(f"Setting {len(secrets)} secrets on {SPACE_ID}...")
for key, value in secrets.items():
    display_val = value[:30] + "..." if len(value) > 30 else value
    print(f"  → {key} = {display_val}")
    api.add_space_secret(repo_id=SPACE_ID, key=key, value=value)

print(f"\n✅ All secrets set on https://huggingface.co/spaces/{SPACE_ID}")
print("The Space will use these on next rebuild.")
