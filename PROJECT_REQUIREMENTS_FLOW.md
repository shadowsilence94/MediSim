# MediSim Platform Requirements and Workflow Baseline

Last updated: 2026-03-18
Owner: NLP Project Team
Purpose: Baseline requirements document for web app flow and agent workflow. This file is intended to be edited as requirements evolve.

## 1) Current Project Structure (As-Is)

```
MediSim/
├── Dockerfile
├── README.md
├── PROJECT_REQUIREMENTS_FLOW.md
├── data/
│   ├── medisim_diagnostic_model.pth
│   ├── vocab.pth
│   ├── label_encoder.pth
│   └── ...
├── notebooks/
│   ├── 01_data_pipeline.ipynb
│   ├── 02_baseline_training.ipynb
│   ├── 03_multimodal_fusion_training.ipynb
│   └── 04_agentic_triage_deployment.ipynb
├── reports/
│   ├── Phase1/
│   └── Phase2/
└── web_app_pro/
    ├── backend/
    │   ├── main.py
    │   ├── agents.py
    │   ├── models.py
    │   ├── requirements.txt
    │   ├── .env
    │   └── keys/
    └── frontend/
        ├── package.json
        ├── .env
        ├── src/
        │   ├── App.tsx
        │   ├── lib/
        │   │   ├── api.ts
        │   │   └── firebase.ts
        │   ├── views/
        │   │   ├── DiagnosticView.tsx
        │   │   ├── TriageView.tsx
        │   │   ├── HistoryView.tsx
        │   │   ├── SettingsView.tsx
        │   │   ├── AdminView.tsx
        │   │   └── AppManagementView.tsx
        │   └── components/
        └── ...
```

## 2) Current Platform Scope (As-Is)

### 2.1 Feature Modules

- Multimodal Diagnostic Assistant
  - Inputs: chest X-ray image + symptom text
  - Inference: ResNet18 + biLSTM fusion model
  - Output: predicted label + confidence + details
- Agentic Triage and Consultation
  - Multi-agent pipeline: Triage Nurse -> Specialist -> Fact Checker
  - Optional RAG context from user EMR, previous diagnosis, previous triage, physician notes

### 2.2 Roles and Permissions

- patient
  - Can run diagnosis and triage for own account
  - Can view own cases and own records
- physician
  - Can view all care cases and feedback
  - Can update case status and participate in case messaging
- admin
  - Full physician rights plus user role management
  - API key policy management (general key and access grants)

## 3) Current User Workflow (As-Is)

### 3.1 Authentication and Session

1. User signs in via Firebase Auth (Google Sign-In).
2. Frontend validates session and fetches profile from `/me`.
3. If no API key route is available for triage usage, frontend may route user to Settings first.

### 3.2 Diagnostic Workflow

1. User opens Diagnostic module.
2. User uploads chest X-ray and enters symptom narrative.
3. Frontend calls `/diagnose` with multipart form data.
4. Backend performs image + text preprocessing and model inference.
5. Result is returned and persisted to `diagnosis_records`.
6. User can submit diagnostic feedback to `/feedback`.

### 3.3 Triage Workflow

1. User opens Triage module.
2. Frontend checks `/settings/key-status`.
3. User submits triage message to `/triage`.
4. Backend resolves API key source (personal or general).
5. Backend builds RAG context from Firestore history and EMR profile.
6. Agent orchestration runs: Nurse -> Specialist -> Fact Checker.
7. Responses and case metadata are saved in `triage_sessions`.
8. User can submit triage feedback to `/feedback`.

### 3.4 Care Ops Workflow

1. Clinician/Admin accesses care case list via `/care/cases`.
2. Case status can be updated via `/care/cases/{case_id}/status`.
3. Threaded case communication uses:
   - GET `/care/cases/{case_id}/messages`
   - POST `/care/cases/{case_id}/messages`
   - DELETE `/care/cases/{case_id}/messages/{message_id}` (admin/physician only)

## 4) Current Agent Workflow (As-Is)

### 4.1 Orchestration Logic

1. Triage Nurse Agent
   - Performs empathetic intake.
   - Captures urgency signals and symptom clarifications.
   - Avoids final diagnosis.
2. Specialist Agent
   - Builds differential-oriented advice from nurse report and context.
   - Provides next actions and warnings.
