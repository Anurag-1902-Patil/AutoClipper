import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    LLM_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-haiku-20241022"
    
    STORAGE_DIR: str = "storage"
    OUTPUT_DIR: str = "storage/output"
    
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_PATH = BASE_DIR / settings.STORAGE_DIR
CACHE_PATH = STORAGE_PATH / "cache"
TRANSCRIPTS_PATH = STORAGE_PATH / "transcripts"
TEMP_PATH = STORAGE_PATH / "temp"
OUTPUT_PATH = BASE_DIR / settings.OUTPUT_DIR
PROMPTS_PATH = BASE_DIR / "backend" / "prompts"

# Ensure directories exist
for p in [STORAGE_PATH, CACHE_PATH, TRANSCRIPTS_PATH, TEMP_PATH, OUTPUT_PATH, PROMPTS_PATH]:
    p.mkdir(parents=True, exist_ok=True)
