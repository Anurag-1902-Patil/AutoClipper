from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class VideoMetadata(BaseModel):
    video_id: str
    url: str
    title: str
    channel: str = "Unknown"
    duration: float = 0.0
    description: str = ""
    thumbnail_url: str = ""
    chapters: List[Dict[str, Any]] = Field(default_factory=list)

class WordItem(BaseModel):
    word: str
    start: float
    end: float
    confidence: Optional[float] = 1.0
    is_emphasized: Optional[bool] = False

class SentenceItem(BaseModel):
    text: str
    start: float
    end: float
    words: List[WordItem] = Field(default_factory=list)

class TranscriptData(BaseModel):
    language: str = "en"
    words: List[WordItem] = Field(default_factory=list)
    sentences: List[SentenceItem] = Field(default_factory=list)
    full_text: str = ""

class CandidateClip(BaseModel):
    clip_index: int = 1
    start_time: float
    end_time: float
    duration: float
    hook_text: str
    hook_strategy: str = "curiosity_gap"
    virality_score: int = Field(ge=0, le=100)
    reasoning: str
    topic: str
    summary: str
    reorder_cold_open: Optional[bool] = False
    cold_open_text: Optional[str] = None

class CandidateClipsOutput(BaseModel):
    clips: List[CandidateClip] = Field(default_factory=list)

class SEOMetadata(BaseModel):
    yt_title: str
    yt_description: str
    yt_hashtags: List[str] = Field(default_factory=list)
    yt_tags: List[str] = Field(default_factory=list)
    ig_caption: str
    ig_hashtags: List[str] = Field(default_factory=list)
    thumbnail_timestamp: float = 0.0
    best_time_to_post: str = "18:00 - 21:00 (Local peak)"

class SubtitlePreset(BaseModel):
    id: str
    name: str
    is_builtin: bool = False
    font_family: str = "Montserrat"
    font_size: int = 70
    font_weight: str = "black"
    primary_color: str = "#FFFFFF"
    highlight_color: str = "#FFDF00"  # Vibrant gold/yellow
    stroke_color: str = "#000000"
    stroke_width: int = 6
    shadow_offset: int = 3
    bg_box: bool = False
    bg_box_color: Optional[str] = "rgba(0,0,0,0.7)"
    position: str = "bottom"  # 'top', 'middle', 'bottom'
    animation_style: str = "hormozi"  # 'karaoke', 'pop', 'bounce', 'typewriter', 'fade', 'hormozi'
    uppercase: bool = True
    keyword_emphasis: bool = True
    words_per_line: int = 3
    max_lines: int = 2
    sync_offset_ms: Optional[int] = 0

class JobCreateRequest(BaseModel):
    youtube_url: str
    llm_provider: Optional[str] = None
    min_clip_duration: float = 20.0
    max_clip_duration: float = 60.0
    num_clips_target: int = 8
    default_preset_id: str = "hormozi"
    enable_face_tracking: bool = True
    enable_loudnorm: bool = True
    enable_silence_removal: bool = False
    enable_hook_overlay: bool = True

class ClipUpdateRequest(BaseModel):
    trim_start_offset: Optional[float] = None
    trim_end_offset: Optional[float] = None
    hook_text: Optional[str] = None
    words: Optional[List[WordItem]] = None
    subtitle_preset_id: Optional[str] = None
    subtitle_settings: Optional[Dict[str, Any]] = None
    enable_hook_overlay: Optional[bool] = None
    enable_silence_removal: Optional[bool] = None
    enable_loudnorm: Optional[bool] = None
    framing_mode: Optional[str] = None  # 'auto_face', 'center', 'blur_bg'
    is_selected: Optional[bool] = None
    seo_metadata: Optional[SEOMetadata] = None

class PolishSubtitlesRequest(BaseModel):
    words: Optional[List[WordItem]] = None

class PolishedSubtitlesOutput(BaseModel):
    words: List[WordItem]

