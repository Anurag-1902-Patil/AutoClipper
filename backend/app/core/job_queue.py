import asyncio
import json
import logging
import uuid
import threading
from typing import Dict, Any, List, Optional, Set
from concurrent.futures import ThreadPoolExecutor

from backend.app.database import get_db_connection
from backend.app.models.schemas import JobCreateRequest, VideoMetadata, CandidateClip, SEOMetadata
from backend.app.services.ingest_service import fetch_metadata, download_video, extract_video_id
from backend.app.services.transcript_service import get_transcript
from backend.app.services.clip_finder import find_clips
from backend.app.services.seo_service import generate_clip_seo
from backend.app.llm.factory import get_llm_provider
from backend.app.core.cost_tracker import CostTracker

logger = logging.getLogger("clipper.queue")

executor = ThreadPoolExecutor(max_workers=3)

# SSE event listeners: job_id -> list of asyncio.Queue
_event_subscribers: Dict[str, Set[asyncio.Queue]] = {}
_subscriber_lock = threading.Lock()

def subscribe_to_job(job_id: str) -> asyncio.Queue:
    q = asyncio.Queue()
    with _subscriber_lock:
        if job_id not in _event_subscribers:
            _event_subscribers[job_id] = set()
        _event_subscribers[job_id].add(q)
    return q

def unsubscribe_from_job(job_id: str, q: asyncio.Queue):
    with _subscriber_lock:
        if job_id in _event_subscribers:
            _event_subscribers[job_id].discard(q)
            if not _event_subscribers[job_id]:
                del _event_subscribers[job_id]

def broadcast_event(job_id: str, event_data: Dict[str, Any]):
    """Thread-safe dispatch of SSE events to all connected clients."""
    with _subscriber_lock:
        queues = list(_event_subscribers.get(job_id, []))
    for q in queues:
        try:
            q.put_nowait(event_data)
        except Exception:
            pass

def update_job_status(
    job_id: str,
    status: str,
    current_step: str,
    progress_pct: int,
    error_message: Optional[str] = None
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE jobs
        SET status = ?, current_step = ?, progress_pct = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (status, current_step, progress_pct, error_message, job_id))
    conn.commit()
    conn.close()

    broadcast_event(job_id, {
        "type": "progress",
        "job_id": job_id,
        "status": status,
        "current_step": current_step,
        "progress_pct": progress_pct,
        "error_message": error_message
    })

