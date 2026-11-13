import json
import re
import os
import html
from pathlib import Path
from typing import List, Dict, Any, Optional
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

from backend.app.config import TRANSCRIPTS_PATH, TEMP_PATH
from backend.app.models.schemas import WordItem, SentenceItem, TranscriptData

PUNCTUATION_ENDINGS = ('.', '!', '?', '।', '۔')  # includes Devanagari danda

def sanitize_caption_text(text: str) -> str:
    """
    Remove YouTube speaker turn arrows (>> or >), bracketed audio cues ([Music], [Applause]),
    and unescape HTML entities.
    """
    if not text:
        return ""
    # Unescape HTML entities like &#39;, &amp;, &quot;
    cleaned = html.unescape(text)
    # Remove bracketed sound effects like [Music], [Applause], [Laughter], (Music), etc.
    cleaned = re.sub(r'\[(?:Music|Applause|Laughter|Cheering|Audio|Silence|Inaudible|Whispering|Foreign|Background)[^\]]*\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\((?:Music|Applause|Laughter|Cheering|Audio|Silence|Inaudible|Whispering)[^\)]*\)', '', cleaned, flags=re.IGNORECASE)
    # Remove YouTube speaker change arrows >> or >
    cleaned = re.sub(r'(?:^|\s)>>+\s*', ' ', cleaned)
    cleaned = re.sub(r'(?:^|\s)>+\s*', ' ', cleaned)
    # Remove standalone >> or >
    cleaned = re.sub(r'^[>»\s]+|[>»\s]+$', '', cleaned)
    # Collapse extra whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def parse_json3_subtitles(json3_path: Path) -> List[WordItem]:
    """
    Parse YouTube's JSON3 subtitle format which contains native word-level events (segs with tOffsetMs).
    """
    with open(json3_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    words: List[WordItem] = []
    events = data.get('events', [])

    for ev in events:
        if 'segs' not in ev or not ev.get('tStartMs'):
            continue
        base_start = ev['tStartMs'] / 1000.0
        total_duration = ev.get('dDurationMs', 1000) / 1000.0

        segs = ev['segs']
        # Check if segs has word-level chunks or full sentence
        for i, seg in enumerate(segs):
            text = sanitize_caption_text(seg.get('utf8', ''))
            if not text:
                continue
            
            offset_ms = seg.get('tOffsetMs', 0)
            word_start = base_start + (offset_ms / 1000.0)
            
            # If the segment contains multiple space-separated words, subdivide it
            tokenized_words = [w for w in text.split() if w not in (">>", ">", ">>>", "»")]
            if len(tokenized_words) > 1:
                # Interpolate across the segment duration
                if i + 1 < len(segs) and 'tOffsetMs' in segs[i + 1]:
                    sub_dur = (segs[i + 1]['tOffsetMs'] - offset_ms) / 1000.0
                else:
                    sub_dur = max(0.5, total_duration - (offset_ms / 1000.0))
                
                total_chars = sum(len(w) for w in tokenized_words) or len(tokenized_words)
                curr_w_start = word_start
                for w in tokenized_words:
                    char_frac = len(w) / total_chars
                    w_dur = max(0.12, sub_dur * char_frac)
                    curr_w_end = curr_w_start + w_dur
                    words.append(WordItem(
                        word=w,
                        start=round(curr_w_start, 3),
                        end=round(max(curr_w_end, curr_w_start + 0.1), 3)
                    ))
                    curr_w_start = curr_w_end
            elif len(tokenized_words) == 1:
                # Single word segment
                single_w = tokenized_words[0]
                if i + 1 < len(segs) and 'tOffsetMs' in segs[i + 1]:
                    next_offset = segs[i + 1]['tOffsetMs'] / 1000.0
                    word_end = base_start + next_offset
                else:
                    est_dur = max(0.2, min(0.8, len(single_w) * 0.05))
                    word_end = min(base_start + total_duration, word_start + est_dur)

                words.append(WordItem(
                    word=single_w,
                    start=round(word_start, 3),
                    end=round(max(word_end, word_start + 0.1), 3)
                ))

    return words

def interpolate_words_from_snippets(snippets: List[Any]) -> List[WordItem]:
    """
    Interpolate word-level timestamps from segment-level snippets.
    Calculates word duration proportionally to character length with pauses.
    Supports both dicts and FetchedTranscriptSnippet objects.
    """
    words: List[WordItem] = []
    for snippet in snippets:
        if isinstance(snippet, dict):
            text = snippet.get('text', '').strip()
            seg_start = float(snippet.get('start', 0.0))
            seg_dur = float(snippet.get('duration', 1.0))
        else:
            text = (getattr(snippet, 'text', '') or '').strip()
            seg_start = float(getattr(snippet, 'start', 0.0))
            seg_dur = float(getattr(snippet, 'duration', 1.0))

        if not text:
            continue

        text = sanitize_caption_text(text)
        if not text:
            continue
        seg_end = seg_start + seg_dur

        raw_words = [w for w in text.split() if w not in (">>", ">", ">>>", "»")]
        if not raw_words:
            continue

        total_chars = sum(len(w) for w in raw_words)
        if total_chars == 0:
            total_chars = len(raw_words)

        current_time = seg_start
        for w in raw_words:
            char_fraction = len(w) / total_chars
            word_duration = max(0.12, seg_dur * char_fraction)
            w_end = min(seg_end, current_time + word_duration)
            
            words.append(WordItem(
                word=w,
                start=round(current_time, 3),
                end=round(max(w_end, current_time + 0.1), 3)
            ))
            current_time = w_end

    return words

def fetch_youtube_captions_via_ytdlp(video_id: str) -> Optional[List[WordItem]]:
    """
    Try downloading YouTube's JSON3 subtitles using yt-dlp to extract word-level timestamps.
    """
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    temp_sub_prefix = TEMP_PATH / f"sub_{video_id}"
    
    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitlesformat': 'json3',
        'subtitleslangs': ['en', 'hi', 'hi-Latn', 'en-US', 'en-GB'],
        'outtmpl': str(temp_sub_prefix),
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([canonical_url])

        # Search for generated json3 files
        sub_files = list(TEMP_PATH.glob(f"sub_{video_id}*.json3"))
        if sub_files:
            # Prefer English or Hindi if present
            words = parse_json3_subtitles(sub_files[0])
            # Clean up temp file
            for f in sub_files:
                try:
                    f.unlink()
                except Exception:
                    pass
            if words:
                return words
    except Exception:
        pass

    return None

def fetch_youtube_captions_via_api(video_id: str) -> Optional[List[WordItem]]:
    """
    Use youtube-transcript-api to get available captions (manual or auto-generated).
    Compatible with both v0.x and v1.x of youtube-transcript-api.
    """
    try:
        # v1.x class instance or v0.x module
        if hasattr(YouTubeTranscriptApi, 'list'):
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
        elif hasattr(YouTubeTranscriptApi, 'list_transcripts'):
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        else:
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
        
        preferred_langs = ['en', 'en-US', 'en-GB', 'hi', 'hi-Latn']
        transcript = None

        if hasattr(transcript_list, 'find_transcript'):
            try:
                transcript = transcript_list.find_transcript(preferred_langs)
            except Exception:
                pass

        if not transcript and hasattr(transcript_list, 'find_generated_transcript'):
            try:
                transcript = transcript_list.find_generated_transcript(preferred_langs)
            except Exception:
                pass

        if not transcript:
            for t in transcript_list:
                transcript = t
                break

        if transcript:
            snippets = transcript.fetch()
            return interpolate_words_from_snippets(snippets)
    except (TranscriptsDisabled, NoTranscriptFound):
        return None
    except Exception as e:
        print(f"[warning] youtube-transcript-api encountered: {e}")
        return None

    return None

def group_words_into_sentences(words: List[WordItem]) -> List[SentenceItem]:
    """
    Group word items into sentences using punctuation, pause thresholds, and max length.
    """
    sentences: List[SentenceItem] = []
    if not words:
        return sentences

    current_words: List[WordItem] = []

    for i, word_item in enumerate(words):
        current_words.append(word_item)
        word_text = word_item.word.strip()

        # Check ending condition
        ends_with_punct = any(word_text.endswith(p) for p in PUNCTUATION_ENDINGS)
        
        # Check pause gap to next word (> 0.75s)
        has_pause = False
        if i + 1 < len(words):
            gap = words[i + 1].start - word_item.end
            if gap > 0.75:
                has_pause = True

        # Check max sentence word limit (avoid runaway sentences without punctuation)
        is_too_long = len(current_words) >= 20

        is_last = (i == len(words) - 1)

        if ends_with_punct or has_pause or is_too_long or is_last:
            sentence_text = " ".join(w.word for w in current_words)
            sentences.append(SentenceItem(
                text=sentence_text,
                start=current_words[0].start,
                end=current_words[-1].end,
                words=list(current_words)
            ))
            current_words = []

    if current_words:
        sentence_text = " ".join(w.word for w in current_words)
        sentences.append(SentenceItem(
            text=sentence_text,
            start=current_words[0].start,
            end=current_words[-1].end,
            words=list(current_words)
        ))

    return sentences

def get_transcript(video_id: str, audio_path: Optional[Path] = None, force_refresh: bool = False) -> TranscriptData:
    """
    Orchestrate fetching word-level transcript:
    1. Check local cache JSON
    2. Try YouTube JSON3 subtitles (yt-dlp)
    3. Try youtube-transcript-api
    4. Group into sentences and save to cache
    """
    cache_file = TRANSCRIPTS_PATH / f"{video_id}.json"
    if cache_file.exists() and not force_refresh:
        with open(cache_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return TranscriptData(**data)

    words: Optional[List[WordItem]] = None

    # Step 1: Direct YouTube Transcript API (Fastest, avoids yt-dlp 429 rate limits)
    words = fetch_youtube_captions_via_api(video_id)

    # Step 2: Try yt-dlp json3 subtitles if api didn't yield words
    if not words or len(words) < 5:
        words = fetch_youtube_captions_via_ytdlp(video_id)

    if not words:
        raise RuntimeError(
            f"Unable to retrieve captions for video {video_id}. "
            "The video does not have available YouTube captions or transcripts."
        )

    sentences = group_words_into_sentences(words)
    full_text = " ".join(s.text for s in sentences)

    transcript_data = TranscriptData(
        language="en",
        words=words,
        sentences=sentences,
        full_text=full_text
    )

    # Cache transcript JSON
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(transcript_data.model_dump(), f, indent=2, ensure_ascii=False)

    return transcript_data
