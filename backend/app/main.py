import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.config import settings, STORAGE_PATH, BASE_DIR
from backend.app.database import init_db
from backend.app.api import jobs, clips, presets, export

init_db()

app = FastAPI(
    title="AI Video Clipper",
    description="Turn long YouTube videos into viral vertical short-form clips",
    version="1.0.0"
)

# CORS setup
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for media preview (cached video, audio, rendered clips)
app.mount("/storage", StaticFiles(directory=str(STORAGE_PATH)), name="storage")

# Include API routes
app.include_router(jobs.router)
app.include_router(clips.router)
app.include_router(presets.router)
app.include_router(export.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AI Video Clipper",
        "llm_provider": settings.LLM_PROVIDER
    }

# Serve frontend build if present
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
