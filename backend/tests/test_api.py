import pytest
from backend.app.main import health_check
from backend.app.api.presets import list_presets, create_custom_preset
from backend.app.models.schemas import SubtitlePreset

def test_health_check_endpoint():
    res = health_check()
    assert res["status"] == "healthy"
    assert "service" in res

def test_presets_list_endpoint():
    presets = list_presets()
    assert len(presets) >= 6
    preset_ids = [p.id for p in presets]
    assert "hormozi" in preset_ids
    assert "neon_cyber" in preset_ids

def test_create_custom_preset_endpoint():
    preset = SubtitlePreset(
        id="test_custom_style",
        name="Test Custom Style",
        font_family="Montserrat",
        font_size=60,
        primary_color="#FFFFFF",
        highlight_color="#00FF00",
        stroke_color="#000000",
        stroke_width=5,
        shadow_offset=2,
        bg_box=False,
        position="bottom",
        animation_style="pop",
        uppercase=True,
        keyword_emphasis=True,
        words_per_line=3,
        max_lines=2
    )
    created = create_custom_preset(preset)
    assert created.id == "test_custom_style"
    
    # Verify it appears in list
    all_presets = list_presets()
    assert any(p.id == "test_custom_style" for p in all_presets)
