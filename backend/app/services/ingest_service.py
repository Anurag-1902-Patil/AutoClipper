import os
import re
from pathlib import Path
from typing import Optional, Dict, Any
import yt_dlp

from backend.app.config import CACHE_PATH
from backend.app.models.schemas import VideoMetadata

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
)

def extract_video_id(url_or_id: str) -> str:
    """Extract 11-character YouTube video ID from URL or raw ID."""
    match = YOUTUBE_REGEX.search(url_or_id.strip())
    if match:
        return match.group(1)
    if len(url_or_id.strip()) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url_or_id.strip()):
        return url_or_id.strip()
    raise ValueError(f"Invalid YouTube URL or ID: {url_or_id}")

def fetch_metadata(url_or_id: str) -> VideoMetadata:
    """Fetch video metadata without downloading the full video."""
    video_id = extract_video_id(url_or_id)
    canonical_url = f"https://www.youtube.com/watch?v=https://www.youtube.com/watch?v={video_id}" if "youtube" not in url_or_id else url_or_id

    ydl_opts = {
        'extract_flat': False,
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(canonical_url, download=False)
        if not info:
            raise RuntimeError(f"Could not retrieve info for {canonical_url}")

        chapters = []
        if 'chapters' in info and info['chapters']:
            for ch in info['chapters']:
                chapters.append({
                    'title': ch.get('title', ''),
                    'start_time': ch.get('start_time', 0.0),
                    'end_time': ch.get('end_time', 0.0)
                })

        return VideoMetadata(
            video_id=video_id,
            url=f"https://www.youtube.com/watch?v={video_id}",
            title=info.get('title', 'Untitled Video'),
            channel=info.get('uploader', info.get('channel', 'Unknown Channel')),
            duration=float(info.get('duration', 0.0)),
            description=info.get('description', '')[:2000],  # truncated for safety
            thumbnail_url=info.get('thumbnail', f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"),
            chapters=chapters
        )

def download_video(url_or_id: str, output_dir: Optional[Path] = None, progress_hook=None) -> Path:
    """
    Download best quality video+audio up to 1080p, merging to MP4.
    Caches by video ID so reruns are instantaneous.
    """
    output_dir = output_dir or CACHE_PATH
    output_dir.mkdir(parents=True, exist_ok=True)
    video_id = extract_video_id(url_or_id)
    target_mp4 = output_dir / f"{video_id}.mp4"

    # Check cache
    if target_mp4.exists() and target_mp4.stat().st_size > 10000:
        return target_mp4

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    
    ydl_opts: Dict[str, Any] = {
        'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
        'outtmpl': str(output_dir / f"{video_id}.%(ext)s"),
        'merge_output_format': 'mp4',
        'quiet': False,
        'no_warnings': True,
    }

    if progress_hook:
        ydl_opts['progress_hooks'] = [progress_hook]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([canonical_url])

    # In case yt-dlp named it slightly differently or merged
    if target_mp4.exists():
        return target_mp4

    # Look for any matching file with that video_id in the folder
    matches = list(output_dir.glob(f"{video_id}.*"))
    for m in matches:
        if m.suffix.lower() in ['.mp4', '.mkv', '.webm']:
            return m

    raise FileNotFoundError(f"Downloaded file not found for video ID: {video_id}")
