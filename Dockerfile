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

# Firebase config is injected as build-time args (set via HF Secrets)
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_ADMIN_EMAIL
# In HF Spaces Docker, frontend is served by same backend, so API is relative
ARG VITE_API_BASE_URL=""

# Vite reads VITE_* env vars at build time
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_ADMIN_EMAIL=$VITE_ADMIN_EMAIL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

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
