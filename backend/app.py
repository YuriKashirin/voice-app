from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import tempfile
import os
import json
from pathlib import Path
from transcription import TranscriptionService

load_dotenv()

class CleanRequest(BaseModel):
    text: str
    system_prompt: str | None = None

class Settings(BaseModel):
    apiKey: str
    baseUrl: str
    model: str
    whisperModel: str

service = None

def get_settings_file_path():
    """Get path to Electron settings file in backend directory"""
    return Path(__file__).parent / 'electron-settings.json'

def load_electron_settings():
    """Load settings from Electron settings file, fallback to .env"""
    settings_path = get_settings_file_path()
    try:
        if settings_path.exists():
            with open(settings_path, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"⚠️  Could not load Electron settings: {e}")
    
    # Fallback to environment variables
    return {
        'apiKey': os.getenv('LLM_API_KEY', ''),
        'baseUrl': os.getenv('LLM_BASE_URL', 'https://api.openai.com/v1'),
        'model': os.getenv('LLM_MODEL', 'gpt-4o'),
        'whisperModel': os.getenv('WHISPER_MODEL', 'base')
    }

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uses OpenAI-compatible API (Ollama, OpenAI, LM Studio, etc.). Configure via Electron settings or .env file."""
    global service
    print("🚀 Starting AI Transcript App...")

    # Load settings from Electron or fallback to .env
    settings = load_electron_settings()
    
    service = TranscriptionService(
        whisper_model=settings.get('whisperModel', 'base'),
        llm_base_url=settings.get('baseUrl', 'https://api.openai.com/v1'),
        llm_api_key=settings.get('apiKey', ''),
        llm_model=settings.get('model', 'gpt-4o')
    )
    print(f"🔧 Using settings from: {'.env' if settings == load_electron_settings() else 'Electron'}")
    print("✅ Ready!")
    yield

app = FastAPI(title="AI Transcript App", lifespan=lifespan)

# CORS for localhost development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server (Vite)
        "http://localhost:5173",  # React dev server (Vite alternative port)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/status")
async def get_status():
    return {
        "status": "ready" if service else "initializing",
        "whisper_model": os.getenv("WHISPER_MODEL"),
        "llm_model": os.getenv("LLM_MODEL"),
        "llm_base_url": os.getenv("LLM_BASE_URL")
    }

@app.get("/api/system-prompt")
async def get_system_prompt():
    if not service:
        raise HTTPException(status_code=503, detail="Service not ready")

    return {"default_prompt": service.get_default_system_prompt()}

@app.get("/api/settings")
async def get_settings():
    """Get current settings from Electron or fallback"""
    return load_electron_settings()

@app.post("/api/settings")
async def update_settings(settings: Settings):
    """Update settings (mainly for Electron to call)"""
    global service
    
    try:
        # Restart service with new settings
        service = TranscriptionService(
            whisper_model=settings.whisperModel,
            llm_base_url=settings.baseUrl,
            llm_api_key=settings.apiKey,
            llm_model=settings.model
        )
        
        return {"success": True, "message": "Settings updated and service restarted"}
    except Exception as e:
        print(f"❌ Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")

@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not service:
        raise HTTPException(status_code=503, detail="Service not ready, still initializing models")

    suffix = os.path.splitext(audio.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        raw_text = service.transcribe(tmp_path)
        return {"success": True, "text": raw_text}

    except Exception as e:
        print(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    finally:
        # Always clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.post("/api/clean")
async def clean_text(request: CleanRequest):
    if not service:
        raise HTTPException(status_code=503, detail="Service not ready")

    try:
        cleaned_text = service.clean_with_llm(request.text)
        return {"success": True, "text": cleaned_text}

    except Exception as e:
        print(f"❌ LLM cleaning error: {e}")
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {str(e)}")
