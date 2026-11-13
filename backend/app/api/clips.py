import re
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List

from backend.app.database import get_db_connection
from backend.app.models.schemas import (
    ClipUpdateRequest, CandidateClip, WordItem, SubtitlePreset, SEOMetadata,
    PolishSubtitlesRequest, PolishedSubtitlesOutput
)
from backend.app.services.video_processor import render_clip_mp4
from backend.app.services.subtitle_generator import BUILTIN_PRESETS
from backend.app.services.seo_service import generate_clip_seo
from backend.app.llm.factory import get_llm_provider
from backend.app.core.cost_tracker import CostTracker
from backend.app.config import CACHE_PATH, TEMP_PATH, PROMPTS_PATH

router = APIRouter(prefix="/api/clips", tags=["Clips"])

@router.get("/{clip_id}", response_model=Dict[str, Any])
def get_clip(clip_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = dict(row)
    if clip.get("words_json"):
        clip["words"] = json.loads(clip["words_json"])
    if clip.get("seo_json"):
        clip["seo_metadata"] = json.loads(clip["seo_json"])
    if clip.get("subtitle_settings_json"):
        clip["subtitle_settings"] = json.loads(clip["subtitle_settings_json"])
    return clip

@router.patch("/{clip_id}", response_model=Dict[str, Any])
def update_clip(clip_id: str, req: ClipUpdateRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Clip not found")

    updates = []
    params = []

    if req.trim_start_offset is not None:
        updates.append("trim_start_offset = ?")
        params.append(req.trim_start_offset)
    if req.trim_end_offset is not None:
        updates.append("trim_end_offset = ?")
        params.append(req.trim_end_offset)
    if req.hook_text is not None:
        updates.append("hook_text = ?")
        params.append(req.hook_text)
    if req.words is not None:
        updates.append("words_json = ?")
        params.append(json.dumps([w.model_dump() for w in req.words]))
    if req.subtitle_preset_id is not None:
        updates.append("subtitle_preset_id = ?")
        params.append(req.subtitle_preset_id)
    if req.subtitle_settings is not None:
        updates.append("subtitle_settings_json = ?")
        params.append(json.dumps(req.subtitle_settings))
    if req.enable_hook_overlay is not None:
        updates.append("enable_hook_overlay = ?")
        params.append(int(req.enable_hook_overlay))
    if req.enable_silence_removal is not None:
        updates.append("enable_silence_removal = ?")
        params.append(int(req.enable_silence_removal))
    if req.enable_loudnorm is not None:
        updates.append("enable_loudnorm = ?")
        params.append(int(req.enable_loudnorm))
    if req.framing_mode is not None:
        updates.append("framing_mode = ?")
        params.append(req.framing_mode)
    if req.is_selected is not None:
        updates.append("is_selected = ?")
        params.append(int(req.is_selected))
    if req.seo_metadata is not None:
        updates.append("seo_json = ?")
        params.append(json.dumps(req.seo_metadata.model_dump()))

    if updates:
        params.append(clip_id)
        query = f"UPDATE clips SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, tuple(params))
        conn.commit()

    conn.close()
    return {"message": "Clip successfully updated", "clip_id": clip_id}

@router.post("/{clip_id}/render-preview")
def render_clip_preview(clip_id: str):
    """Renders the clip to MP4 so it can be previewed or downloaded."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT c.*, j.video_id FROM clips c JOIN jobs j ON c.job_id = j.id WHERE c.id = ?", (clip_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Clip not found")

    video_id = row["video_id"]
    source_video = CACHE_PATH / f"{video_id}.mp4"
    if not source_video.exists():
        raise HTTPException(status_code=400, detail="Source video not found in cache")

    # Calculate actual adjusted times with trim offsets
    actual_start = max(0.0, row["start_time"] + row["trim_start_offset"])
    actual_end = max(actual_start + 1.0, row["end_time"] + row["trim_end_offset"])

    words = [WordItem(**w) for w in json.loads(row["words_json"] or "[]")]
    preset_id = row["subtitle_preset_id"] or "hormozi"
    preset = BUILTIN_PRESETS.get(preset_id, BUILTIN_PRESETS["hormozi"])

    # Override preset with custom settings if present
    if row["subtitle_settings_json"]:
        custom = json.loads(row["subtitle_settings_json"])
        preset = preset.model_copy(update=custom)

    clip_model = CandidateClip(
        clip_index=row["clip_index"],
        start_time=actual_start,
        end_time=actual_end,
        duration=round(actual_end - actual_start, 2),
        hook_text=row["hook_text"] or "",
        hook_strategy=row["hook_strategy"] or "curiosity_gap",
        virality_score=row["virality_score"],
        reasoning=row["reasoning"] or "",
        topic=row["topic"] or "",
        summary=row["summary"] or ""
    )

    out_mp4 = TEMP_PATH / f"preview_{clip_id}.mp4"
    rendered = render_clip_mp4(
        source_video_path=source_video,
        clip=clip_model,
        words=words,
        output_path=out_mp4,
        preset=preset,
        framing_mode=row["framing_mode"] or "auto_face",
        enable_hook_overlay=bool(row["enable_hook_overlay"]),
        enable_loudnorm=bool(row["enable_loudnorm"]),
        enable_silence_removal=bool(row["enable_silence_removal"])
    )

    # Update DB
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE clips SET rendered_video_path = ?, render_status = 'completed' WHERE id = ?", (str(rendered), clip_id))
    conn.commit()
    conn.close()

    return {"message": "Render completed", "rendered_video_path": f"/storage/temp/preview_{clip_id}.mp4"}

@router.post("/{clip_id}/regenerate-seo")
def regenerate_seo(clip_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT c.*, j.llm_provider FROM clips c JOIN jobs j ON c.job_id = j.id WHERE c.id = ?", (clip_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = CandidateClip(
        clip_index=row["clip_index"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        duration=row["duration"],
        hook_text=row["hook_text"],
        hook_strategy=row["hook_strategy"],
        virality_score=row["virality_score"],
        reasoning=row["reasoning"] or "",
        topic=row["topic"] or "",
        summary=row["summary"] or ""
    )
    words = [WordItem(**w) for w in json.loads(row["words_json"] or "[]")]
    llm = get_llm_provider(row["llm_provider"])
    cost_tracker = CostTracker(row["llm_provider"] or "gemini")

    seo = generate_clip_seo(clip, words, llm, cost_tracker)
    seo_json = json.dumps(seo.model_dump())

    cursor.execute("UPDATE clips SET seo_json = ? WHERE id = ?", (seo_json, clip_id))
    conn.commit()
    conn.close()

    return {"message": "SEO metadata regenerated", "seo_metadata": seo.model_dump()}

@router.post("/{clip_id}/polish-subtitles")
def polish_subtitles(clip_id: str, req: Optional[PolishSubtitlesRequest] = None):
    """
    Uses the configured LLM (e.g. Gemini 3.6 Flash) to fix speech-to-text accuracy:
    - Fixes punctuation, capitalization, and grammar
    - Corrects phonetic typos and mishearings
    - Removes filler disfluencies ("um", "uh", "er")
    - Adds keyword emphasis tags
    - Preserves timing synchronization
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT c.*, j.llm_provider FROM clips c JOIN jobs j ON c.job_id = j.id WHERE c.id = ?", (clip_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Clip not found")

    # Determine input words
    if req and req.words and len(req.words) > 0:
        raw_words = req.words
    else:
        raw_words = [WordItem(**w) for w in json.loads(row["words_json"] or "[]")]

    if not raw_words:
        conn.close()
        return {"message": "No words to polish", "words": []}

    # Filter to words in clip boundaries if applicable
    actual_start = max(0.0, row["start_time"] + (row["trim_start_offset"] or 0.0))
    actual_end = max(actual_start + 1.0, row["end_time"] + (row["trim_end_offset"] or 0.0))
    clip_words = [w for w in raw_words if w.end >= actual_start and w.start <= actual_end]
    if not clip_words:
        clip_words = raw_words

    compact_words = [{"w": w.word, "s": round(w.start, 2), "e": round(w.end, 2)} for w in clip_words]

    try:
        prompt_file = PROMPTS_PATH / "polish_subtitles.md"
        prompt_template = prompt_file.read_text(encoding="utf-8")
        prompt = prompt_template.replace("{words_json}", json.dumps(compact_words, indent=2))

        llm = get_llm_provider(row["llm_provider"])
        output, usage = llm.generate_structured(prompt, PolishedSubtitlesOutput)
        polished_words: List[WordItem] = []

        last_end = 0.0
        for w in output.words:
            # Ensure valid timestamps
            start_t = max(last_end, float(w.start))
            end_t = max(start_t + 0.08, float(w.end))
            last_end = start_t
            polished_words.append(WordItem(
                word=w.word.strip(),
                start=round(start_t, 2),
                end=round(end_t, 2),
                confidence=1.0,
                is_emphasized=bool(w.is_emphasized)
            ))

        if not polished_words:
            raise ValueError("Polishing returned empty word list")

    except Exception as e:
        # Fallback heuristic clean if LLM is unavailable
        filler_set = {"um", "uh", "er", "ah", "like,"}
        polished_words = []
        for i, w in enumerate(clip_words):
            cleaned_text = w.word.strip()
            if cleaned_text.lower() in filler_set and len(clip_words) > 5:
                continue
            # Capitalize first word or after terminal punctuation
            if i == 0 or (polished_words and re.search(r'[.?!]$', polished_words[-1].word)):
                cleaned_text = cleaned_text.capitalize()
            polished_words.append(WordItem(
                word=cleaned_text,
                start=w.start,
                end=w.end,
                confidence=w.confidence,
                is_emphasized=w.is_emphasized
            ))

    # Persist polished words to DB
    words_json = json.dumps([w.model_dump() for w in polished_words])
    cursor.execute("UPDATE clips SET words_json = ? WHERE id = ?", (words_json, clip_id))
    conn.commit()
    conn.close()

    return {
        "message": "Subtitles polished and synchronized successfully",
        "words": [w.model_dump() for w in polished_words]
    }

