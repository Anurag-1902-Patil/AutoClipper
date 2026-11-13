export interface WordItem {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  is_emphasized?: boolean;
}

export interface SEOMetadata {
  yt_title: string;
  yt_description: string;
  yt_hashtags: string[];
  yt_tags: string[];
  ig_caption: string;
  ig_hashtags: string[];
  thumbnail_timestamp: number;
  best_time_to_post: string;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  is_builtin: boolean;
  font_family: string;
  font_size: number;
  font_weight: string;
  primary_color: string;
  highlight_color: string;
  stroke_color: string;
  stroke_width: number;
  shadow_offset: number;
  bg_box: boolean;
  bg_box_color?: string;
  position: 'top' | 'middle' | 'bottom';
  animation_style: 'karaoke' | 'pop' | 'bounce' | 'typewriter' | 'fade' | 'hormozi';
  uppercase: boolean;
  keyword_emphasis: boolean;
  words_per_line: number;
  max_lines: number;
}

export interface Clip {
  id: string;
  job_id: string;
  clip_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  hook_text: string;
  hook_strategy: string;
  virality_score: number;
  reasoning: string;
  topic: string;
  summary: string;
  is_selected: number | boolean;
  
  trim_start_offset: number;
  trim_end_offset: number;
  words?: WordItem[];
  subtitle_preset_id: string;
  subtitle_settings?: Partial<SubtitlePreset>;
  enable_hook_overlay: number | boolean;
  enable_silence_removal: number | boolean;
  enable_loudnorm: number | boolean;
  framing_mode: 'auto_face' | 'center' | 'blur_bg';
  
  rendered_video_path?: string;
  render_status?: string;
  seo_metadata?: SEOMetadata;
}

export interface Job {
  id: string;
  youtube_url: string;
  video_id: string;
  title?: string;
  channel?: string;
  duration?: number;
  thumbnail_url?: string;
  status: 'queued' | 'ingesting' | 'transcribing' | 'analyzing' | 'seo' | 'ready' | 'failed';
  current_step?: string;
  progress_pct: number;
  error_message?: string;
  llm_provider?: string;
  token_usage_input?: number;
  token_usage_output?: number;
  estimated_cost_usd?: number;
  created_at?: string;
  clips?: Clip[];
}
