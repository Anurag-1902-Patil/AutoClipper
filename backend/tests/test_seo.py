import json
import pytest
from typing import Tuple, Optional
from backend.app.models.schemas import CandidateClip, WordItem, SEOMetadata
from backend.app.llm.base import LLMProvider
from backend.app.core.cost_tracker import CostTracker
from backend.app.services.seo_service import generate_clip_seo

class MockSEOProvider(LLMProvider):
    def __init__(self):
        super().__init__(model_name="mock-seo")

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        response = {
            "yt_title": "The Brutal Truth About Why 90% of Startups Fail",
            "yt_description": "Most founders make this fatal mistake. Subscribe for more daily startup tips!",
            "yt_hashtags": ["#Startups", "#BusinessTips", "#Entrepreneurship"],
            "yt_tags": ["startups", "entrepreneurship", "business mistakes", "growth"],
            "ig_caption": "Why 90% of startups fail before year one. 👇\n\nSave this reel for later!",
            "ig_hashtags": ["#startuptips", "#entrepreneurlife", "#growthmindset"],
            "thumbnail_timestamp": 2.5,
            "best_time_to_post": "6:00 PM - 8:30 PM"
        }
        return json.dumps(response), 120, 60

def test_generate_clip_seo():
    clip = CandidateClip(
        clip_index=1,
        start_time=0.0,
        end_time=30.0,
        duration=30.0,
        hook_text="Why 90% of startups fail",
        hook_strategy="contrarian",
        virality_score=92,
        reasoning="High curiosity",
        topic="Startups",
        summary="Explains distribution failure."
    )
    words = [WordItem(word="Test", start=0.0, end=1.0)]
    llm = MockSEOProvider()
    cost_tracker = CostTracker("gemini")

    seo = generate_clip_seo(clip, words, llm, cost_tracker)

    assert "#Shorts" in seo.yt_title or "#Shorts" in seo.yt_hashtags
    assert len(seo.yt_hashtags) >= 3
    assert len(seo.ig_hashtags) >= 3
    assert seo.thumbnail_timestamp == 2.5
    assert cost_tracker.input_tokens > 0
