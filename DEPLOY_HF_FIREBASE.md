# MediSim Deployment to Hugging Face (Docker) + Firebase Sync

This guide deploys MediSim as a Docker Space and verifies that localhost and Hugging Face use the same Firebase project/rules/indexes.

## 1) Prerequisites

- Hugging Face CLI installed and logged in
- Firebase CLI installed and logged in
- Access to Firebase project: `medisim-nlp-reset-20260317`

Quick checks:

```bash
hf auth whoami
firebase --version
firebase projects:list --json | head -n 40
```

## 2) Validate Firebase Sync Baseline

From the repo root:

```bash
./scripts/check_firebase_sync.sh
```

This checks:

- `.firebaserc` default project
- `VITE_FIREBASE_PROJECT_ID` in frontend env
- Firestore database visibility
- Firestore indexes visibility

Apply rules/indexes sync to remote Firestore:

```bash
./scripts/check_firebase_sync.sh --apply
```

## 3) Deploy Docker Space with `hf`

Choose a Space ID, for example `shadowsilence/MediSim`.

```bash
./scripts/deploy_hf_space.sh shadowsilence/MediSim
```

This will:

- Create the Space as `sdk=docker` if missing
- Upload the repository content to the Space

## 4) Configure Space Variables and Secrets

In Hugging Face Space Settings, set:

Variables:

- `FIREBASE_PROJECT_ID=medisim-nlp-reset-20260317`
- `CORS_ALLOWED_ORIGINS=https://<space-subdomain>.hf.space,http://localhost:5173`
- `ADMIN_EMAILS=htutkoko1994@gmail.com` (or comma-separated list)
- `PORT=7860`

Secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON=<single-line service-account JSON>`
- Optional: `GOOGLE_API_KEY=<fallback key>`
- Optional: `OPENAI_API_KEY=<if using openai provider>`

Notes:

- Backend now supports `FIREBASE_SERVICE_ACCOUNT_JSON` directly, so you do not need to upload a key file.
- `FIREBASE_PROJECT_ID` is required in hosted environments for Firebase token verification stability.
- Frontend and backend must both point to the same Firebase project ID for cross-platform data consistency.

## 5) Post-Deploy Verification

After Space build completes:

- Open Space URL and log in via Google.
- Create/update one EMR profile record in localhost and verify the same record appears in Space.
- Run one diagnostic and one triage on Space, then verify on localhost history page.
- Re-run:

```bash
./scripts/check_firebase_sync.sh
```

## 6) Troubleshooting

- Symptom: Space starts but UI not loading
  - Check Space build logs and ensure Docker build succeeded.
- Symptom: 401/403 API errors
  - Verify `FIREBASE_PROJECT_ID` variable is set in Space.
  - Verify Firebase Auth config in frontend env and CORS origins include Space URL.
- Symptom: Admin account appears as normal user
  - Verify `ADMIN_EMAILS` includes the exact login email used in Google Sign-In.
  - Sign out and sign in again so `/me` refreshes the server-side role.
- Symptom: Firestore unavailable
  - Verify `FIREBASE_SERVICE_ACCOUNT_JSON` secret is valid JSON.
- Symptom: model not loading
  - Ensure `data/` assets are uploaded and present in image.
