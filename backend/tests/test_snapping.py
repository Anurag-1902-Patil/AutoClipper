import pytest
from backend.app.models.schemas import TranscriptData, SentenceItem, WordItem
from backend.app.services.chunker import snap_to_boundary

def test_snap_to_boundary():
    words = [
        WordItem(word="Start", start=10.0, end=10.4),
        WordItem(word="of", start=10.5, end=10.7),
        WordItem(word="sentence.", start=10.8, end=11.5),
        WordItem(word="Next", start=12.2, end=12.6),
        WordItem(word="topic.", start=12.7, end=13.4),
    ]
    sentences = [
        SentenceItem(text="Start of sentence.", start=10.0, end=11.5, words=words[:3]),
        SentenceItem(text="Next topic.", start=12.2, end=13.4, words=words[3:]),
    ]
    transcript = TranscriptData(
        language="en",
        words=words,
        sentences=sentences,
        full_text="Start of sentence. Next topic."
    )

    # Snapping a start time close to sentence start (e.g. 10.3s) should snap to 10.0s
    snapped_start = snap_to_boundary(10.3, transcript, mode="start")
    assert snapped_start == 10.0

    # Snapping an end time close to sentence end (e.g. 11.2s) should snap to 11.5s
    snapped_end = snap_to_boundary(11.2, transcript, mode="end")
    assert snapped_end == 11.5

    # Snapping far from sentence boundary should snap to nearest word
    snapped_word_start = snap_to_boundary(10.6, transcript, mode="start")
    # 10.6 is within 1.5s of sentence start 10.0, so sentence boundary is preferred
    assert snapped_word_start == 10.0
