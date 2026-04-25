---
title: MediSim
emoji: "🩺"
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# MediSim: Multimodal Diagnostic and Safe Agentic Triage System

**Live Deployment**: [Hugging Face Space](https://huggingface.co/spaces/htutkoko/MediSim)

MediSim is an AI-powered medical assistant web application designed to safely process health inputs. It serves as our final Phase 4 NLP research project, targeting the reduction of clinical hallucination in generative healthcare applications using hybrid multimodal learning pipelines, multi-agent orchestration, and real-time RAG (Retrieval-Augmented Generation) verification.

## Core Features

MediSim offers two distinct standalone features addressing different triage and diagnostic modalities.

### 1. Multimodal Diagnostic Assistant

- **Purpose**: Provides preliminary diagnostic assessments by combining visual radiological data and textual clinical context.
- **Input**: Medical scans (Chest X-ray) + Symptom descriptions.
- **Architecture**: A vision-language fusion approach.
  - **Vision Backbone**: ResNet-18 Image Encoder.
  - **Text Backbone**: Bio\_ClinicalBERT text embeddings.
  - **Fusion**: Late-fusion bottleneck layer mapping to a 128-dimensional latent space with softmax classification.
- **Advantage**: Achieves **51.08% accuracy** and structurally limits hallucinations by requiring both visual and textual signals to fire simultaneously for rare pathologies.

### 2. Multi-Agent Triage & RAG Consultation

- **Purpose**: Interactively gathers patient symptoms and provides verified clinical guidance safely.
- **Processing**: A three-agent coordination loop:
  - **Triage Nurse (Agent 1)**: Empathetic intake and symptom gathering.
  - **Specialist Doctor (Agent 2)**: Constructing differential hypotheses and clinical steps.
  - **Fact-Checker (Agent 3)**: Cross-verifies responses against the patient's Electronic Medical Record (EMR) stored in Firestore using RAG. If contraindications (e.g., allergies) are detected, it triggers a hard fallback warning.
- **HCI Evaluation**: A Phase 4 Human-in-the-Loop study ($N=26$) confirmed that the multi-agent system with visible Fact-Checker telemetry significantly increased clinical trust compared to standard LLM endpoints.

## Project Architecture & Technologies

The project utilizes a highly decoupled, distributed architecture:

- **Frontend**: React (TypeScript) + Vite with a Premium Glassmorphism UI.
- **Backend**: FastAPI (Python) serving our PyTorch models and LangChain orchestrators.
- **Database/Auth**: Firebase (Auth & Firestore) for secure Google sign-in and patient EMR data persistence.
- **CI/CD pipeline**: Automated GitHub Actions directly deploying to Hugging Face Spaces.
- **Telemetry**: Weights & Biases (WandB) for immutable logging of evaluation metrics and interaction arrays.

### Directory Structure

```
MediSim/
├── web_app_pro/           # Professional Web Application Suite
│   ├── frontend/          # React + Vite + Tailwind 
│   └── backend/           # FastAPI + PyTorch + LangChain
├── reports/               # Final Project Reports & HCI Forms (Phase 4)
├── .github/workflows/     # CI/CD deployment pipelines
└── README.md              # Project documentation
```

## Setup and Installation (Local Development)

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

## Automated Deployment

The project is containerized via a root `Dockerfile` and continuously integrated. Pushing to the `main` branch triggers the GitHub Action (`deploy-hf-spaces.yml`) which builds and deploys the application directly to Hugging Face Spaces.

## Team Members
- Htut Ko Ko (st126010)
- Imtiaz Ahmad (st126685)
- Michael R. Lacar (st126161)
- Aashutosh Raut (st126438)

## Documentation
Please refer to the `reports/Phase4/1_Final_Report_Phase4.pdf` for the full methodology, model training procedures, and comprehensive HCI evaluation results.
