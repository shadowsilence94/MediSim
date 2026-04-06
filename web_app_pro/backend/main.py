from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
import uvicorn
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image, UnidentifiedImageError
import io
import os
import sys
import json
import re
from datetime import datetime, timezone
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth, firestore
from pydantic import BaseModel

# Import local modules
from models import get_model
from agents import MediSimAgentSystem

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "../frontend"))
STATIC_DIR = os.path.join(FRONTEND_DIR, "dist")
STATIC_DIR_CANDIDATES = [
    STATIC_DIR,
    os.path.join(BACKEND_DIR, "static"),
    "/app/static",
    "/app/web_app_pro/frontend/dist",
    "/app/web_app_pro/backend/static",
]

load_dotenv(os.path.join(BACKEND_DIR, ".env"))


def resolve_static_dir() -> str:
    for candidate in STATIC_DIR_CANDIDATES:
        if os.path.isfile(os.path.join(candidate, "index.html")):
            return candidate
    return STATIC_DIR


def _get_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]

app = FastAPI(title="MediSim API")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin
raw_cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip()
raw_cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
firebase_project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
resolved_cred_path = (
    raw_cred_path
    if os.path.isabs(raw_cred_path)
    else os.path.join(BACKEND_DIR, raw_cred_path)
)


def firebase_options() -> dict:
    opts = {}
    if firebase_project_id:
        opts["projectId"] = firebase_project_id
    return opts

if not firebase_admin._apps:
    try:
        if raw_cred_json:
            cred = credentials.Certificate(json.loads(raw_cred_json))
            firebase_admin.initialize_app(cred, options=firebase_options())
            print("Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT_JSON")
        elif raw_cred_path and os.path.exists(resolved_cred_path):
            cred = credentials.Certificate(resolved_cred_path)
            firebase_admin.initialize_app(cred, options=firebase_options())
            print(f"Firebase Admin initialized with service account: {resolved_cred_path}")
        else:
            # Fallback to default credentials (useful for cloud environments)
            firebase_admin.initialize_app(options=firebase_options())
            print("Firebase Admin initialized with application default credentials")
    except Exception as exc:
        print(
            "WARNING: Firebase Admin not initialized. "
            "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in backend/.env. "
            f"Reason: {exc}"
        )

# Global state for model
model_data = None


def ensure_model_loaded():
    global model_data
    if model_data is None:
        load_diagnostic_model()
    return model_data


def normalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")):
        value = value[1:-1].strip()
    return value


def get_bootstrap_admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS") or os.getenv("ADMIN_EMAIL") or ""
    tokens = re.split(r"[,;\s]+", raw.strip()) if raw else []
    emails = {normalize_email(item) for item in tokens if item.strip()}
    return emails


def is_bootstrap_admin_email(email: str) -> bool:
    return normalize_email(email) in get_bootstrap_admin_emails()


def firestore_client_or_503():
    try:
        return firestore.client()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Firestore unavailable: {str(exc)}")


def get_user_profile(db, user_email: str):
    normalized_email = normalize_email(user_email)
    user_ref = db.collection('users').document(normalized_email)
    user_doc = user_ref.get()
    bootstrap_admin = is_bootstrap_admin_email(normalized_email)

    if user_doc.exists:
        profile = user_doc.to_dict() or {}
        # Keep admin bootstrap deterministic for known admin emails.
        if bootstrap_admin and get_user_role(profile) != 'admin':
            profile['role'] = 'admin'
            profile['is_admin'] = True
            profile['updated_at'] = datetime.now(timezone.utc)
            user_ref.set(
                {
                    'role': 'admin',
                    'is_admin': True,
                    'updated_at': profile['updated_at'],
                },
                merge=True,
            )
        return user_ref, profile

    default_profile = {
        'email': normalized_email,
        'display_name': normalized_email.split('@')[0],
        'role': 'admin' if bootstrap_admin else 'patient',
        'is_admin': bootstrap_admin,
        'can_use_general_api': False,
        'personal_api_key': '',
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
    }
    user_ref.set(default_profile, merge=True)
    return user_ref, default_profile


def _to_clean_list(value: str):
    if not value:
        return []
    return [item.strip() for item in value.split(',') if item.strip()]


def get_user_role(profile: dict):
    role = str(profile.get('role', '')).strip().lower()
    if role in {'admin', 'physician', 'patient'}:
        return role
    if profile.get('is_admin', False):
        return 'admin'
    return 'patient'


def require_roles(profile: dict, allowed_roles: set[str], message: str):
    if get_user_role(profile) not in allowed_roles:
        raise HTTPException(status_code=403, detail=message)


def get_or_create_emr_profile(db, user_email: str):
    emr_ref = db.collection('emr_profiles').document(user_email)
    emr_doc = emr_ref.get()
    if emr_doc.exists:
        return emr_ref, emr_doc.to_dict()

    emr = {
        'user_email': user_email,
        'display_name': user_email.split('@')[0],
        'sex': '',
        'age': None,
        'allergies': [],
        'current_medications': [],
        'medication_dosage': '',
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
    }
    emr_ref.set(emr, merge=True)
    return emr_ref, emr


def get_general_api_key(db) -> str:
    config_doc = db.collection('config').document('app_secrets').get()
    if not config_doc.exists:
        return ''
    return str((config_doc.to_dict() or {}).get('general_google_api_key') or '').strip()


