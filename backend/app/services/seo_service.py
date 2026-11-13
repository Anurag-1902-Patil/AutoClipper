from pathlib import Path
from typing import List, Dict, Any, Tuple
from backend.app.config import PROMPTS_PATH
from backend.app.models.schemas import CandidateClip, WordItem, SEOMetadata
from backend.app.llm.base import LLMProvider
from backend.app.core.cost_tracker import CostTracker

def extract_clip_transcript(words: List[WordItem], start_time: float, end_time: float) -> str:
    """Extract and format words that belong to the clip interval."""
    clip_words = [w.word for w in words if w.end >= start_time and w.start <= end_time]
    return " ".join(clip_words)

def generate_clip_seo(
    clip: CandidateClip,
    words: List[WordItem],
    llm: LLMProvider,
    cost_tracker: CostTracker
) -> SEOMetadata:
    """
    Generate platform-specific SEO metadata for YouTube Shorts and Instagram Reels.
    """
    prompt_file = PROMPTS_PATH / "seo_metadata.md"
    with open(prompt_file, "r", encoding="utf-8") as f:
        template = f.read()

    transcript_text = extract_clip_transcript(words, clip.start_time, clip.end_time)

    prompt = template.format(
        topic=clip.topic,
        hook_text=clip.hook_text,
        hook_strategy=clip.hook_strategy,
        summary=clip.summary,
        clip_transcript=transcript_text
    )

    metadata, usage = llm.generate_structured(prompt, SEOMetadata)
    cost_tracker.add_usage(usage["prompt_tokens"], usage["completion_tokens"])

    # Ensure #Shorts is present in YouTube title or hashtags
    if "#Shorts" not in metadata.yt_title and "#shorts" not in metadata.yt_title:
        if len(metadata.yt_title) <= 90:
            metadata.yt_title += " #Shorts"
    if "#Shorts" not in metadata.yt_hashtags:
        metadata.yt_hashtags.insert(0, "#Shorts")

    return metadata
