# MediSim: Multimodal Diagnostic and Agentic Triage System

**MediSim** is an AI-powered medical assistant web application designed to safely process complex health inputs. It serves as our core NLP research project, specifically targeting the reduction of clinical hallucination in generative healthcare applications using hybrid learning pipelines.

## Core Features

MediSim offers two distinct standalone features addressing different triage and diagnostic modalities.

### Feature 1: Multimodal Diagnostic Assistant
- **Purpose**: To provide preliminary diagnostic assessments by combining image data and clinical test inputs.
- **Input**: A patient medical scan (e.g., Chest X-ray) accompanied by their symptom descriptions.
- **Processing**: A deterministic vision-language fusion approach.
  - Images are processed using a Convolutional Neural Network (CNN).
  - Textual symptoms are processed using a Bidirectional LSTM (biLSTM). 
  - Features are aligned via a multimodal fusion layer to output structured diagnoses.
- **Advantage**: Bypasses the high compute requirements of monolithic Large Multimodal Models (LMMs) and provides distinct interpretability limits.

### Feature 2: Multi-Agent Triage & Consultation
- **Purpose**: To interactively gather patient symptom data and propose verified clinical next steps.
- **Processing**: A highly structured interactions loop involving three distinct Large Language Model (LLM) agents powered locally or via fast-inference APIs.
  - **Triage Nurse Agent**: Engages patients to gather unstructured symptom descriptions and medical histories.
  - **Specialist Doctor Agent**: Constructs possible differential hypotheses and clinical steps.
  - **Medical Fact-Checker Agent**: Evaluates the specialist's outputs against clinical safety guidelines to actively block generative hallucination or unsafe recommendations.

## Project Architecture (Phase 2 Focus)

During **Phase 2**, we established the core hypotheses of our system:
1. Multimodal baseline fusions can compete effectively with heavy LMMs in constrained environments.
2. A Multi-Agent debate structure drastically mitigates clinical AI hallucination compared to standard single-prompt systems.

### Directory Structure
```
MediSim/
├── data/                  # Standardized clinical datasets (e.g., IU X-Ray extracts)
├── notebooks/             # Jupyter notebooks containing baseline training pipelines
├── reports/
│   └── Phase2/            # ACL-formatted PDF Proposal, presentation deck, and LaTeX sources
├── web_app/               # The upcoming user-facing interface (Streamlit application)
└── README.md              # This file
```

## Setup and Installation
*Note: MediSim is currently in active development. Complete integration targets Phase 3.*

**Requirements:**
- Python 3.10+
- PyTorch (for the Multimodal CNN/biLSTM baselines)
- LangChain / LlamaIndex (for Multi-Agent orchestration)
- Streamlit (for the Web Interface)

1. **Clone the repository**
   ```bash
   git clone https://github.com/shadowsilence94/MediSim.git
   cd MediSim
   ```
2. **Install Dependencies** (Placeholder for the final requirements file)
   ```bash
   pip install -r requirements.txt
   ```
3. **Running the Web App** (Scheduled for Phase 3)
   ```bash
   streamlit run web_app/app.py
   ```

## Team Members
- Htut Ko Ko (st126010)
- Imtiaz Ahmad (st126685)
- Michael R. Lacar (st126161)
- Aashutosh Raut (st126438)

## References & Readings
The architectural choices for MediSim are modeled after state-of-the-art papers exclusively retrieved from the ACL Anthology, emphasizing safe conversation generation and lightweight clinical representation learning. Refer to `reports/Phase2/report.pdf` for the full methodology and literature review.