def resolve_triage_api_key(db, profile: dict):
    personal_api_key = str(profile.get('personal_api_key') or '').strip()
    if personal_api_key:
        return personal_api_key, 'personal', ''

    role = get_user_role(profile)
    general_access_allowed = role == 'admin' or bool(profile.get('can_use_general_api'))
    general_api_key = get_general_api_key(db) if general_access_allowed else ''

    if general_api_key:
        return general_api_key, 'general', ''

    if role == 'admin':
        return (
            None,
            'none',
            'No API key found. Admin account detected but General API key is not configured. '
            'Open Settings and set the General API key, or add a personal key.',
        )

    if general_access_allowed:
        return (
            None,
            'none',
            'No API key found. Your general-access permission is enabled, but the '
            'administrator has not configured the General API key yet.',
        )

    return (
        None,
        'none',
        'No API key found. Please add your own key in Settings or request General Access from Administrator.',
    )


def build_rag_context(db, user_email: str, latest_message: str):
    # Fetch without .order_by to avoid requiring Firebase composite indexes
    triage_docs = db.collection('triage_sessions').where('user_email', '==', user_email).stream()
    diagnosis_docs = db.collection('diagnosis_records').where('user_email', '==', user_email).stream()
    physician_note_docs = db.collection('emr_notes').where('user_email', '==', user_email).stream()

    _, emr_profile = get_or_create_emr_profile(db, user_email)

    triage_history = []
    for doc in triage_docs:
        item = doc.to_dict()
        responses = item.get('responses', {})
        if any(responses.values()):
            triage_history.append({
                'intake_summary': responses.get('nurse', ''),
                'specialist_notes': responses.get('specialist', ''),
                'final_discharge': responses.get('final_nurse', ''),
                'fact_checker_audit': responses.get('verified', ''),
                'created_at': str(item.get('created_at', '')),
                'session_id': doc.id
            })

    diagnosis_history = []
    for doc in diagnosis_docs:
        item = doc.to_dict()
        pred = item.get('prediction', {})
        diagnosis_history.append({
            'label': pred.get('label', ''),
            'confidence': pred.get('confidence', 0.0),
            'symptoms': item.get('symptoms', ''),
            'created_at': str(item.get('created_at', '')),
        })

    physician_notes = []
    for doc in physician_note_docs:
        item = doc.to_dict()
        physician_notes.append({
            'title': item.get('title', ''),
            'source_type': item.get('source_type', 'unknown'),
            'ocr_text': item.get('ocr_text', '')[:1200],
            'created_at': str(item.get('created_at', '')),
        })

    # Sort in memory and take the top 5 most recent records
    triage_history = sorted(triage_history, key=lambda x: x['created_at'], reverse=True)[:5]
    diagnosis_history = sorted(diagnosis_history, key=lambda x: x['created_at'], reverse=True)[:5]
    physician_notes = sorted(physician_notes, key=lambda x: x['created_at'], reverse=True)[:5]

    return {
        'latest_user_message': latest_message,
        'emr_profile': {
            'display_name': emr_profile.get('display_name', ''),
            'sex': emr_profile.get('sex', ''),
            'age': emr_profile.get('age'),
            'allergies': emr_profile.get('allergies', []),
            'current_medications': emr_profile.get('current_medications', []),
            'medication_dosage': emr_profile.get('medication_dosage', ''),
        },
        'triage_history': triage_history,
        'diagnosis_history': diagnosis_history,
        'physician_notes': physician_notes,
    }


def normalize_symptom_tokens(text: str, vocab: dict, max_len: int = 50):
    words = text.lower().replace(",", " ").replace(".", " ").split()
    tokens = []
    unknown_count = 0
    
    for w in words:
        if w in vocab:
            tokens.append(vocab[w])
        else:
            tokens.append(vocab.get("<UNK>", 0))
            unknown_count += 1

    if len(tokens) < max_len:
        tokens = tokens + [vocab.get("<PAD>", 0)] * (max_len - len(tokens))
    else:
        tokens = tokens[:max_len]
        
    total_words = len(words)
    unknown_ratio = (unknown_count / total_words) if total_words > 0 else 0.0

    return tokens, len(words), unknown_count, unknown_ratio


def build_diagnostic_findings(label: str, confidence: float, token_count: int, unknown_ratio: float):
    findings = []
    
    if label == "Normal":
        if confidence > 0.85:
            findings.append("No acute cardiopulmonary disease identified.")
            findings.append("Clear lungs and normal cardiac silhouette.")
        else:
            findings.append("Likely normal, but lower confidence suggests slight ambiguity.")
    elif label == "Pneumonia":
        findings.append("Opacities or consolidation consistent with pneumonia.")
        findings.append("Possible lower lobe infiltrates requiring clinical correlation.")
    elif label == "Cardiomegaly":
        findings.append("Enlarged cardiac silhouette observed.")
        findings.append("Possible underlying heart failure or fluid overload.")
    else:
        findings.append(f"Primary indication: {label}.")
        
    if unknown_ratio > 0.4:
        findings.append("Warning: Many symptoms provided are not in the standard medical vocabulary. "
                        "This may reduce the reliability of text fusion.")
    elif token_count < 3:
        findings.append("Note: Very sparse symptom description provided. Model relied heavily on imaging.")
        
    return findings


