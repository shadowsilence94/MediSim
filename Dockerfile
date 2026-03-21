# Build Stage for React Frontend
FROM node:20-alpine as build-stage
WORKDIR /app/frontend
COPY web_app_pro/frontend/package*.json ./
RUN npm ci --include=dev
COPY web_app_pro/frontend/ ./
RUN npm run build

# Final Stage: Python FastAPI + Built Frontend
FROM python:3.10-slim

WORKDIR /app

# Install Python dependencies
COPY web_app_pro/backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY web_app_pro/backend/ ./

# Copy built frontend to backend/static (FastAPI will serve it)
COPY --from=build-stage /app/frontend/dist ./static

# Copy trained data models (Needed for inference)
COPY data/ /app/data/

# Setup env for Hugging Face
ENV PORT=7860
ENV PYTHONUNBUFFERED=1
EXPOSE 7860

# Run the API server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
