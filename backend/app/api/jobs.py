import json
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from sse_starlette.sse import EventSourceResponse
from typing import List, Dict, Any, Optional

from backend.app.database import get_db_connection
from backend.app.models.schemas import JobCreateRequest
from backend.app.core.job_queue import submit_job, subscribe_to_job, unsubscribe_from_job, executor, execute_job_pipeline

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])

@router.post("", response_model=Dict[str, Any])
def create_job(req: JobCreateRequest):
    try:
        job_id = submit_job(req)
        return {"job_id": job_id, "status": "queued", "message": "Job successfully queued for processing"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=List[Dict[str, Any]])
def list_jobs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/{job_id}", response_model=Dict[str, Any])
def get_job(job_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    job_row = cursor.fetchone()
    if not job_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Job not found")

    job_data = dict(job_row)

    cursor.execute("SELECT * FROM clips WHERE job_id = ? ORDER BY virality_score DESC, clip_index ASC", (job_id,))
    clip_rows = cursor.fetchall()
    conn.close()

    clips = []
    for r in clip_rows:
        c = dict(r)
        if c.get("words_json"):
            c["words"] = json.loads(c["words_json"])
        if c.get("seo_json"):
            c["seo_metadata"] = json.loads(c["seo_json"])
        if c.get("subtitle_settings_json"):
            c["subtitle_settings"] = json.loads(c["subtitle_settings_json"])
        clips.append(c)

    job_data["clips"] = clips
    return job_data

@router.get("/{job_id}/events")
async def job_events(job_id: str):
    """Server-Sent Events (SSE) endpoint streaming real-time pipeline progress."""
    q = subscribe_to_job(job_id)

    async def event_generator():
        try:
            # Yield initial status immediately
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT status, current_step, progress_pct, error_message FROM jobs WHERE id = ?", (job_id,))
            row = cursor.fetchone()
            conn.close()
            if row:
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "progress",
                        "job_id": job_id,
                        "status": row["status"],
                        "current_step": row["current_step"],
                        "progress_pct": row["progress_pct"],
                        "error_message": row["error_message"]
                    })
                }

            while True:
                data = await q.get()
                yield {
                    "event": "message",
                    "data": json.dumps(data)
                }
                if data.get("type") in ["completed", "failed"]:
                    break
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe_from_job(job_id, q)

    return EventSourceResponse(event_generator())

@router.post("/{job_id}/resume")
def resume_job(job_id: str):
    """Resume a failed job from where it left off."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    req = JobCreateRequest(
        youtube_url=row["youtube_url"],
        llm_provider=row["llm_provider"]
    )
    executor.submit(execute_job_pipeline, job_id, req)
    return {"message": "Job resumed successfully", "job_id": job_id}
