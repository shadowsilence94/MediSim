# syntax=docker/dockerfile:1.4
# ============================================================
# MediSim Docker Build — Hugging Face Spaces (Docker SDK)
# Secrets are injected via HF Space Secrets, NOT baked into git.
# ============================================================

# ---- Stage 1: Build React Frontend ----
FROM node:20-alpine AS build-stage
WORKDIR /app/frontend

# Install deps first (layer cache)
COPY web_app_pro/frontend/package*.json ./
RUN npm ci --include=dev

# Copy source
COPY web_app_pro/frontend/ ./

# Mount HF Secrets and export them before running build
RUN --mount=type=secret,id=VITE_FIREBASE_PROJECT_ID \
    --mount=type=secret,id=VITE_FIREBASE_APP_ID \
    --mount=type=secret,id=VITE_FIREBASE_API_KEY \
    --mount=type=secret,id=VITE_FIREBASE_AUTH_DOMAIN \
    --mount=type=secret,id=VITE_FIREBASE_STORAGE_BUCKET \
    --mount=type=secret,id=VITE_FIREBASE_MESSAGING_SENDER_ID \
    --mount=type=secret,id=VITE_ADMIN_EMAIL \
    export VITE_FIREBASE_PROJECT_ID=$(cat /run/secrets/VITE_FIREBASE_PROJECT_ID 2>/dev/null) && \
    export VITE_FIREBASE_APP_ID=$(cat /run/secrets/VITE_FIREBASE_APP_ID 2>/dev/null) && \
    export VITE_FIREBASE_API_KEY=$(cat /run/secrets/VITE_FIREBASE_API_KEY 2>/dev/null) && \
    export VITE_FIREBASE_AUTH_DOMAIN=$(cat /run/secrets/VITE_FIREBASE_AUTH_DOMAIN 2>/dev/null) && \
    export VITE_FIREBASE_STORAGE_BUCKET=$(cat /run/secrets/VITE_FIREBASE_STORAGE_BUCKET 2>/dev/null) && \
    export VITE_FIREBASE_MESSAGING_SENDER_ID=$(cat /run/secrets/VITE_FIREBASE_MESSAGING_SENDER_ID 2>/dev/null) && \
    export VITE_ADMIN_EMAIL=$(cat /run/secrets/VITE_ADMIN_EMAIL 2>/dev/null) && \
    export VITE_API_BASE_URL="" && \
    npm run build

# ---- Stage 2: Python FastAPI + Built Frontend ----
FROM python:3.10-slim
WORKDIR /app

# Install Python dependencies
COPY web_app_pro/backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY web_app_pro/backend/ ./

# Copy built frontend to backend/static (FastAPI serves it)
COPY --from=build-stage /app/frontend/dist ./static

# Copy trained model weights (needed for inference)
COPY data/ /app/data/

# HF Spaces uses port 7860
ENV PORT=7860
ENV PYTHONUNBUFFERED=1
EXPOSE 7860

# Run the API server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
