import json
import pytest
from typing import Tuple, Optional
from backend.app.models.schemas import (
    VideoMetadata, TranscriptData, SentenceItem, WordItem, CandidateClipsOutput
)
from backend.app.llm.base import LLMProvider
from backend.app.core.cost_tracker import CostTracker
from backend.app.services.clip_finder import find_clips

class MockLLMProvider(LLMProvider):
    def __init__(self):
        super().__init__(model_name="mock-model")
        self.call_count = 0

    def _call_api(self, prompt: str, system_instruction: Optional[str] = None) -> Tuple[str, int, int]:
        self.call_count += 1
        # First call: Discovery output
        # Second call: Critic output
        response_data = {
            "clips": [
                {
                    "clip_index": 1,
                    "start_time": 10.2,
                    "end_time": 42.1,
                    "duration": 31.9,
                    "hook_text": "The secret habit to 10x your output",
                    "hook_strategy": "bold_claim",
                    "virality_score": 95,
                    "reasoning": "Instant intrigue and high practical value.",
                    "topic": "Productivity",
                    "summary": "Explains the deep work protocol that elite performers use daily.",
                    "reorder_cold_open": False,
                    "cold_open_text": None
                },
                {
                    "clip_index": 2,
                    "start_time": 50.0,
                    "end_time": 85.0,
                    "duration": 35.0,
                    "hook_text": "Why 99% of people fail at new habits",
                    "hook_strategy": "contrarian",
                    "virality_score": 88,
                    "reasoning": "Subverts common expectations about willpower.",
                    "topic": "Habit Building",
                    "summary": "Reveals environmental triggers over motivation.",
                    "reorder_cold_open": False,
                    "cold_open_text": None
                }
            ]
        }
        return json.dumps(response_data), 150, 80

def test_find_clips_pipeline():
    words = [
        WordItem(word=f"word{i}", start=i * 2.0, end=(i * 2.0) + 1.5)
        for i in range(50)
    ]
    sentences = [
        SentenceItem(
            text=f"Sentence {i}",
            start=words[i * 5].start,
            end=words[i * 5 + 4].end,
            words=words[i * 5 : (i + 1) * 5]
        )
        for i in range(10)
    ]
    transcript = TranscriptData(
        language="en",
        words=words,
        sentences=sentences,
        full_text="Mock full transcript."
    )
    meta = VideoMetadata(
        video_id="test1234567",
        url="https://youtube.com/watch?v=test1234567",
        title="Mock Productivity Video",
        channel="Top Creator",
        duration=100.0
    )

    llm = MockLLMProvider()
    cost_tracker = CostTracker("gemini")

    clips = find_clips(
        metadata=meta,
        transcript=transcript,
        llm=llm,
        cost_tracker=cost_tracker,
        target_count=5
    )

    assert len(clips) == 2
    assert clips[0].virality_score == 95
    assert clips[0].start_time == 10.0  # Snapped to sentence start (word 5 starts at 10.0)
    assert cost_tracker.input_tokens > 0
    assert cost_tracker.output_tokens > 0
    assert cost_tracker.get_estimated_cost_usd() > 0.0
