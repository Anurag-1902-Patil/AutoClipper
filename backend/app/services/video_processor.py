import os
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
from backend.app.config import TEMP_PATH, OUTPUT_PATH
from backend.app.models.schemas import CandidateClip, WordItem, SubtitlePreset
from backend.app.services.speaker_tracker import tracker
from backend.app.services.subtitle_generator import (
    generate_ass_subtitles, BUILTIN_PRESETS, format_ass_time, hex_to_ass_color, append_hook_overlay_to_ass
)

def escape_ffmpeg_filter_path(path: Path) -> str:
    """Escape Windows path for FFmpeg filter arguments (subtitles='...')."""
    # Convert \ to /
    p = str(path.resolve()).replace('\\', '/')
    # Escape colons (e.g. C:/ -> C\:/)
    p = p.replace(':', r'\:')
    # Escape single quotes if any
    p = p.replace("'", r"\'")
    return p

def render_clip_mp4(
    source_video_path: Path,
    clip: CandidateClip,
    words: List[WordItem],
    output_path: Optional[Path] = None,
    preset: Optional[SubtitlePreset] = None,
    framing_mode: Optional[str] = None,
    enable_hook_overlay: bool = True,
    enable_loudnorm: bool = True,
    enable_silence_removal: bool = False
) -> Path:
    """
    Renders an individual vertical 9:16 clip (1080x1920) with:
    - Frame-accurate cutting
    - Intelligent speaker face tracking or blurred-background fill
    - Word-level animated ASS subtitles burned via libass
    - Audio loudnorm and optional hook overlay
    """
    preset = preset or BUILTIN_PRESETS.get("hormozi", BUILTIN_PRESETS["hormozi"])
    framing_mode = framing_mode or "auto_face"
    
    output_path = output_path or (TEMP_PATH / f"clip_{clip.clip_index}_{int(clip.start_time)}.mp4")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    clip_duration = clip.end_time - clip.start_time
    if clip_duration <= 0:
        raise ValueError(f"Invalid clip duration: {clip_duration}s")

    # Step 1: Speaker face tracking analysis if auto_face
    speaker_x = 0.5
    if framing_mode == "auto_face":
        norm_x, rec = tracker.analyze_speaker_framing(
            video_path=source_video_path,
            start_time=clip.start_time,
            duration=min(15.0, clip_duration)
        )
        if norm_x is not None:
            speaker_x = norm_x
        if rec == "blur_bg" and norm_x is None:
            framing_mode = "blur_bg"

    # Step 2: Generate ASS Subtitles
    ass_file = TEMP_PATH / f"sub_{clip.clip_index}_{int(clip.start_time)}.ass"
    generate_ass_subtitles(
        words=words,
        clip_start=clip.start_time,
        clip_end=clip.end_time,
        preset=preset,
        output_path=ass_file
    )

    if enable_hook_overlay and clip.hook_text:
        append_hook_overlay_to_ass(ass_file, clip.hook_text, duration_sec=3.2)

    escaped_ass = escape_ffmpeg_filter_path(ass_file)

    # Step 3: Build FFmpeg video filter chain
    if framing_mode == "blur_bg":
        vf_chain = (
            f"split=2[orig][bg];"
            f"[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[blurred];"
            f"[orig]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
            f"[blurred][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,"
            f"subtitles='{escaped_ass}'"
        )
    elif framing_mode == "center":
        vf_chain = (
            f"crop=ih*9/16:ih:(iw-ow)/2:0,"
            f"scale=1080:1920:flags=lanczos,setsar=1,"
            f"subtitles='{escaped_ass}'"
        )
    else:
        # auto_face speaker centering
        # Crop width is ih * 9/16, centered horizontally at speaker_x
        vf_chain = (
            f"crop=w=ih*9/16:h=ih:x='max(0,min(iw-ow,iw*{speaker_x:.3f}-ow/2))':y=0,"
            f"scale=1080:1920:flags=lanczos,setsar=1,"
            f"subtitles='{escaped_ass}'"
        )

    # Step 4: Audio filter chain
    af_filters = []
    if enable_silence_removal:
        af_filters.append("silenceremove=start_periods=1:start_duration=0.5:start_threshold=-40dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-40dB")
    if enable_loudnorm:
        af_filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    af_chain = ",".join(af_filters) if af_filters else "anull"

    # Step 5: Execute FFmpeg
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", f"{clip.start_time:.3f}",
        "-to", f"{clip.end_time:.3f}",
        "-i", str(source_video_path),
        "-vf", vf_chain,
        "-af", af_chain,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "20",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-movflags", "+faststart",
        str(output_path)
    ]

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        # Check stderr
        raise RuntimeError(f"FFmpeg render failed with code {result.returncode}:\n{result.stderr[-1000:]}")

    return output_path