def execute_job_pipeline(job_id: str, req: JobCreateRequest):
    """Background worker executing Ingest -> Transcript -> LLM Discovery -> SEO."""
    cost_tracker = CostTracker(req.llm_provider or "gemini")
    
    try:
        # Step 1: Ingest
        update_job_status(job_id, "ingesting", "Fetching video metadata and downloading...", 15)
        video_id = extract_video_id(req.youtube_url)

        # Reuse existing metadata from DB if already ingested
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT title, channel, duration, thumbnail_url FROM jobs WHERE id = ?", (job_id,))
        existing_job = cursor.fetchone()
        conn.close()

        if existing_job and existing_job["title"]:
            meta = VideoMetadata(
                video_id=video_id,
                url=req.youtube_url,
                title=existing_job["title"],
                channel=existing_job["channel"] or "Unknown",
                duration=float(existing_job["duration"] or 0.0),
                thumbnail_url=existing_job["thumbnail_url"] or ""
            )
        else:
            meta = fetch_metadata(req.youtube_url)
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE jobs
                SET video_id = ?, title = ?, channel = ?, duration = ?, thumbnail_url = ?
                WHERE id = ?
            """, (video_id, meta.title, meta.channel, meta.duration, meta.thumbnail_url, job_id))
            conn.commit()
            conn.close()

        video_path = download_video(req.youtube_url)
        update_job_status(job_id, "transcribing", "Extracting word-level transcript...", 35)

        # Step 2: Transcript
        transcript = get_transcript(video_id)
        update_job_status(job_id, "analyzing", "Running 2-pass viral clip discovery with AI...", 60)

        # Step 3: LLM Discovery
        llm = get_llm_provider(provider_name=req.llm_provider)
        clips = find_clips(
            metadata=meta,
            transcript=transcript,
            llm=llm,
            cost_tracker=cost_tracker,
            target_count=req.num_clips_target,
            min_duration=req.min_clip_duration,
            max_duration=req.max_clip_duration
        )

        update_job_status(job_id, "seo", "Generating platform SEO metadata for discovered clips...", 85)

        # Step 4: SEO metadata and save clips to DB
        conn = get_db_connection()
        cursor = conn.cursor()

        for c in clips:
            clip_db_id = str(uuid.uuid4())
            # Generate SEO
            try:
                seo = generate_clip_seo(c, transcript.words, llm, cost_tracker)
                seo_json = json.dumps(seo.model_dump())
            except Exception as e:
                logger.warning(f"SEO generation failed for clip {c.clip_index}: {e}")
                seo_json = json.dumps({
                    "yt_title": f"{c.hook_text} #Shorts",
                    "yt_description": f"{c.summary}\nSubscribe for more!",
                    "yt_hashtags": ["#Shorts", "#Viral", "#Trending"],
                    "yt_tags": [c.topic, "shorts", "reels"],
                    "ig_caption": f"{c.hook_text}\n\n{c.summary}\n\nSave this for later 📌",
                    "ig_hashtags": ["#shorts", "#reels", "#viral"],
                    "thumbnail_timestamp": 1.5,
                    "best_time_to_post": "6:00 PM - 9:00 PM"
                })

            # Extract word items for clip
            clip_words = [w.model_dump() for w in transcript.words if w.end >= c.start_time and w.start <= c.end_time]

            cursor.execute("""
                INSERT INTO clips (
                    id, job_id, clip_index, start_time, end_time, duration,
                    hook_text, hook_strategy, virality_score, reasoning, topic, summary,
                    is_selected, words_json, subtitle_preset_id, enable_hook_overlay,
                    enable_silence_removal, enable_loudnorm, framing_mode, seo_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                clip_db_id, job_id, c.clip_index, c.start_time, c.end_time, c.duration,
                c.hook_text, c.hook_strategy, c.virality_score, c.reasoning, c.topic, c.summary,
                1, json.dumps(clip_words), req.default_preset_id, int(req.enable_hook_overlay),
                int(req.enable_silence_removal), int(req.enable_loudnorm),
                "auto_face" if req.enable_face_tracking else "center",
                seo_json
            ))

        usage = cost_tracker.get_summary()
        cursor.execute("""
            UPDATE jobs
            SET status = 'ready', current_step = 'Completed', progress_pct = 100,
                token_usage_input = ?, token_usage_output = ?, estimated_cost_usd = ?
            WHERE id = ?
        """, (usage["input_tokens"], usage["output_tokens"], usage["estimated_cost_usd"], job_id))

        conn.commit()
        conn.close()

        broadcast_event(job_id, {
            "type": "completed",
            "job_id": job_id,
            "status": "ready",
            "progress_pct": 100,
            "clips_count": len(clips)
        })

    except Exception as e:
        logger.exception(f"Job {job_id} failed: {e}")
        update_job_status(job_id, "failed", f"Failed at current step", 0, str(e))

def submit_job(req: JobCreateRequest) -> str:
    """Creates a job in DB and enqueues it to background executor."""
    job_id = str(uuid.uuid4())
    video_id = extract_video_id(req.youtube_url)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO jobs (id, youtube_url, video_id, status, current_step, progress_pct, llm_provider)
        VALUES (?, ?, ?, 'queued', 'Enqueued for processing', 5, ?)
    """, (job_id, req.youtube_url, video_id, req.llm_provider or "gemini"))
    conn.commit()
    conn.close()

    executor.submit(execute_job_pipeline, job_id, req)
    return job_id
