import pytest
from pathlib import Path
from backend.app.models.schemas import WordItem, SubtitlePreset
from backend.app.services.subtitle_generator import (
    group_words_into_subtitle_lines, generate_ass_subtitles, BUILTIN_PRESETS
)

def test_group_words_into_subtitle_lines_natural_breaks():
    # Words with terminal punctuation and pause
    words = [
        WordItem(word="Hello", start=0.0, end=0.3),
        WordItem(word="world!", start=0.35, end=0.7),  # Should break after "world!" due to '!'
        WordItem(word="This", start=0.8, end=1.0),
        WordItem(word="is", start=1.05, end=1.2),
        WordItem(word="great.", start=1.25, end=1.6),
    ]

    groups = group_words_into_subtitle_lines(words, clip_start=0.0, clip_end=2.0, words_per_line=4)
    assert len(groups) == 2
    assert [w.word for w in groups[0].words] == ["Hello", "world!"]
    assert [w.word for w in groups[1].words] == ["This", "is", "great."]

def test_ass_continuous_coverage_no_flicker(tmp_path):
    words = [
        WordItem(word="The", start=1.0, end=1.3),
        WordItem(word="secret", start=1.5, end=1.9),  # 0.2s pause between "The" and "secret"
    ]
    preset = BUILTIN_PRESETS["hormozi"]
    out_ass = tmp_path / "test.ass"
    generate_ass_subtitles(words, clip_start=1.0, clip_end=2.5, preset=preset, output_path=out_ass)

    content = out_ass.read_text(encoding="utf-8")
    dialogue_lines = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogue_lines) >= 2
    
    # In continuous coverage, word 1 end time must match word 2 start time so subtitle does not disappear
    # First dialogue: 0:00:00.00 to 0:00:00.50
    # Second dialogue: 0:00:00.50 to ...
    parts_0 = dialogue_lines[0].split(",")
    parts_1 = dialogue_lines[1].split(",")
    # End of line 0 should equal start of line 1
    assert parts_0[2] == parts_1[1], f"Expected seamless transition without gap: {parts_0[2]} vs {parts_1[1]}"

def test_polish_subtitles_endpoint_integration():
    import json
    from backend.app.database import get_db_connection
    from backend.app.api.clips import polish_subtitles
    from backend.app.models.schemas import PolishSubtitlesRequest

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO jobs (id, youtube_url, video_id, status, llm_provider)
        VALUES ('job_test_polish', 'https://youtube.com/watch?v=dummy', 'dummy', 'ready', 'gemini')
    """)
    dummy_words = [
        {"word": "um", "start": 0.0, "end": 0.3},
        {"word": "hello", "start": 0.3, "end": 0.6},
        {"word": "world", "start": 0.6, "end": 1.0}
    ]
    cursor.execute("""
        INSERT OR REPLACE INTO clips (id, job_id, clip_index, start_time, end_time, duration, hook_text, hook_strategy, virality_score, words_json)
        VALUES ('clip_test_polish', 'job_test_polish', 1, 0.0, 1.0, 1.0, 'Hook', 'curiosity', 90, ?)
    """, (json.dumps(dummy_words),))
    conn.commit()
    conn.close()

    # Call endpoint with request containing words
    req = PolishSubtitlesRequest(words=[WordItem(**w) for w in dummy_words])
    res = polish_subtitles('clip_test_polish', req)

    assert "words" in res
    assert len(res["words"]) > 0
    # Confirm filler "um" is removed or formatted properly and starts/ends are chronological
    starts = [w["start"] for w in res["words"]]
    assert starts == sorted(starts)

