import sqlite3
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from backend.app.config import BASE_DIR

DB_PATH = BASE_DIR / "clipper.db"

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        youtube_url TEXT NOT NULL,
        video_id TEXT NOT NULL,
        title TEXT,
        channel TEXT,
        duration REAL,
        thumbnail_url TEXT,
        status TEXT NOT NULL,
        current_step TEXT,
        progress_pct INTEGER DEFAULT 0,
        error_message TEXT,
        llm_provider TEXT,
        token_usage_input INTEGER DEFAULT 0,
        token_usage_output INTEGER DEFAULT 0,
        estimated_cost_usd REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        clip_index INTEGER NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        duration REAL NOT NULL,
        hook_text TEXT NOT NULL,
        hook_strategy TEXT NOT NULL,
        virality_score INTEGER NOT NULL,
        reasoning TEXT,
        topic TEXT,
        summary TEXT,
        is_selected INTEGER DEFAULT 1,
        
        trim_start_offset REAL DEFAULT 0.0,
        trim_end_offset REAL DEFAULT 0.0,
        words_json TEXT,
        subtitle_preset_id TEXT DEFAULT 'hormozi',
        subtitle_settings_json TEXT,
        enable_hook_overlay INTEGER DEFAULT 1,
        enable_silence_removal INTEGER DEFAULT 0,
        enable_loudnorm INTEGER DEFAULT 1,
        framing_mode TEXT DEFAULT 'auto_face',
        
        rendered_video_path TEXT,
        render_status TEXT DEFAULT 'pending',
        
        seo_json TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        data_json TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()

# Initialize tables on import
init_db()
