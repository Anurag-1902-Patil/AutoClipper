import re
from pathlib import Path
from typing import List, Optional, Dict, Any
from backend.app.models.schemas import WordItem, SubtitlePreset

BUILTIN_PRESETS: Dict[str, SubtitlePreset] = {
    "hormozi": SubtitlePreset(
        id="hormozi",
        name="Hormozi Viral",
        is_builtin=True,
        font_family="Montserrat",
        font_size=72,
        font_weight="black",
        primary_color="#FFFFFF",
        highlight_color="#FFDF00",  # Intense yellow
        stroke_color="#000000",
        stroke_width=7,
        shadow_offset=4,
        bg_box=False,
        position="bottom",
        animation_style="hormozi",
        uppercase=True,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    ),
    "pop_bounce": SubtitlePreset(
        id="pop_bounce",
        name="Pop & Bounce",
        is_builtin=True,
        font_family="Montserrat",
        font_size=70,
        font_weight="black",
        primary_color="#FFFFFF",
        highlight_color="#00F0FF",  # Vibrant cyan
        stroke_color="#000000",
        stroke_width=6,
        shadow_offset=3,
        bg_box=False,
        position="bottom",
        animation_style="bounce",
        uppercase=True,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    ),
    "neon_cyber": SubtitlePreset(
        id="neon_cyber",
        name="Neon Cyberpunk",
        is_builtin=True,
        font_family="Montserrat",
        font_size=68,
        font_weight="bold",
        primary_color="#00FFFF",  # Cyan
        highlight_color="#FF007F",  # Neon pink
        stroke_color="#0A0A12",
        stroke_width=8,
        shadow_offset=5,
        bg_box=False,
        position="bottom",
        animation_style="pop",
        uppercase=True,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    ),
    "clean_minimal": SubtitlePreset(
        id="clean_minimal",
        name="Clean Minimal",
        is_builtin=True,
        font_family="Arial",
        font_size=58,
        font_weight="bold",
        primary_color="#FFFFFF",
        highlight_color="#E0E0E0",
        stroke_color="#111111",
        stroke_width=3,
        shadow_offset=1,
        bg_box=False,
        position="bottom",
        animation_style="fade",
        uppercase=False,
        keyword_emphasis=False,
        words_per_line=4,
        max_lines=2
    ),
    "boxed_punch": SubtitlePreset(
        id="boxed_punch",
        name="Boxed Punch",
        is_builtin=True,
        font_family="Montserrat",
        font_size=66,
        font_weight="black",
        primary_color="#FFFFFF",
        highlight_color="#00FF66",  # Lime green
        stroke_color="#000000",
        stroke_width=0,
        shadow_offset=0,
        bg_box=True,
        bg_box_color="rgba(0,0,0,0.85)",
        position="bottom",
        animation_style="karaoke",
        uppercase=True,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    ),
    "hindi_devanagari": SubtitlePreset(
        id="hindi_devanagari",
        name="Hindi / Devanagari",
        is_builtin=True,
        font_family="Noto Sans Devanagari",
        font_size=72,
        font_weight="bold",
        primary_color="#FFFFFF",
        highlight_color="#FFA500",  # Saffron / Orange
        stroke_color="#000000",
        stroke_width=6,
        shadow_offset=3,
        bg_box=False,
        position="bottom",
        animation_style="hormozi",
        uppercase=False,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    )
}

def hex_to_ass_color(hex_color: str, default: str = "&H00FFFFFF&") -> str:
    """Convert #RRGGBB or #RGB hex string to ASS BGR format &H00BBGGRR&."""
    hex_color = hex_color.strip().lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)
    if len(hex_color) != 6:
        return default
    r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
    return f"&H00{b}{g}{r}&"

