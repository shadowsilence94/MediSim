---
title: MediSim
emoji: "🩺"
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# MediSim: Multimodal Diagnostic and Agentic Triage System

MediSim is an AI-powered medical assistant web application designed to safely process health inputs. It serves as our core NLP research project, targeting the reduction of clinical hallucination in generative healthcare applications using hybrid learning pipelines and multi-agent orchestration.

## Core Features

MediSim offers two distinct standalone features addressing different triage and diagnostic modalities.

### 1. Multimodal Diagnostic Assistant

- **Purpose**: Provides preliminary diagnostic assessments by combining image data and clinical context.
- **Input**: Medical scans (e.g., Chest X-ray) + Symptom descriptions.
- **Architecture**: A vision-language fusion approach.
  - **Vision**: ResNet-18 Image Encoder.
  - **Text**: biLSTM Text Encoder.
  - **Fusion**: Late-fusion layer with softmax classification.
- **Advantage**: Higher reliability and lower compute requirements than standard large multimodal models in specialized domains.

### 2. Agentic Triage & Consultation

- **Purpose**: Interactively gathers patient symptoms and provides verified clinical guidance.
- **Processing**: A three-agent coordination loop:
  - **Triage Nurse**: Empathetic intake and symptom gathering.
  - **Specialist Doctor**: Constructing differential hypotheses and clinical steps.
  - **Fact-Checker**: Cross-verifying responses against clinical safety guidelines to prevent hallucinations.
- **Advantage**: Drastically mitigates clinical AI hallucination through collaborative verification.

## Project Architecture

The project has transitioned to a professional distributed architecture:

- **Frontend**: React (TypeScript) + Vite with a Premium Glassmorphism UI.
- **Backend**: FastAPI (Python) serving our diagnostic models and agent orchestration.
- **Database/Auth**: Firebase (Auth & Firestore) for secure Google sign-in and persistent user history.

### Directory Structure

```
MediSim/
├── web_app_pro/           # Professional Web Application Suite
│   ├── frontend/          # React + Vite + Tailwind (Glassmorphism UI)
│   └── backend/           # FastAPI + PyTorch + LangChain
├── data/                  # Trained model weights and vocabulary
├── notebooks/             # Training pipelines (ResNet18-biLSTM)
├── reports/               # ACL-formatted project reports
└── README.md              # Project documentation
```

## Setup and Installation

### Backend (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd web_app_pro/backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   python main.py
   ```

### Frontend (React)

1. Navigate to the frontend directory:
   ```bash
   cd web_app_pro/frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Deployment

The project includes a Dockerfile for easy deployment to platforms like Hugging Face Spaces. It serves the React application via FastAPI static mounting.

## Team Members

- Htut Ko Ko (st126010)
- Imtiaz Ahmad (st126685)
- Michael R. Lacar (st126161)
- Aashutosh Raut (st126438)

## References

Refer to reports/Phase2/report.pdf for the full methodology and literature review.