3. Fact-Checker Agent
   - Audits specialist output for unsupported or unsafe claims.
   - Produces verified response with supported, uncertain, and safe-next-action framing.

### 4.2 Model Provider and Key Policy

- Primary provider currently configured: Google Gemini 2.5 Flash
- Alternate provider supported in code: OpenAI
- Key selection order in backend:
  1. User personal API key
  2. General API key (if role/access allows)
  3. Reject request with actionable message

## 5) Setup Requirements (Current)

### 5.1 Backend

- Python 3.10+
- Install dependencies from `web_app_pro/backend/requirements.txt`
- Required services:
  - Firebase Admin (service account or default credentials)
  - Firestore database
  - LLM API key source (personal or general)
- Required model assets in `data/`:
  - `medisim_diagnostic_model.pth`
  - `vocab.pth`
  - `label_encoder.pth`

### 5.2 Frontend

- Node.js 20+
- Install dependencies from `web_app_pro/frontend/package.json`
- Configure frontend env:
  - `VITE_API_BASE_URL`

### 5.3 Backend Environment Variables

- `CORS_ALLOWED_ORIGINS` (comma-separated list)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (optional if using default credentials)
- `ADMIN_EMAILS` (or `ADMIN_EMAIL`) for bootstrap admin assignment
- `GOOGLE_API_KEY` (optional fallback if key not in Firestore)
- `OPENAI_API_KEY` (optional when provider switched to openai)

## 6) Data Stores (Current)

Firestore collections currently used:

- `users`
- `emr_profiles`
- `emr_notes`
- `config` (for app secrets like general API key)
- `api_requests`
- `diagnosis_records`
- `triage_sessions`
- `care_case_messages`
- `feedback_records`

## 7) API Baseline (Current)

### 7.1 Core

- GET `/`
- GET `/me`

### 7.2 Clinical Records and EMR

- GET `/emr/profile`
- POST `/emr/profile`
- POST `/emr/notes`
- GET `/emr/notes`
- GET `/records/history`
- DELETE `/records/history/{record_type}/{record_id}`

### 7.3 Diagnostics and Triage

- POST `/diagnose`
- POST `/triage`

### 7.4 Key and Access Settings

- POST `/settings/personal-api-key`
- POST `/settings/general-api-key`
- POST `/settings/general-api-access`
- POST `/settings/request-general-api`
- GET `/settings/key-status`

### 7.5 Admin and Care Ops

- GET `/admin/api-requests`
- GET `/admin/users`
- POST `/admin/users/role`
- POST `/admin/users/roles/bulk`
- GET `/care/cases`
- GET `/care/my-cases`
- PATCH `/care/cases/{case_id}/status`
- GET `/care/cases/{case_id}/messages`
- POST `/care/cases/{case_id}/messages`
- DELETE `/care/cases/{case_id}/messages/{message_id}`

### 7.6 Feedback

- POST `/feedback`
- GET `/feedback/all`

## 8) Change Request Section (To Be Edited by Team)

Use this section to define what to add, change, or remove. I will use these entries to implement next steps.

### 8.1 Workflow Changes Requested

- [ ] WRK-001:
- [ ] WRK-002:
- [ ] WRK-003:

### 8.2 Agent Behavior Changes Requested

- [ ] AGT-001:
- [ ] AGT-002:
- [ ] AGT-003:

### 8.3 UI and UX Flow Changes Requested

- [ ] UI-001:
- [ ] UI-002:
- [ ] UI-003:

### 8.4 API and Data Contract Changes Requested

- [ ] API-001:
- [ ] API-002:
- [ ] API-003:

### 8.5 Security and Access Policy Changes Requested

- [ ] SEC-001:
- [ ] SEC-002:
- [ ] SEC-003:

## 9) Acceptance Checklist for Next Iteration

Mark complete when implemented and verified.

- [ ] Updated frontend workflow reflects approved user journey.
- [ ] Updated agent workflow matches approved clinical safety flow.
- [ ] Backend endpoints and payloads are aligned with UI.
- [ ] Role and permission behavior is tested for patient/physician/admin.
- [ ] Error handling and user guidance are clear for missing API keys.
- [ ] Firestore writes and reads are consistent with new flow.
- [ ] README and deployment docs updated accordingly.
