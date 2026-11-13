import pytest
from backend.app.models.schemas import TranscriptData, SentenceItem, WordItem
from backend.app.services.chunker import chunk_transcript

def create_mock_transcript(total_minutes: float = 30.0) -> TranscriptData:
    sentences = []
    current_time = 0.0
    idx = 0
    while current_time < total_minutes * 60:
        words = [
            WordItem(word=f"word{i}", start=round(current_time + i * 0.5, 2), end=round(current_time + (i + 1) * 0.5, 2))
            for i in range(10)
        ]
        s_end = words[-1].end
        sentences.append(SentenceItem(
            text=f"Sentence {idx} talking about viral hooks.",
            start=words[0].start,
            end=s_end,
            words=words
        ))
        current_time = s_end + 1.0
        idx += 1

    return TranscriptData(
        language="en",
        words=[w for s in sentences for w in s.words],
        sentences=sentences,
        full_text=" ".join(s.text for s in sentences)
    )

def test_chunking_short_video():
    # 5-minute video should be a single chunk (< 15 mins)
    transcript = create_mock_transcript(5.0)
    chunks = chunk_transcript(transcript, max_chunk_duration=900.0, overlap_duration=90.0)
    assert len(chunks) == 1
    assert chunks[0].start_time == transcript.sentences[0].start
    assert chunks[0].end_time == transcript.sentences[-1].end

def test_chunking_long_video():
    # 35-minute video should produce multiple overlapping chunks
    transcript = create_mock_transcript(35.0)
    chunks = chunk_transcript(transcript, max_chunk_duration=900.0, overlap_duration=90.0)
    assert len(chunks) >= 2
    # Verify adjacent chunks have overlap
    for i in range(len(chunks) - 1):
        assert chunks[i].end_time > chunks[i + 1].start_time
