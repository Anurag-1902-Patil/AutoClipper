import json
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from backend.app.database import get_db_connection
from backend.app.models.schemas import SubtitlePreset
from backend.app.services.subtitle_generator import BUILTIN_PRESETS

router = APIRouter(prefix="/api/presets", tags=["Presets"])

@router.get("", response_model=List[SubtitlePreset])
def list_presets():
    presets = list(BUILTIN_PRESETS.values())

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM presets")
    rows = cursor.fetchall()
    conn.close()

    for r in rows:
        data = json.loads(r["data_json"])
        presets.append(SubtitlePreset(**data))

    return presets

@router.post("", response_model=SubtitlePreset)
def create_custom_preset(preset: SubtitlePreset):
    preset.is_builtin = False
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO presets (id, name, is_builtin, data_json)
        VALUES (?, ?, 0, ?)
    """, (preset.id, preset.name, json.dumps(preset.model_dump())))
    conn.commit()
    conn.close()
    return preset

@router.post("/apply-all/{job_id}")
def apply_preset_to_all_clips(job_id: str, preset_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE clips SET subtitle_preset_id = ? WHERE job_id = ?", (preset_id, job_id))
    conn.commit()
    conn.close()
    return {"message": f"Applied preset '{preset_id}' to all clips in job {job_id}"}