def build_plain_language_results(top_predictions, confidence: float):
    if not top_predictions:
        return ""
    
    primary = top_predictions[0]
    label = primary['label']
    conf_pct = round(primary['confidence'] * 100)
    
    text = f"The most likely finding is **{label}**, with a certainty of **{conf_pct}%**.\n\n"
    
    if len(top_predictions) > 1:
        text += "Other possibilities considered include:\n"
        for p in top_predictions[1:]:
            text += f"- **{p['label']}** ({round(p['confidence'] * 100)}%)\n"
            
    if conf_pct < 60:
        text += "\n*Note: The certainty is moderate/low. A physician should review the image.*"
        
    return text


def confidence_bucket(conf: float) -> str:
    if conf >= 0.85:
        return "High"
    if conf >= 0.60:
        return "Moderate"
    return "Low"


def load_diagnostic_model():
    global model_data
    base_data_path = os.path.abspath(os.path.join(BACKEND_DIR, "../../data"))
    weights_path = os.path.join(base_data_path, "medisim_diagnostic_model.pth")
    vocab_path = os.path.join(base_data_path, "vocab.pth")
    label_encoder_path = os.path.join(base_data_path, "label_encoder.pth")
    
    if os.path.exists(weights_path):
        vocab = torch.load(vocab_path, weights_only=False)
        label_encoder = torch.load(label_encoder_path, weights_only=False)
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        
        model = get_model(vocab_size=len(vocab), num_classes=len(label_encoder.classes_), device=device)
        model.load_state_dict(torch.load(weights_path, map_location=device))
        model.eval()
        
        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        
        model_data = {
            "model": model,
            "vocab": vocab,
            "label_encoder": label_encoder,
            "device": device,
            "transform": transform
        }
        print(f"Model loaded successfully on {device}")
    else:
        print(f"ERROR: Model weights not found at {weights_path}")


@app.on_event("startup")
async def startup_event():
    try:
        eager = str(os.getenv("LOAD_MODEL_ON_STARTUP", "false")).strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if eager:
            load_diagnostic_model()
        else:
            print("Model eager load disabled; model will load lazily on first /diagnose request.")
    except Exception as exc:
        # Keep API online even if model bootstrap fails in hosted environments.
        print(f"WARNING: Model bootstrap failed during startup: {exc}")


