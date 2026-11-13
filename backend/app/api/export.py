import os
import re
import csv
import json
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List

from backend.app.database import get_db_connection
from backend.app.config import OUTPUT_PATH, CACHE_PATH
from backend.app.models.schemas import CandidateClip, WordItem, SubtitlePreset, SEOMetadata
from backend.app.services.video_processor import render_clip_mp4
from backend.app.services.subtitle_generator import BUILTIN_PRESETS

router = APIRouter(prefix="/api/export", tags=["Export"])

def slugify(text: str) -> str:
    s = re.sub(r'[^\w\s-]', '', text.lower()).strip()
    return re.sub(r'[-\s]+', '_', s)[:30]

@router.post("/{job_id}")
def batch_export_job(job_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    job = cursor.fetchone()
    if not job:
        conn.close()
        raise HTTPException(status_code=404, detail="Job not found")

    title_slug = slugify(job["title"] or f"video_{job['video_id']}")
    export_dir = OUTPUT_PATH / title_slug
    export_dir.mkdir(parents=True, exist_ok=True)

    cursor.execute("SELECT * FROM clips WHERE job_id = ? AND is_selected = 1 ORDER BY clip_index ASC", (job_id,))
    selected_clips = cursor.fetchall()
    conn.close()

    if not selected_clips:
        raise HTTPException(status_code=400, detail="No clips selected for export")

    video_id = job["video_id"]
    source_video = CACHE_PATH / f"{video_id}.mp4"
    if not source_video.exists():
        raise HTTPException(status_code=400, detail="Source video not found in cache")

    exported_items = []
    csv_rows = []

    for r in selected_clips:
        idx = r["clip_index"]
        hook_slug = slugify(r["hook_text"] or f"clip_{idx}")
        filename = f"clip_{idx:02d}_{hook_slug}.mp4"
        dest_mp4 = export_dir / filename

        actual_start = max(0.0, r["start_time"] + r["trim_start_offset"])
        actual_end = max(actual_start + 1.0, r["end_time"] + r["trim_end_offset"])

        words = [WordItem(**w) for w in json.loads(r["words_json"] or "[]")]
        preset_id = r["subtitle_preset_id"] or "hormozi"
        preset = BUILTIN_PRESETS.get(preset_id, BUILTIN_PRESETS["hormozi"])

        if r["subtitle_settings_json"]:
            custom = json.loads(r["subtitle_settings_json"])
            preset = preset.model_copy(update=custom)

        clip_model = CandidateClip(
            clip_index=idx,
            start_time=actual_start,
            end_time=actual_end,
            duration=round(actual_end - actual_start, 2),
            hook_text=r["hook_text"] or "",
            hook_strategy=r["hook_strategy"] or "curiosity_gap",
            virality_score=r["virality_score"],
            reasoning=r["reasoning"] or "",
            topic=r["topic"] or "",
            summary=r["summary"] or ""
        )

        render_clip_mp4(
            source_video_path=source_video,
            clip=clip_model,
            words=words,
            output_path=dest_mp4,
            preset=preset,
            framing_mode=r["framing_mode"] or "auto_face",
            enable_hook_overlay=bool(r["enable_hook_overlay"]),
            enable_loudnorm=bool(r["enable_loudnorm"]),
            enable_silence_removal=bool(r["enable_silence_removal"])
        )

        seo = json.loads(r["seo_json"] or "{}")

        exported_items.append({
            "clip_index": idx,
            "filename": filename,
            "relative_path": f"/storage/output/{title_slug}/{filename}",
            "duration": clip_model.duration,
            "virality_score": clip_model.virality_score,
            "hook_text": clip_model.hook_text,
            "seo": seo
        })

        csv_rows.append({
            "Clip #": idx,
            "File Name": filename,
            "Duration (s)": clip_model.duration,
            "Virality Score": clip_model.virality_score,
            "YouTube Title": seo.get("yt_title", ""),
            "YouTube Description": seo.get("yt_description", ""),
            "YouTube Hashtags": " ".join(seo.get("yt_hashtags", [])),
            "Instagram Caption": seo.get("ig_caption", ""),
            "Instagram Hashtags": " ".join(seo.get("ig_hashtags", [])),
            "Thumbnail Timestamp": seo.get("thumbnail_timestamp", 1.5),
            "Best Time To Post": seo.get("best_time_to_post", "")
        })

    # Save metadata.json
    with open(export_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(exported_items, f, indent=2, ensure_ascii=False)

    # Save metadata.csv
    if csv_rows:
        with open(export_dir / "metadata.csv", "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
            writer.writeheader()
            writer.writerows(csv_rows)

    return {
        "message": f"Successfully exported {len(exported_items)} clips",
        "export_folder": str(export_dir),
        "folder_name": title_slug,
        "clips": exported_items
    }

@router.get("/{job_id}/open-folder")
def open_export_folder(job_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, video_id FROM jobs WHERE id = ?", (job_id,))
    job = cursor.fetchone()
    conn.close()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    title_slug = slugify(job["title"] or f"video_{job['video_id']}")
    folder = OUTPUT_PATH / title_slug
    if not folder.exists():
        folder.mkdir(parents=True, exist_ok=True)

    try:
        # Windows Explorer open
        os.startfile(str(folder))
        return {"message": "Folder opened in File Explorer", "folder": str(folder)}
    except Exception as e:
        return {"message": "Folder path", "folder": str(folder)}
