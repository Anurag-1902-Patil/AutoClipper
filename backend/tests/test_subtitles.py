import pytest
from pathlib import Path
from backend.app.models.schemas import WordItem, SubtitlePreset
from backend.app.services.subtitle_generator import (
    generate_ass_subtitles, hex_to_ass_color, BUILTIN_PRESETS, append_hook_overlay_to_ass
)

def test_hex_to_ass_color():
    # White #FFFFFF -> &H00FFFFFF&
    assert hex_to_ass_color("#FFFFFF") == "&H00FFFFFF&"
    # Yellow #FFFF00 (R=FF, G=FF, B=00) -> &H0000FFFF& in BGR
    assert hex_to_ass_color("#FFFF00") == "&H0000FFFF&"
    # Red #FF0000 (R=FF, G=00, B=00) -> &H000000FF&
    assert hex_to_ass_color("#FF0000") == "&H000000FF&"

def test_ass_generation_all_styles(tmp_path: Path):
    words = [
        WordItem(word="This", start=0.0, end=0.4),
        WordItem(word="is", start=0.4, end=0.6),
        WordItem(word="a", start=0.6, end=0.8),
        WordItem(word="viral", start=0.8, end=1.2),
        WordItem(word="hook", start=1.2, end=1.8),
        WordItem(word="test", start=1.8, end=2.4),
    ]

    for preset_id, preset in BUILTIN_PRESETS.items():
        out_file = tmp_path / f"test_{preset_id}.ass"
        generate_ass_subtitles(
            words=words,
            clip_start=0.0,
            clip_end=2.5,
            preset=preset,
            output_path=out_file
        )

        assert out_file.exists()
        content = out_file.read_text(encoding="utf-8")
        assert "[Script Info]" in content
        assert "PlayResX: 1080" in content
        assert "PlayResY: 1920" in content
        assert "Dialogue: " in content

def test_hook_overlay_injection(tmp_path: Path):
    words = [WordItem(word="Hello", start=0.0, end=1.0)]
    out_file = tmp_path / "test_hook.ass"
    generate_ass_subtitles(
        words=words,
        clip_start=0.0,
        clip_end=2.0,
        preset=BUILTIN_PRESETS["hormozi"],
        output_path=out_file
    )

    append_hook_overlay_to_ass(out_file, "THE 1 VIRAL SECRET", duration_sec=3.0)
    content = out_file.read_text(encoding="utf-8")
    assert "HookHeader" in content
    assert "THE 1 VIRAL SECRET" in content