async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split("Bearer ")[1]
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@app.get("/")
async def root():
    static_dir = resolve_static_dir()
    index_file = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(
            index_file,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
    return {"status": "online", "model_loaded": model_data is not None}


@app.get('/me')
async def get_current_user_profile(user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    _, emr_profile = get_or_create_emr_profile(db, user_email)
    role = get_user_role(profile)
    return {
        'status': 'success',
        'profile': {
            'email': user_email,
            'role': role,
            'is_admin': role == 'admin',
            'can_use_general_api': bool(profile.get('can_use_general_api', False)),
            'has_personal_api_key': bool(profile.get('personal_api_key')),
            'emr': {
                'sex': emr_profile.get('sex', ''),
                'age': emr_profile.get('age'),
                'allergies': emr_profile.get('allergies', []),
                'current_medications': emr_profile.get('current_medications', []),
                'medication_dosage': emr_profile.get('medication_dosage', ''),
            },
        },
    }

@app.get('/emr/profile')
async def get_emr_profile(user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, emr = get_or_create_emr_profile(db, user_email)
    return {'status': 'success', 'emr': emr}


@app.post('/emr/profile')
async def upsert_emr_profile(
    display_name: str = Form(''),
    sex: str = Form(''),
    age: str = Form(''),
    allergies: str = Form(''),
    current_medications: str = Form(''),
    medication_dosage: str = Form(''),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    normalized_age = None
    if age and age.strip():
        try:
            normalized_age = int(age)
        except ValueError:
            raise HTTPException(status_code=400, detail='Age must be a whole number.')

    db = firestore_client_or_503()
    emr_ref, _ = get_or_create_emr_profile(db, user_email)
    emr_ref.set(
        {
            'user_email': user_email,
            'display_name': display_name.strip(),
            'sex': sex.strip(),
            'age': normalized_age,
            'allergies': _to_clean_list(allergies),
            'current_medications': _to_clean_list(current_medications),
            'medication_dosage': medication_dosage.strip(),
            'updated_at': datetime.now(timezone.utc),
        },
        merge=True,
    )
    return {'status': 'success', 'message': 'EMR profile saved.'}


@app.post('/emr/notes')
async def upload_emr_note(
    title: str = Form(''),
    ocr_text: str = Form(''),
    note_file: UploadFile | None = File(None),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    created_at = datetime.now(timezone.utc)
    file_bytes = b''
    if note_file:
        file_bytes = await note_file.read()

    note_data = {
        'user_email': user_email,
        'title': title.strip() or (note_file.filename if note_file else 'Physician Note'),
        'source_type': 'uploaded_file' if note_file else 'manual_text',
        'ocr_text': ocr_text.strip(),
        'note_file_name': note_file.filename if note_file else '',
        'note_file_content_type': note_file.content_type if note_file else '',
        'note_file_size_bytes': len(file_bytes),
        'ocr_status': 'provided' if ocr_text.strip() else 'pending',
        'created_at': created_at,
    }
    db.collection('emr_notes').add(note_data)
    return {
        'status': 'success',
        'message': 'EMR note saved. OCR parsing can be added as a next feature.',
    }


@app.get('/emr/notes')
async def list_emr_notes(limit: int = 20, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    notes_docs = (
        db.collection('emr_notes')
        .where('user_email', '==', user_email)
        .order_by('created_at', direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )

    notes = []
    for doc in notes_docs:
        item = doc.to_dict()
        notes.append(
            {
                'id': doc.id,
                'title': item.get('title', ''),
                'source_type': item.get('source_type', ''),
                'ocr_status': item.get('ocr_status', ''),
                'ocr_text_preview': item.get('ocr_text', '')[:240],
                'created_at': str(item.get('created_at', '')),
            }
        )
    return {'status': 'success', 'notes': notes}


@app.post('/settings/personal-api-key')
async def update_personal_api_key(
    api_key: str = Form(...),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    user_ref, profile = get_user_profile(db, user_email)
    user_ref.set(
        {
            'personal_api_key': api_key.strip(),
            'updated_at': datetime.now(timezone.utc),
        },
        merge=True,
    )
    return {'status': 'success', 'message': 'Personal API key saved.'}


@app.post('/settings/general-api-key')
async def update_general_api_key(
    api_key: str = Form(...),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can update the general API key.')

    db.collection('config').document('app_secrets').set(
        {
            'general_google_api_key': api_key.strip(),
            'updated_at': datetime.now(timezone.utc),
            'updated_by': user_email,
        },
        merge=True,
    )
    return {'status': 'success', 'message': 'General API key updated.'}


@app.post('/settings/general-api-access')
async def update_general_api_access(
    target_email: str = Form(...),
    can_use_general_api: bool = Form(...),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can grant/revoke general API access.')

    target = target_email.strip()
    target_ref = db.collection('users').document(target)
    target_ref.set(
        {
            'email': target,
            'can_use_general_api': bool(can_use_general_api),
            'updated_at': datetime.now(timezone.utc),
            'updated_by': user_email,
        },
        merge=True,
    )
    
    if can_use_general_api:
        req_ref = db.collection('api_requests').document(target)
        if req_ref.get().exists:
            req_ref.delete()
            
    return {'status': 'success', 'message': 'User access updated.'}


@app.post('/settings/request-general-api')
async def request_general_api(user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    db.collection('api_requests').document(user_email).set({
        'email': user_email,
        'status': 'pending',
        'created_at': datetime.now(timezone.utc)
    })
    return {'status': 'success', 'message': 'API access request submitted successfully.'}


@app.get('/admin/api-requests')
async def get_api_requests(user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can view API requests.')

    docs = db.collection('api_requests').where('status', '==', 'pending').stream()
    requests = []
    for doc in docs:
        item = doc.to_dict()
        requests.append({
            'email': item.get('email', ''),
            'created_at': str(item.get('created_at', ''))
        })
    return {'status': 'success', 'requests': requests}


@app.get('/settings/key-status')
async def get_key_status(user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    role = get_user_role(profile)

    has_personal_api_key = bool(str(profile.get('personal_api_key') or '').strip())
    general_access_allowed = role == 'admin' or bool(profile.get('can_use_general_api'))
    general_key_configured = bool(get_general_api_key(db))
    triage_ready = has_personal_api_key or (general_access_allowed and general_key_configured)

    if has_personal_api_key:
        active_source = 'personal'
    elif general_access_allowed and general_key_configured:
        active_source = 'general'
    else:
        active_source = 'none'

    if triage_ready:
        guidance = 'Triage is ready. You can submit a case now.'
    elif role == 'admin':
        guidance = 'Configure General API key in Settings, or add your personal API key.'
    elif general_access_allowed:
        guidance = 'General access is enabled, but the admin must set the shared General API key.'
    else:
        guidance = 'Add your personal API key, or request General Access from administrator.'

    return {
        'status': 'success',
        'key_status': {
            'role': role,
            'has_personal_api_key': has_personal_api_key,
            'general_access_allowed': general_access_allowed,
            'general_key_configured': general_key_configured,
            'triage_ready': triage_ready,
            'active_source': active_source,
            'guidance': guidance,
        },
    }


@app.get('/admin/users')
async def list_users(limit: int = 100, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can view user management.')

    docs = db.collection('users').limit(limit).stream()
    users = []
    for doc in docs:
        item = doc.to_dict()
        users.append(
            {
                'email': item.get('email', doc.id),
                'display_name': item.get('display_name', ''),
                'role': get_user_role(item),
                'can_use_general_api': bool(item.get('can_use_general_api', False)),
                'has_personal_api_key': bool(item.get('personal_api_key')),
            }
        )
    users.sort(key=lambda x: x.get('email', '').lower())
    return {'status': 'success', 'users': users}


@app.post('/admin/users/role')
async def update_user_role(
    target_email: str = Form(...),
    role: str = Form(...),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    normalized_role = role.strip().lower()
    if normalized_role not in {'admin', 'physician', 'patient'}:
        raise HTTPException(status_code=400, detail='Role must be admin, physician, or patient.')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can update user roles.')

    target = target_email.strip().lower()
    db.collection('users').document(target).set(
        {
            'email': target,
            'role': normalized_role,
            'is_admin': normalized_role == 'admin',
            'updated_by': user_email,
            'updated_at': datetime.now(timezone.utc),
        },
        merge=True,
    )
    return {'status': 'success', 'message': f'Updated {target} role to {normalized_role}.'}


class BulkRolesRequest(BaseModel):
    roles: dict[str, str]

@app.post('/admin/users/roles/bulk')
async def bulk_update_roles(
    payload: BulkRolesRequest,
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can bulk update user roles.')

    batch = db.batch()
    count = 0
    for target, role in payload.roles.items():
        normalized_role = role.strip().lower()
        if normalized_role in {'admin', 'physician', 'patient'}:
            ref = db.collection('users').document(target)
            batch.set(ref, {
                'email': target,
                'role': normalized_role,
                'is_admin': normalized_role == 'admin',
                'updated_by': user_email,
                'updated_at': datetime.now(timezone.utc),
            }, merge=True)
            count += 1
            
    if count > 0:
        batch.commit()
    return {'status': 'success', 'message': f'Updated {count} roles successfully.'}


@app.post('/feedback')
async def submit_feedback(
    source_type: str = Form(...),
    rating: int = Form(...),
    condition: str = Form(''),
    comment: str = Form(''),
    source_id: str = Form(''),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail='Rating must be between 1 and 5.')

    normalized_type = source_type.strip().lower()
    if normalized_type not in {'triage', 'diagnostic'}:
        raise HTTPException(status_code=400, detail='source_type must be triage or diagnostic.')

    db = firestore_client_or_503()
    db.collection('feedback_records').add(
        {
            'user_email': user_email,
            'source_type': normalized_type,
            'source_id': source_id.strip(),
            'rating': int(rating),
            'condition': condition.strip(),
            'comment': comment.strip(),
            'created_at': datetime.now(timezone.utc),
        }
    )
    return {'status': 'success', 'message': 'Feedback submitted.'}


@app.get('/feedback/all')
async def list_all_feedback(limit: int = 200, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin', 'physician'}, 'Only admin or physician can view all feedback.')

    docs = (
        db.collection('feedback_records')
        .order_by('created_at', direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    feedback = []
    for doc in docs:
        item = doc.to_dict()
        feedback.append(
            {
                'id': doc.id,
                'user_email': item.get('user_email', ''),
                'source_type': item.get('source_type', ''),
                'source_id': item.get('source_id', ''),
                'rating': item.get('rating', 0),
                'condition': item.get('condition', ''),
                'comment': item.get('comment', ''),
                'created_at': str(item.get('created_at', '')),
            }
        )
    return {'status': 'success', 'feedback': feedback}



@app.delete('/feedback/{feedback_id}')
async def delete_feedback(feedback_id: str, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')
    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can delete feedback.')
    doc_ref = db.collection('feedback_records').document(feedback_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail='Feedback not found')
    doc_ref.delete()
    return {'status': 'success', 'message': 'Feedback deleted'}

@app.get('/care/cases')
async def list_care_cases(limit: int = 100, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin', 'physician'}, 'Only admin or physician can view care cases.')

    triage_docs = (
        db.collection('triage_sessions')
        .order_by('created_at', direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )

    cases = []
    for doc in triage_docs:
        item = doc.to_dict()
        cases.append(
            {
                'id': doc.id,
                'user_email': item.get('user_email', ''),
                'message': item.get('message', ''),
                'status': item.get('status', 'pending'),
                'created_at': str(item.get('created_at', '')),
                'responses': item.get('responses', {}),
            }
        )
    return {'status': 'success', 'cases': cases}


@app.get('/care/my-cases')
async def list_my_cases(limit: int = 50, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    docs = (
        db.collection('triage_sessions')
        .where('user_email', '==', user_email)
        .order_by('created_at', direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    cases = []
    for doc in docs:
        item = doc.to_dict()
        case_id = doc.id
        msg_docs = db.collection('care_case_messages').where('case_id', '==', case_id).order_by('created_at').stream()
        thread_messages = []
        for mdoc in msg_docs:
            mdata = mdoc.to_dict()
            thread_messages.append({
                'id': mdoc.id,
                'agent_role': mdata.get('agent_role', 'patient'),
                'message': mdata.get('message', ''),
                'created_at': str(mdata.get('created_at', ''))
            })
            
        cases.append(
            {
                'id': doc.id,
                'user_email': item.get('user_email', user_email),
                'message': item.get('message', ''),
                'status': item.get('status', 'pending'),
                'created_at': str(item.get('created_at', '')),
                'responses': item.get('responses', {}),
                'thread': thread_messages
            }
        )
    return {'status': 'success', 'cases': cases}


@app.patch('/care/cases/{case_id}/status')
async def update_case_status(
    case_id: str,
    status: str = Form(...),
    user: dict = Depends(verify_token)
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin', 'physician'}, 'Only admin or physician can update care case status.')

    valid_statuses = {'pending', 'in_progress', 'settled', 'next_appointment'}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

    doc_ref = db.collection('triage_sessions').document(case_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail='Case not found.')

    doc_ref.update({'status': status})
    return {'status': 'success', 'message': f'Case status updated to {status}'}


@app.delete('/care/cases/{case_id}')
async def delete_care_case(case_id: str, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can delete care cases.')

    case_ref = db.collection('triage_sessions').document(case_id)
    case_doc = case_ref.get()
    if not case_doc.exists:
        raise HTTPException(status_code=404, detail='Case not found.')

    case_ref.delete()

    msg_docs = db.collection('care_case_messages').where('case_id', '==', case_id).stream()
    deleted_messages = 0
    for doc in msg_docs:
        doc.reference.delete()
        deleted_messages += 1

    return {
        'status': 'success',
        'message': f'Case {case_id} deleted with {deleted_messages} related message(s).',
    }


@app.get('/care/cases/{case_id}/messages')
async def list_case_messages(case_id: str, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin', 'physician', 'patient'}, 'Not allowed to view case messages.')

    triage_doc = db.collection('triage_sessions').document(case_id).get()
    if not triage_doc.exists:
        raise HTTPException(status_code=404, detail='Case not found.')

    triage_data = triage_doc.to_dict()
    case_owner = triage_data.get('user_email', '')
    role = get_user_role(profile)
    if role == 'patient' and case_owner != user_email:
        raise HTTPException(status_code=403, detail='Patients can only view their own cases.')

    msg_docs = (
        db.collection('care_case_messages')
        .where('case_id', '==', case_id)
        .order_by('created_at', direction=firestore.Query.ASCENDING)
        .stream()
    )

    messages = []
    for doc in msg_docs:
        item = doc.to_dict()
        messages.append(
            {
                'id': doc.id,
                'sender_email': item.get('sender_email', ''),
                'sender_role': item.get('sender_role', ''),
                'message': item.get('message', ''),
                'agent_role': item.get('agent_role', ''), 
                'created_at': str(item.get('created_at', '')),
            }
        )
    return {'status': 'success', 'messages': messages}


@app.post('/care/cases/{case_id}/messages')
async def post_case_message(
    case_id: str,
    message: str = Form(...),
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    role = get_user_role(profile)
    require_roles(profile, {'admin', 'physician', 'patient'}, 'Not allowed to post case messages.')

    triage_doc = db.collection('triage_sessions').document(case_id).get()
    if not triage_doc.exists:
        raise HTTPException(status_code=404, detail='Case not found.')

    triage_data = triage_doc.to_dict()
    case_owner = triage_data.get('user_email', '')
    if role == 'patient' and case_owner != user_email:
        raise HTTPException(status_code=403, detail='Patients can only post to their own cases.')

    db.collection('care_case_messages').add(
        {
            'case_id': case_id,
            'patient_email': case_owner,
            'sender_email': user_email,
            'sender_role': role,
            'message': message.strip(),
            'created_at': datetime.now(timezone.utc),
        }
    )
    return {'status': 'success', 'message': 'Case message posted.'}


@app.delete('/care/cases/{case_id}/messages/{message_id}')
async def delete_case_message(
    case_id: str,
    message_id: str,
    user: dict = Depends(verify_token),
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    require_roles(profile, {'admin'}, 'Only admin can delete case messages.')

    msg_ref = db.collection('care_case_messages').document(message_id)
    msg_doc = msg_ref.get()
    
    if not msg_doc.exists:
        raise HTTPException(status_code=404, detail='Message not found.')
    
    msg_data = msg_doc.to_dict()
    if msg_data.get('case_id') != case_id:
        raise HTTPException(status_code=400, detail='Message does not belong to this case.')

    msg_ref.delete()
    return {'status': 'success', 'message': 'Message deleted.'}


@app.get('/records/history')
async def get_history(limit: int = 50, user: dict = Depends(verify_token)):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)

    diag_query = db.collection('diagnosis_records').order_by('created_at', direction=firestore.Query.DESCENDING)
    triage_query = db.collection('triage_sessions').order_by('created_at', direction=firestore.Query.DESCENDING)

    if get_user_role(profile) != 'admin':
        diag_query = diag_query.where('user_email', '==', user_email)
        triage_query = triage_query.where('user_email', '==', user_email)

    diagnosis_docs = diag_query.limit(limit).stream()
    triage_docs = triage_query.limit(limit).stream()

    sessions = []
    for doc in diagnosis_docs:
        d = doc.to_dict()
        rtype = 'diagnostic'
        
        symptoms = d.get('symptoms', [])
        symp_text = ', '.join(symptoms) if symptoms else 'No symptoms specified'
        details_text = d.get('prediction', {}).get('details', '')
        summary_text = f"Symptoms: {symp_text}. Details: {details_text}"
        
        full_content = {
            "symptoms": symptoms,
            "details": details_text,
            "image_name": d.get('image_name', ''),
            "image_content_type": d.get('image_content_type', ''),
            "model_prediction_label": d.get('prediction', {}).get('label', ''),
            "model_prediction_confidence": d.get('prediction', {}).get('confidence', 0.0)
        }

        sessions.append({
            'id': doc.id,
            'patientName': d.get('user_email', user_email),
            'type': rtype,
            'fidelity': d.get('prediction', {}).get('confidence', 0.0),
            'date': str(d.get('created_at', '')),
            'summary': summary_text,
            'full_content': full_content
        })

    for doc in triage_docs:
        d = doc.to_dict()
        rtype = 'triage'
        case_id = doc.id
        
        msg_docs = db.collection('care_case_messages').where('case_id', '==', case_id).order_by('created_at').stream()
        thread_messages = []
        for mdoc in msg_docs:
            mdata = mdoc.to_dict()
            thread_messages.append({
                'id': mdoc.id,
                'agent_role': mdata.get('agent_role', 'patient'),
                'message': mdata.get('message', ''),
                'created_at': str(mdata.get('created_at', ''))
            })

        message = d.get('message', '')
        if thread_messages:
            # Use the first message of the thread as the summary proxy
            first_user_msg = next((m['message'] for m in thread_messages if m['agent_role'] == 'patient'), '')
            message = first_user_msg if first_user_msg else message
            
        summary_text = f"Triage Interaction: {message[:100]}..." if len(message) > 100 else (f"Triage Interaction: {message}" if message else "Triage Interaction")
        
        full_content = {
            "message": message,
            "agent_response": d.get('responses', {}),
            "rag_context": d.get('rag_context', {}),
            "thread": thread_messages
        }

        sessions.append({
            'id': case_id,
            'patientName': d.get('user_email', user_email),
            'type': rtype,
            'fidelity': d.get('confidence', 0.85),
            'date': str(d.get('created_at', '')),
            'summary': summary_text,
            'full_content': full_content
        })

    sessions.sort(key=lambda x: x.get('date', ''), reverse=True)
    return {'status': 'success', 'sessions': sessions[:limit]}

@app.delete('/records/history/{record_type}/{record_id}')
async def delete_history_record(
    record_type: str,
    record_id: str,
    user: dict = Depends(verify_token)
):
    user_email = user.get('email')
    if not user_email:
        raise HTTPException(status_code=401, detail='Invalid user profile')

    db = firestore_client_or_503()
    _, profile = get_user_profile(db, user_email)
    
    if record_type not in {'diagnostic', 'triage'}:
        raise HTTPException(status_code=400, detail='Invalid record type.')

    collection_name = 'diagnosis_records' if record_type == 'diagnostic' else 'triage_sessions'
    doc_ref = db.collection(collection_name).document(record_id)
    doc_snap = doc_ref.get()
    
    if not doc_snap.exists:
        raise HTTPException(status_code=404, detail='Record not found.')

    doc_data = doc_snap.to_dict() or {}
    if not profile.get('is_admin') and doc_data.get('user_email') != user_email:
        raise HTTPException(
            status_code=403,
            detail='You can only delete your own history records.'
        )

    doc_ref.delete()
    return {'status': 'success', 'message': f'Record {record_id} deleted successfully.'}


@app.post("/diagnose")
async def diagnose(
    image: UploadFile = File(...),
    symptoms: str = Form(...),
    user: dict = Depends(verify_token)
):
    try:
        ensure_model_loaded()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Model failed to load: {str(exc)}")

    if not model_data:
        raise HTTPException(status_code=503, detail="Model not loaded on server")
    
    try:
        # 1. Process Image
        contents = await image.read()
        try:
            img = Image.open(io.BytesIO(contents)).convert('RGB')
        except UnidentifiedImageError:
            raise HTTPException(
                status_code=400,
                detail="Unsupported image format. Please upload PNG or JPEG chest X-ray images.",
            )
        img_tensor = model_data["transform"](img).unsqueeze(0).to(model_data["device"])
        
        # 2. Process Text
        vocab = model_data["vocab"]
        tokens, token_count, unknown_token_count, unknown_ratio = normalize_symptom_tokens(
            symptoms,
            vocab,
            max_len=50,
        )
        text_tensor = torch.tensor([tokens], dtype=torch.long).to(model_data["device"])
        
        # 3. Inference
        with torch.no_grad():
            outputs = model_data["model"](img_tensor, text_tensor)
            probs = torch.softmax(outputs, dim=1)
            confidence, pred_idx = torch.max(probs, dim=1)

            top_k = min(3, probs.shape[1])
            top_probs, top_indices = torch.topk(probs, k=top_k, dim=1)
            
        label = model_data["label_encoder"].inverse_transform([pred_idx.item()])[0]
        confidence_value = float(confidence.item())

        top_predictions = []
        for idx_tensor, prob_tensor in zip(top_indices[0], top_probs[0]):
            class_idx = int(idx_tensor.item())
            class_label = model_data["label_encoder"].inverse_transform([class_idx])[0]
            top_predictions.append(
                {
                    "label": class_label,
                    "confidence": float(prob_tensor.item()),
                }
            )

        findings = build_diagnostic_findings(
            label=label,
            confidence=confidence_value,
            token_count=token_count,
            unknown_ratio=unknown_ratio,
        )
        plain_text_results = build_plain_language_results(top_predictions, confidence_value)

        if confidence_value >= 0.80:
            details = f"Strong diagnostic signal for {label}."
        elif confidence_value >= 0.60:
            details = f"Moderate diagnostic signal for {label}."
        else:
            details = f"Weak diagnostic signal for {label}; consider additional review and context."
        
        result = {
            "status": "success",
            "prediction": {
                "label": label,
                "confidence": confidence_value,
                "uncertainty_level": confidence_bucket(confidence_value),
                "details": details,
                "findings": findings,
                "plain_text_results": plain_text_results,
                "top_predictions": top_predictions,
                "token_stats": {
                    "total_tokens": token_count,
                    "unknown_tokens": unknown_token_count,
                    "unknown_ratio": unknown_ratio,
                },
            },
            "user": user["email"]
        }

        # Persist diagnosis + chest X-ray metadata for history and RAG context.
        db = firestore_client_or_503()
        _, diagnosis_ref = db.collection('diagnosis_records').add(
            {
                'user_email': user.get('email'),
                'symptoms': symptoms,
                'prediction': result['prediction'],
                'image_name': image.filename,
                'image_content_type': image.content_type,
                'image_size_bytes': len(contents),
                'created_at': datetime.now(timezone.utc),
            }
        )

        result['record_id'] = diagnosis_ref.id

        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


async def sse_stream(generator):
    try:
        if hasattr(generator, '__aiter__'):
            async for chunk in generator:
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        else:
            for chunk in generator:
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    finally:
        yield "data: [DONE]\n\n"

@app.post("/triage")
async def triage(
    message: str = Form(...),
    stage: str = Form('intake'),
    case_id: str = Form(''),
    user: dict = Depends(verify_token)
):
    try:
        user_email = user.get("email")
        if not user_email:
            raise HTTPException(status_code=401, detail="Invalid user profile")

        db = firestore_client_or_503()
        _, profile = get_user_profile(db, user_email)
        final_api_key, key_source, missing_key_message = resolve_triage_api_key(db, profile)

        if not final_api_key:
            raise HTTPException(status_code=403, detail=missing_key_message)
            
        normalized_stage = str(stage).strip().lower()
        if normalized_stage not in {'intake', 'specialist', 'final_nurse', 'fact_checker'}:
            raise HTTPException(status_code=400, detail="stage must be 'intake', 'specialist', 'final_nurse', or 'fact_checker'.")

        rag_context = build_rag_context(db, user_email, message)
        
        # Resolve case or create new
        if case_id:
            case_ref = db.collection('triage_sessions').document(case_id)
            case_doc = case_ref.get()
            if not case_doc.exists:
                raise HTTPException(status_code=404, detail="Case not found.")
        else:
            if normalized_stage != 'intake':
                raise HTTPException(status_code=400, detail="Initial stage must be 'intake'.")
            
            _, case_ref = db.collection('triage_sessions').add({
                'user_email': user_email,
                'status': 'pending',
                'created_at': datetime.now(timezone.utc),
            })
            case_id = case_ref.id

        # Save the user's message to the thread
        if message.strip():
            db.collection('care_case_messages').add({
                'case_id': case_id,
                'patient_email': user_email,
                'sender_email': user_email,
                'sender_role': 'patient',
                'agent_role': normalized_stage,
                'message': message.strip(),
                'created_at': datetime.now(timezone.utc),
            })

        # Load Thread Memory from care_case_messages
        msg_docs = db.collection('care_case_messages').where('case_id', '==', case_id).order_by('created_at').stream()
        thread_memory = {'intake': [], 'specialist': [], 'final_nurse': [], 'fact_checker': [], 'single_agent': []}
        
        for doc in msg_docs:
            d = doc.to_dict()
            msg_stage = d.get('agent_role', 'intake')
            role = "user" if d.get('sender_role') == 'patient' else "assistant"
            if msg_stage in thread_memory:
                thread_memory[msg_stage].append({'role': role, 'content': d.get('message', '')})

        # Run Agent logic
        system = MediSimAgentSystem(api_key=final_api_key)
        stream_gen = system.run_stage(normalized_stage, message, rag_context, thread_memory, stream=True)

        async def combined_stream():
            full_response = ""
            for chunk in stream_gen:
                full_response += chunk
                payload = {'chunk': chunk, 'case_id': case_id, 'stage': normalized_stage}
                yield f"data: {json.dumps(payload)}\n\n"
            
            # Save the agent's response to the thread after completion
            if full_response.strip():
                db.collection('care_case_messages').add({
                    'case_id': case_id,
                    'patient_email': user_email,
                    'sender_email': 'ai_agent',
                    'sender_role': 'assistant',
                    'agent_role': normalized_stage,
                    'message': full_response.strip(),
                    'created_at': datetime.now(timezone.utc),
                })
                
                # Update main case document with snapshot responses for easy display
                update_data = {}
                if normalized_stage == 'intake':
                    update_data['nurse_response'] = full_response
                elif normalized_stage == 'specialist':
                    update_data['specialist_response'] = full_response
                elif normalized_stage == 'final_nurse':
                    update_data['final_nurse_response'] = full_response
                elif normalized_stage == 'fact_checker':
                    update_data['verified_response'] = full_response
                elif normalized_stage == 'single_agent':
                    update_data['nurse_response'] = "Single Agent Response: " + full_response
                    update_data['specialist_response'] = "Standalone Mode (Evaluated)"
                    update_data['final_nurse_response'] = "Standalone Mode (Evaluated)"
                    update_data['verified_response'] = "Standalone Mode (Evaluated)"
                
                if update_data:
                    # Retrieve the existing data to merge 'responses' specifically
                    doc_dict = case_ref.get().to_dict() or {}
                    current_responses = doc_dict.get('responses', {})
                    if normalized_stage == 'intake':
                        current_responses['nurse'] = full_response
                    elif normalized_stage == 'specialist':
                        current_responses['specialist'] = full_response
                    elif normalized_stage == 'final_nurse':
                        current_responses['final_nurse'] = full_response
                    elif normalized_stage == 'fact_checker':
                        current_responses['verified'] = full_response
                        
                    update_data['responses'] = current_responses
                    case_ref.update(update_data)

            yield "event: done\ndata: {}\n\n"

        return StreamingResponse(combined_stream(), media_type="text/event-stream")

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    static_dir = resolve_static_dir()
    if not os.path.isdir(static_dir):
        raise HTTPException(status_code=404, detail="Route not found")

    candidate = os.path.normpath(os.path.join(static_dir, full_path))
    if candidate.startswith(static_dir) and os.path.isfile(candidate):
        if candidate.endswith(".html"):
            return FileResponse(
                candidate,
                headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
            )
        return FileResponse(candidate)

    index_file = os.path.join(static_dir, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file, headers={"Cache-Control": "no-store, no-cache"})

    raise HTTPException(status_code=404, detail="Not found")
