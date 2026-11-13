from typing import List, Dict, Any, Optional
from backend.app.models.schemas import TranscriptData, SentenceItem, WordItem

def snap_to_boundary(timestamp: float, transcript: TranscriptData, mode: str = "start") -> float:
    """
    Snaps an arbitrary timestamp (seconds) strictly to a word boundary,
    favoring sentence boundaries when within 1.5 seconds.
    mode: 'start' snaps to word start; 'end' snaps to word end.
    """
    if not transcript.words:
        return timestamp

    # Check sentence boundaries first
    if mode == "start":
        for s in transcript.sentences:
            if abs(s.start - timestamp) <= 1.5:
                return round(s.start, 2)
        # Fall back to nearest word start
        closest_word = min(transcript.words, key=lambda w: abs(w.start - timestamp))
        return round(closest_word.start, 2)
    else:
        for s in transcript.sentences:
            if abs(s.end - timestamp) <= 1.5:
                return round(s.end, 2)
        # Fall back to nearest word end
        closest_word = min(transcript.words, key=lambda w: abs(w.end - timestamp))
        return round(closest_word.end, 2)

class TranscriptChunk:
    def __init__(self, chunk_index: int, start_time: float, end_time: float, sentences: List[SentenceItem]):
        self.chunk_index = chunk_index
        self.start_time = start_time
        self.end_time = end_time
        self.sentences = sentences
        self.text = " ".join(s.text for s in sentences)

def chunk_transcript(
    transcript: TranscriptData,
    max_chunk_duration: float = 900.0,  # 15 minutes per chunk
    overlap_duration: float = 90.0      # 1.5 minutes overlap
) -> List[TranscriptChunk]:
    """
    Chunks a long transcript into overlapping segments snapped to sentence boundaries.
    If the video is shorter than max_chunk_duration, returns a single chunk.
    """
    if not transcript.sentences:
        return []

    total_duration = transcript.sentences[-1].end - transcript.sentences[0].start
    if total_duration <= max_chunk_duration:
        return [TranscriptChunk(
            chunk_index=0,
            start_time=transcript.sentences[0].start,
            end_time=transcript.sentences[-1].end,
            sentences=transcript.sentences
        )]

    chunks: List[TranscriptChunk] = []
    chunk_index = 0
    current_sentence_idx = 0
    total_sentences = len(transcript.sentences)

    while current_sentence_idx < total_sentences:
        chunk_sentences: List[SentenceItem] = []
        chunk_start = transcript.sentences[current_sentence_idx].start
        
        idx = current_sentence_idx
        while idx < total_sentences:
            s = transcript.sentences[idx]
            chunk_sentences.append(s)
            
            # If we reached max duration for this chunk
            if (s.end - chunk_start) >= max_chunk_duration:
                break
            idx += 1

        chunks.append(TranscriptChunk(
            chunk_index=chunk_index,
            start_time=chunk_start,
            end_time=chunk_sentences[-1].end,
            sentences=chunk_sentences
        ))
        chunk_index += 1

        if idx >= total_sentences - 1:
            break

        # Calculate next starting sentence index with overlap
        target_next_start = chunk_sentences[-1].end - overlap_duration
        next_idx = idx
        while next_idx > current_sentence_idx and transcript.sentences[next_idx].start > target_next_start:
            next_idx -= 1

        # Advance forward at least 1 sentence
        current_sentence_idx = max(current_sentence_idx + 1, next_idx)

    return chunks