def format_ass_time(seconds: float) -> str:
    """Format seconds into H:MM:SS.cs for ASS subtitles."""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def append_hook_overlay_to_ass(ass_path: Path, hook_text: str, duration_sec: float = 3.0):
    """
    Appends a hook banner to the ASS script for the first ~3.0 seconds,
    framed near the top safe zone in bold with a vibrant glow.
    """
    if not hook_text:
        return

    hook_style = (
        "Style: HookHeader,Montserrat,68,&H00FFFFFF&,&H0000DFEF&,&H00000000&,&H80000000&,"
        "-1,0,0,0,100,100,0,0,1,6,4,8,80,80,220,1\n"
    )

    t_start = "0:00:00.00"
    t_end = format_ass_time(duration_sec)

    words = hook_text.split()
    if len(words) > 5:
        mid = len(words) // 2
        formatted_text = " ".join(words[:mid]) + r"\N" + " ".join(words[mid:])
    else:
        formatted_text = hook_text

    dialogue_entry = (
        f"Dialogue: 1,{t_start},{t_end},HookHeader,,0,0,0,,"
        r"{\t(0,180,\fscx108\fscy108)\t(180,300,\fscx100\fscy100)}"
        + formatted_text + "\n"
    )

    with open(ass_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "[V4+ Styles]" in content and "HookHeader" not in content:
        content = content.replace("[V4+ Styles]\nFormat:", f"[V4+ Styles]\n{hook_style}Format:")

    content += dialogue_entry

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(content)

class SubtitleLineGroup:
    def __init__(self, words: List[WordItem], start_time: float, end_time: float):
        self.words = words
        self.start_time = start_time
        self.end_time = end_time

def group_words_into_subtitle_lines(
    words: List[WordItem],
    clip_start: float,
    clip_end: float,
    words_per_line: int = 3,
    max_lines: int = 2
) -> List[SubtitleLineGroup]:
    """
    Extracts words falling within [clip_start, clip_end], offsets their times to start from 0.0,
    and clusters them into readable 1-4 word subtitle frames.
    """
    clip_words = []
    for w in words:
        # Check if word overlaps with clip interval
        if w.end >= clip_start and w.start <= clip_end:
            # Re-align relative to clip start
            rel_start = max(0.0, w.start - clip_start)
            rel_end = max(rel_start + 0.1, w.end - clip_start)
            clip_words.append(WordItem(
                word=w.word,
                start=round(rel_start, 2),
                end=round(rel_end, 2),
                confidence=w.confidence,
                is_emphasized=w.is_emphasized
            ))

    if not clip_words:
        return []

    lines: List[SubtitleLineGroup] = []
    max_words_per_frame = words_per_line * max_lines
    i = 0
    total_words = len(clip_words)

    while i < total_words:
        # Determine natural grouping boundary:
        # 1. Break at sentence ending punctuation (. ? ! …)
        # 2. Break on pause > 0.35s between words
        # 3. Break at comma if already >= 2 words
        # 4. Cap at words_per_line
        count = 1
        while count < words_per_line and (i + count) < total_words:
            prev_w = clip_words[i + count - 1]
            curr_w = clip_words[i + count]
            if re.search(r'[.?!…]$', prev_w.word.strip()):
                break
            if curr_w.start - prev_w.end > 0.35:
                break
            if re.search(r'[,;:]$', prev_w.word.strip()) and count >= 2:
                break
            count += 1

        frame_words = clip_words[i : i + count]
        frame_start = frame_words[0].start
        frame_end = frame_words[-1].end

        # Extend frame end slightly so subtitle doesn't flicker out before next word
        if i + count < total_words:
            next_start = clip_words[i + count].start
            if next_start - frame_end < 0.4:
                frame_end = next_start
            else:
                frame_end = min(frame_end + 0.25, next_start)
        else:
            frame_end = min(max(0.0, clip_end - clip_start), frame_end + 0.35)

        lines.append(SubtitleLineGroup(
            words=frame_words,
            start_time=frame_start,
            end_time=frame_end
        ))
        i += count

    return lines

def generate_ass_subtitles(
    words: List[WordItem],
    clip_start: float,
    clip_end: float,
    preset: SubtitlePreset,
    output_path: Path
) -> Path:
    """
    Generates an Advanced SubStation Alpha (.ass) subtitle file with:
    - 9:16 aspect ratio coordinate space (1080x1920)
    - Safe zones (keeping out of bottom 20% & right edge)
    - High-impact animated styles (karaoke, pop, bounce, typewriter, fade, hormozi)
    """
    groups = group_words_into_subtitle_lines(
        words=words,
        clip_start=clip_start,
        clip_end=clip_end,
        words_per_line=preset.words_per_line,
        max_lines=preset.max_lines
    )

    primary_ass = hex_to_ass_color(preset.primary_color)
    highlight_ass = hex_to_ass_color(preset.highlight_color)
    outline_ass = hex_to_ass_color(preset.stroke_color)
    shadow_ass = "&H80000000&"  # Semi-transparent black shadow

    # Calculate vertical alignment code (\an) and margins
    # \an2 = bottom-center, \an5 = middle-center, \an8 = top-center
    if preset.position == "top":
        align_code = 8
        margin_v = 240
    elif preset.position == "middle":
        align_code = 5
        margin_v = 100
    else:
        align_code = 2
        # Bottom safe zone: Keep above 420px to avoid Shorts/Reels captions and sound badges
        margin_v = 440

    margin_l = 120
    margin_r = 160  # Extra right margin to avoid like/comment buttons

    border_style = 3 if preset.bg_box else 1

    header = f"""[Script Info]
Title: AI Video Clipper Shorts
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{preset.font_family},{preset.font_size},{primary_ass},{highlight_ass},{outline_ass},{shadow_ass},-1,0,0,0,100,100,0,0,{border_style},{preset.stroke_width},{preset.shadow_offset},{align_code},{margin_l},{margin_r},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    dialogue_lines: List[str] = []

    for group in groups:
        t_start = format_ass_time(group.start_time)
        t_end = format_ass_time(group.end_time)

        # Build animated text based on style
        style = preset.animation_style.lower()

        if style in ["karaoke", "hormozi"]:
            # Active word color highlighting with smooth continuous coverage
            for active_idx, active_w in enumerate(group.words):
                w_start = format_ass_time(active_w.start)
                # Next word's start time or group end time ensures zero flicker during pauses
                if active_idx + 1 < len(group.words):
                    w_end = format_ass_time(group.words[active_idx + 1].start)
                else:
                    w_end = format_ass_time(group.end_time)

                rendered_words = []
                for idx, w in enumerate(group.words):
                    display_word = w.word.upper() if preset.uppercase else w.word
                    
                    if idx == active_idx:
                        # Highlight active word with highlight color and pop scale
                        if style == "hormozi":
                            rendered_words.append(r"{\c" + highlight_ass + r"\t(0,100,\fscx112\fscy112)\t(100,220,\fscx100\fscy100)}" + display_word + r"{\c" + primary_ass + r"}")
                        else:
                            rendered_words.append(r"{\c" + highlight_ass + r"}" + display_word + r"{\c" + primary_ass + r"}")
                    else:
                        # If emphasized word, tint it subtly with highlight color
                        if w.is_emphasized and preset.keyword_emphasis:
                            rendered_words.append(r"{\c" + highlight_ass + r"}" + display_word + r"{\c" + primary_ass + r"}")
                        else:
                            rendered_words.append(r"{\c" + primary_ass + r"}" + display_word)

                line_text = " ".join(rendered_words)
                dialogue_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line_text}")

        elif style == "bounce":
            # Bounce scale animation on active word
            for active_idx, active_w in enumerate(group.words):
                w_start = format_ass_time(active_w.start)
                if active_idx + 1 < len(group.words):
                    w_end = format_ass_time(group.words[active_idx + 1].start)
                else:
                    w_end = format_ass_time(group.end_time)

                rendered_words = []
                for idx, w in enumerate(group.words):
                    display_word = w.word.upper() if preset.uppercase else w.word
                    if idx == active_idx:
                        rendered_words.append(r"{\c" + highlight_ass + r"\t(0,100,\fscx120\fscy120)\t(100,200,\fscx95\fscy95)\t(200,300,\fscx100\fscy100)}" + display_word + r"{\c" + primary_ass + r"}")
                    else:
                        if w.is_emphasized and preset.keyword_emphasis:
                            rendered_words.append(r"{\c" + highlight_ass + r"}" + display_word + r"{\c" + primary_ass + r"}")
                        else:
                            rendered_words.append(r"{\c" + primary_ass + r"}" + display_word)

                line_text = " ".join(rendered_words)
                dialogue_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line_text}")

        elif style == "pop":
            # Pop scale-in on whole frame
            rendered_words = [w.word.upper() if preset.uppercase else w.word for w in group.words]
            line_text = r"{\t(0,140,\fscx115\fscy115)\t(140,260,\fscx100\fscy100)}" + " ".join(rendered_words)
            dialogue_lines.append(f"Dialogue: 0,{t_start},{t_end},Default,,0,0,0,,{line_text}")

        elif style == "typewriter":
            # Reveal words sequentially
            for active_idx in range(len(group.words)):
                cur_w = group.words[active_idx]
                w_start = format_ass_time(cur_w.start)
                w_end = format_ass_time(group.end_time if active_idx == len(group.words) - 1 else group.words[active_idx + 1].start)
                visible_words = [w.word.upper() if preset.uppercase else w.word for w in group.words[:active_idx + 1]]
                line_text = " ".join(visible_words)
                dialogue_lines.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{line_text}")

        else:
            # Default / Fade style
            rendered_words = [w.word.upper() if preset.uppercase else w.word for w in group.words]
            line_text = r"{\fad(120,120)}" + " ".join(rendered_words)
            dialogue_lines.append(f"Dialogue: 0,{t_start},{t_end},Default,,0,0,0,,{line_text}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(dialogue_lines))
        f.write("\n")

    return output_path
