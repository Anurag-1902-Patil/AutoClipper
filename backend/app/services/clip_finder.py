import json
from pathlib import Path
from typing import List, Dict, Any, Tuple
from backend.app.config import PROMPTS_PATH
from backend.app.models.schemas import (
    VideoMetadata, TranscriptData, CandidateClip, CandidateClipsOutput
)
from backend.app.services.chunker import chunk_transcript, snap_to_boundary
from backend.app.llm.base import LLMProvider
from backend.app.core.cost_tracker import CostTracker

def format_timestamp(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"

def format_transcript_with_timestamps(transcript: TranscriptData) -> str:
    """Format sentences with [MM:SS] timestamp headers and [QUESTION] markers for high LLM temporal accuracy."""
    lines = []
    for s in transcript.sentences:
        ts = format_timestamp(s.start)
        clean_text = s.text.strip()
        tag = " [QUESTION]" if clean_text.endswith("?") else ""
        lines.append(f"[{ts}] ({s.start:.1f}s - {s.end:.1f}s){tag}: {clean_text}")
    return "\n".join(lines)

def find_clips(
    metadata: VideoMetadata,
    transcript: TranscriptData,
    llm: LLMProvider,
    cost_tracker: CostTracker,
    target_count: int = 8,
    min_duration: float = 20.0,
    max_duration: float = 60.0
) -> List[CandidateClip]:
    """
    Two-pass viral clip discovery pipeline:
    Pass 1: Extract candidate clips across transcript chunks.
    Pass 2: Critic pass for deduplication, re-scoring, and hook refinement.
    """
    discovery_prompt_path = PROMPTS_PATH / "clip_discovery.md"
    critic_prompt_path = PROMPTS_PATH / "critic_pass.md"

    with open(discovery_prompt_path, "r", encoding="utf-8") as f:
        discovery_template = f.read()

    with open(critic_prompt_path, "r", encoding="utf-8") as f:
        critic_template = f.read()

    chunks = chunk_transcript(transcript, max_chunk_duration=900.0, overlap_duration=90.0)
    all_raw_candidates: List[CandidateClip] = []

    # --- PASS 1: Candidate Extraction ---
    for chunk in chunks:
        chunk_transcript_data = TranscriptData(
            language=transcript.language,
            sentences=chunk.sentences,
            words=[w for s in chunk.sentences for w in s.words]
        )
        chunk_text = format_transcript_with_timestamps(chunk_transcript_data)
        
        prompt = discovery_template.format(
            title=metadata.title,
            channel=metadata.channel,
            duration_str=f"{int(metadata.duration // 60)}m {int(metadata.duration % 60)}s",
            target_count=target_count,
            min_duration=int(min_duration),
            max_duration=int(max_duration),
            transcript_text=chunk_text
        )

        output, usage = llm.generate_structured(prompt, CandidateClipsOutput)
        cost_tracker.add_usage(usage["prompt_tokens"], usage["completion_tokens"])

        for c in output.clips:
            # Snap timestamps to actual word/sentence boundaries
            c.start_time = snap_to_boundary(c.start_time, transcript, mode="start")
            c.end_time = snap_to_boundary(c.end_time, transcript, mode="end")
            c.duration = round(c.end_time - c.start_time, 2)
            if c.duration >= 10.0:  # sanity check
                all_raw_candidates.append(c)

    if not all_raw_candidates:
        return []

    # If only 1-2 candidates returned (e.g. for very short videos), skip critic pass
    if len(all_raw_candidates) <= 2:
        for idx, c in enumerate(all_raw_candidates, 1):
            c.clip_index = idx
        return all_raw_candidates

    # --- PASS 2: Critic & Deduplication Pass ---
    candidates_dict = [c.model_dump() for c in all_raw_candidates]
    critic_prompt = critic_template.format(
        min_clips=min(len(all_raw_candidates), max(3, target_count // 2)),
        max_clips=target_count,
        candidate_clips_json=json.dumps(candidates_dict, indent=2)
    )

    critic_output, critic_usage = llm.generate_structured(critic_prompt, CandidateClipsOutput)
    cost_tracker.add_usage(critic_usage["prompt_tokens"], critic_usage["completion_tokens"])

    refined_clips: List[CandidateClip] = []
    for idx, c in enumerate(critic_output.clips, 1):
        c.clip_index = idx
        c.start_time = snap_to_boundary(c.start_time, transcript, mode="start")
        c.end_time = snap_to_boundary(c.end_time, transcript, mode="end")
        c.duration = round(c.end_time - c.start_time, 2)
        refined_clips.append(c)

    # Sort descending by virality score
    refined_clips.sort(key=lambda x: x.virality_score, reverse=True)
    return refined_clips
