import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, RotateCcw, Volume2, Sparkles, Sliders, Type, Scissors,
  Share2, Copy, Check, RefreshCw, Film, Save, CheckCircle2, ChevronRight, Eye
} from 'lucide-react';
import { Clip, WordItem, SubtitlePreset, SEOMetadata } from '../types';
import { updateClip, renderClipPreview, regenerateClipSEO, applyPresetToAll, savePreset, getPresets } from '../services/api';

interface EditorViewProps {
  clip: Clip;
  videoId: string;
  onBack: () => void;
  onRefreshJob: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ clip, videoId, onBack, onRefreshJob }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Clip state
  const [words, setWords] = useState<WordItem[]>(clip.words || []);
  const [trimStart, setTrimStart] = useState(clip.trim_start_offset || 0);
  const [trimEnd, setTrimEnd] = useState(clip.trim_end_offset || 0);
  const [hookText, setHookText] = useState(clip.hook_text || '');
  const [framingMode, setFramingMode] = useState(clip.framing_mode || 'auto_face');
  const [enableHookOverlay, setEnableHookOverlay] = useState(Boolean(clip.enable_hook_overlay));
  const [enableLoudnorm, setEnableLoudnorm] = useState(Boolean(clip.enable_loudnorm));
  const [enableSilenceRemoval, setEnableSilenceRemoval] = useState(Boolean(clip.enable_silence_removal));

  // Subtitle styling state
  const [presets, setPresets] = useState<SubtitlePreset[]>([]);
  const [activePresetId, setActivePresetId] = useState(clip.subtitle_preset_id || 'hormozi');
  const [customStyle, setCustomStyle] = useState<SubtitlePreset>({
    id: 'hormozi',
    name: 'Hormozi Viral',
    is_builtin: true,
    font_family: 'Montserrat',
    font_size: 42, // UI scaled size
    font_weight: 'black',
    primary_color: '#FFFFFF',
    highlight_color: '#FFDF00',
    stroke_color: '#000000',
    stroke_width: 5,
    shadow_offset: 3,
    bg_box: false,
    position: 'bottom',
    animation_style: 'hormozi',
    uppercase: true,
    keyword_emphasis: true,
    words_per_line: 3,
    max_lines: 2,
  });

  // SEO state
  const [seo, setSeo] = useState<SEOMetadata>(clip.seo_metadata || {
    yt_title: `${clip.hook_text} #Shorts`,
    yt_description: `${clip.summary}\nSubscribe for more!`,
    yt_hashtags: ['#Shorts', '#Viral', '#Trending'],
    yt_tags: [clip.topic, 'shorts', 'reels'],
    ig_caption: `${clip.hook_text}\n\n${clip.summary}\n\nSave this for later 📌`,
    ig_hashtags: ['#shorts', '#reels', '#viral'],
    thumbnail_timestamp: 1.5,
    best_time_to_post: '6:00 PM - 9:00 PM',
  });

  // UI feedback states
  const [activeTab, setActiveTab] = useState<'subtitles' | 'style' | 'trim' | 'seo'>('subtitles');
  const [isRendering, setIsRendering] = useState(false);
  const [renderedMp4, setRenderedMp4] = useState<string | null>(clip.rendered_video_path || null);
  const [isRegeneratingSEO, setIsRegeneratingSEO] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const actualStart = Math.max(0, clip.start_time + trimStart);
  const actualEnd = Math.max(actualStart + 1, clip.end_time + trimEnd);
  const clipDuration = actualEnd - actualStart;

  // Load presets
  useEffect(() => {
    getPresets().then((list) => {
      setPresets(list);
      const match = list.find((p) => p.id === activePresetId);
      if (match) {
        setCustomStyle(match);
      }
    });
  }, [activePresetId]);

  // Sync video time to current clip relative time
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    // Loop video within clip interval
    if (t >= actualEnd) {
      videoRef.current.currentTime = actualStart;
      setCurrentTime(0);
    } else {
      setCurrentTime(Math.max(0, t - actualStart));
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime < actualStart || videoRef.current.currentTime >= actualEnd) {
        videoRef.current.currentTime = actualStart;
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (newRelativeTime: number) => {
    if (!videoRef.current) return;
    const target = actualStart + newRelativeTime;
    videoRef.current.currentTime = target;
    setCurrentTime(newRelativeTime);
  };

  // Auto-save changes to backend
  const handleAutoSave = async () => {
    try {
      await updateClip(clip.id, {
        trim_start_offset: trimStart,
        trim_end_offset: trimEnd,
        hook_text: hookText,
        words: words,
        subtitle_preset_id: activePresetId,
        subtitle_settings: customStyle,
        enable_hook_overlay: enableHookOverlay,
        enable_silence_removal: enableSilenceRemoval,
        enable_loudnorm: enableLoudnorm,
        framing_mode: framingMode,
        seo_metadata: seo,
      });
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
      onRefreshJob();
    } catch (e) {
      console.error('Auto save error:', e);
    }
  };

  // Subtitle word text inline change
  const handleWordTextChange = (index: number, newText: string) => {
    const updated = [...words];
    updated[index].word = newText;
    setWords(updated);
  };

  // Preset Selection
  const selectPreset = (preset: SubtitlePreset) => {
    setActivePresetId(preset.id);
    setCustomStyle(preset);
  };

  // Apply to all clips
  const handleApplyToAll = async () => {
    try {
      await applyPresetToAll(clip.job_id, activePresetId);
      setSaveStatus('Applied to all clips!');
      setTimeout(() => setSaveStatus(null), 2500);
      onRefreshJob();
    } catch {}
  };

  // Render MP4 Preview
  const handleRenderPreview = async () => {
    try {
      setIsRendering(true);
      await handleAutoSave();
      const res = await renderClipPreview(clip.id);
      setRenderedMp4(res.rendered_video_path);
      setSaveStatus('Preview MP4 Rendered!');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (e: any) {
      alert(e.message || 'Render failed');
    } finally {
      setIsRendering(false);
    }
  };

  // Regenerate SEO
  const handleRegenerateSEO = async () => {
    try {
      setIsRegeneratingSEO(true);
      const res = await regenerateClipSEO(clip.id);
      setSeo(res.seo_metadata);
      setSaveStatus('SEO Regenerated!');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e: any) {
      alert(e.message || 'SEO regeneration failed');
    } finally {
      setIsRegeneratingSEO(false);
    }
  };

  // One-click copy
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Filter words belonging to this clip
  const clipWords = words.filter((w) => w.end >= actualStart && w.start <= actualEnd);

  // Group active words for subtitle overlay
  // Find which word is currently spoken (relative to clip start)
  const activeWordIndex = clipWords.findIndex(
    (w) => currentTime >= (w.start - actualStart) && currentTime <= (w.end - actualStart)
  );

  // Compute a 3-word window around the active word
  const activeWindowStart = Math.max(0, Math.floor(activeWordIndex / 3) * 3);
  const currentDisplayWords = activeWordIndex !== -1
    ? clipWords.slice(activeWindowStart, activeWindowStart + 3)
    : [];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-xs font-semibold"
          >
            ← Back to Clips
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Clip #{clip.clip_index}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {clipDuration.toFixed(1)}s (from {actualStart.toFixed(1)}s to {actualEnd.toFixed(1)}s)
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-lg mt-0.5">
              "{hookText}"
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveStatus && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{saveStatus}</span>
            </span>
          )}

          <button
            onClick={handleAutoSave}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Changes</span>
          </button>

          <button
            onClick={handleRenderPreview}
            disabled={isRendering}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-md shadow-emerald-500/20 cursor-pointer"
          >
            <Film className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
            <span>{isRendering ? 'Rendering 9:16 MP4...' : 'Render MP4 Preview'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 9:16 Video Player with Live Subtitle Overlay (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-[320px] sm:w-[350px] aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative flex flex-col justify-between select-none">
            {/* Raw Video Stream */}
            <video
              ref={videoRef}
              src={`/storage/cache/${videoId}.mp4`}
              className="absolute inset-0 w-full h-full object-cover"
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              playsInline
            />

            {/* Top Hook Overlay Banner (first 3.2s of clip) */}
            {enableHookOverlay && currentTime <= 3.2 && hookText && (
              <div className="relative z-20 mx-4 mt-8 p-3 rounded-xl bg-slate-950/80 border border-emerald-500/40 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-400 block mb-0.5">
                  ★ HOOK
                </span>
                <p className="text-sm font-black text-white leading-tight font-montserrat uppercase drop-shadow">
                  {hookText}
                </p>
              </div>
            )}

            {/* LIVE REAL-TIME SUBTITLE OVERLAY */}
            <div
              className={`relative z-20 px-4 pointer-events-none transition-all duration-150 flex flex-col items-center text-center ${
                customStyle.position === 'top'
                  ? 'mt-16'
                  : customStyle.position === 'middle'
                  ? 'my-auto'
                  : 'mb-16' // Safe zone above Shorts/Reels overlay
              }`}
            >
              {currentDisplayWords.length > 0 && (
                <div
                  className={`inline-block px-4 py-2 rounded-xl text-center leading-snug transition-transform ${
                    customStyle.bg_box ? 'bg-black/85 backdrop-blur-sm' : ''
                  }`}
                  style={{
                    fontFamily:
                      customStyle.font_family === 'Montserrat'
                        ? 'Montserrat, sans-serif'
                        : customStyle.font_family === 'Noto Sans Devanagari'
                        ? 'Noto Sans Devanagari, sans-serif'
                        : customStyle.font_family,
                    fontWeight: customStyle.font_weight === 'black' ? 900 : 700,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    {currentDisplayWords.map((w, idx) => {
                      const isActive =
                        currentTime >= (w.start - actualStart) &&
                        currentTime <= (w.end - actualStart);

                      const displayWord = customStyle.uppercase ? w.word.toUpperCase() : w.word;

                      return (
                        <span
                          key={idx}
                          className={`inline-block transition-all duration-75 text-2xl sm:text-3xl tracking-tight ${
                            isActive
                              ? customStyle.animation_style === 'bounce'
                                ? 'animate-sub-bounce scale-110'
                                : 'animate-sub-pop scale-110'
                              : 'scale-100 opacity-95'
                          }`}
                          style={{
                            color: isActive ? customStyle.highlight_color : customStyle.primary_color,
                            WebkitTextStroke: `${customStyle.stroke_width}px ${customStyle.stroke_color}`,
                            filter: `drop-shadow(0 ${customStyle.shadow_offset}px 0 rgba(0,0,0,0.9))`,
                          }}
                        >
                          {displayWord}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Safe Zone Indicator Guidelines (Subtle) */}
            <div className="absolute bottom-0 inset-x-0 h-16 pointer-events-none border-t border-dashed border-red-500/20 flex items-center justify-center">
              <span className="text-[9px] font-mono text-red-400/40 uppercase">Platform Safe Zone Margin</span>
            </div>
          </div>

          {/* Video Scrubbing & Play Controls */}
          <div className="w-[320px] sm:w-[350px] mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span>{currentTime.toFixed(1)}s</span>
              <span>{clipDuration.toFixed(1)}s</span>
            </div>

            <input
              type="range"
              min={0}
              max={clipDuration}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-950 rounded cursor-pointer mb-3"
            />

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handleSeek(0)}
                className="p-2 text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800"
                title="Restart Clip"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg transition"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
              </button>
            </div>
          </div>

          {renderedMp4 && (
            <div className="mt-3 text-center">
              <a
                href={renderedMp4}
                download
                className="text-xs text-emerald-400 hover:underline flex items-center gap-1 justify-center"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Download / View Rendered MP4</span>
              </a>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Controls (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 pb-3 mb-6 gap-2 text-xs font-semibold overflow-x-auto">
            <button
              onClick={() => setActiveTab('subtitles')}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                activeTab === 'subtitles'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Edit Words ({clipWords.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('style')}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                activeTab === 'style'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Subtitle Styles</span>
            </button>

            <button
              onClick={() => setActiveTab('trim')}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                activeTab === 'trim'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Scissors className="w-4 h-4" />
              <span>Trim & Video Toggles</span>
            </button>

            <button
              onClick={() => setActiveTab('seo')}
              className={`px-3 py-2 rounded-lg transition flex items-center gap-1.5 shrink-0 ${
                activeTab === 'seo'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>SEO & Social Copy</span>
            </button>
          </div>

          {/* TAB 1: SUBTITLE WORD-BY-WORD EDITOR */}
          {activeTab === 'subtitles' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Hook Title Banner (First 3s)
                </label>
                <input
                  type="text"
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Word-Level Subtitles (Click to edit misspelled words inline)
                </label>
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-2">
                  {clipWords.map((w, index) => {
                    const globalIdx = words.indexOf(w);
                    const isActive =
                      currentTime >= (w.start - actualStart) &&
                      currentTime <= (w.end - actualStart);

                    return (
                      <div
                        key={index}
                        onClick={() => handleSeek(w.start - actualStart)}
                        className={`flex items-center gap-3 p-2 rounded-lg border transition ${
                          isActive
                            ? 'border-emerald-500 bg-emerald-950/30'
                            : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                        }`}
                      >
                        <span className="font-mono text-[10px] text-slate-500 w-16 shrink-0">
                          {(w.start - actualStart).toFixed(2)}s
                        </span>

                        <input
                          type="text"
                          value={w.word}
                          onChange={(e) => handleWordTextChange(globalIdx, e.target.value)}
                          className="bg-transparent border-none text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1 flex-1"
                        />

                        <button
                          type="button"
                          onClick={() => handleSeek(w.start - actualStart)}
                          className="p-1 text-slate-500 hover:text-emerald-400 transition"
                          title="Jump to word"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUBTITLE STYLE CUSTOMIZATION */}
          {activeTab === 'style' && (
            <div className="space-y-6">
              {/* Preset picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Style Presets (6 Available)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectPreset(p)}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        activePresetId === p.id
                          ? 'border-emerald-500 bg-emerald-950/30 text-white ring-1 ring-emerald-500'
                          : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold truncate">{p.name}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: p.highlight_color }}
                        ></span>
                      </div>
                      <span className="text-[10px] text-slate-400 capitalize">
                        {p.animation_style}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom adjustments */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Fine-Tune Style Settings
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Font Family
                    </label>
                    <select
                      value={customStyle.font_family}
                      onChange={(e) => setCustomStyle({ ...customStyle, font_family: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="Montserrat">Montserrat (Modern Viral)</option>
                      <option value="Noto Sans Devanagari">Noto Sans Devanagari (Hindi)</option>
                      <option value="Bebas Neue">Bebas Neue (Punchy Caps)</option>
                      <option value="Arial">Arial (Clean)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Animation Style
                    </label>
                    <select
                      value={customStyle.animation_style}
                      onChange={(e) =>
                        setCustomStyle({
                          ...customStyle,
                          animation_style: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="hormozi">Hormozi Scale & Word Color</option>
                      <option value="bounce">Bouncy Pop</option>
                      <option value="karaoke">Smooth Word Karaoke</option>
                      <option value="pop">Whole Frame Pop</option>
                      <option value="typewriter">Typewriter Reveal</option>
                      <option value="fade">Subtle Fade</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Text Color
                    </label>
                    <input
                      type="color"
                      value={customStyle.primary_color}
                      onChange={(e) => setCustomStyle({ ...customStyle, primary_color: e.target.value })}
                      className="w-full h-8 bg-transparent cursor-pointer rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Active Word Glow
                    </label>
                    <input
                      type="color"
                      value={customStyle.highlight_color}
                      onChange={(e) => setCustomStyle({ ...customStyle, highlight_color: e.target.value })}
                      className="w-full h-8 bg-transparent cursor-pointer rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Outline Stroke
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      value={customStyle.stroke_width}
                      onChange={(e) =>
                        setCustomStyle({ ...customStyle, stroke_width: Number(e.target.value) })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Position
                    </label>
                    <select
                      value={customStyle.position}
                      onChange={(e) =>
                        setCustomStyle({ ...customStyle, position: e.target.value as any })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="bottom">Bottom (Safe Zone)</option>
                      <option value="middle">Middle</option>
                      <option value="top">Top</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={customStyle.uppercase}
                      onChange={(e) => setCustomStyle({ ...customStyle, uppercase: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>FORCE UPPERCASE</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={customStyle.bg_box}
                      onChange={(e) => setCustomStyle({ ...customStyle, bg_box: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>Dark Backing Box</span>
                  </label>
                </div>
              </div>

              {/* Batch apply */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const presetName = prompt('Enter preset name:', 'My Custom Preset');
                    if (presetName) {
                      const newP: SubtitlePreset = {
                        ...customStyle,
                        id: `preset_${Date.now()}`,
                        name: presetName,
                        is_builtin: false,
                      };
                      await savePreset(newP);
                      const updated = await getPresets();
                      setPresets(updated);
                      setActivePresetId(newP.id);
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Save as Custom Preset
                </button>

                <button
                  type="button"
                  onClick={handleApplyToAll}
                  className="px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold"
                >
                  Apply this Style to All Clips in Job
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: TRIM & VIDEO TOGGLES */}
          {activeTab === 'trim' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-emerald-400" />
                  <span>Adjust Start / End Boundary</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Start Trim Offset: {trimStart > 0 ? `+${trimStart}s` : `${trimStart}s`}
                    </label>
                    <input
                      type="range"
                      min={-4.0}
                      max={4.0}
                      step={0.25}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      End Trim Offset: {trimEnd > 0 ? `+${trimEnd}s` : `${trimEnd}s`}
                    </label>
                    <input
                      type="range"
                      min={-4.0}
                      max={4.0}
                      step={0.25}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Video Framing & Processing Toggles */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Video Framing & Audio Filters
                </h4>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    9:16 Framing Technique
                  </label>
                  <select
                    value={framingMode}
                    onChange={(e) => setFramingMode(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="auto_face">Intelligent Face Speaker Tracking (OpenCV)</option>
                    <option value="blur_bg">Blurred Background Fill (Best for Slides & Gameplay)</option>
                    <option value="center">Fixed Center Crop</option>
                  </select>
                </div>

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableHookOverlay}
                      onChange={(e) => setEnableHookOverlay(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Burn 3-second Animated Hook Title at start</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableLoudnorm}
                      onChange={(e) => setEnableLoudnorm(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Normalize Audio Loudness (-16 LUFS)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableSilenceRemoval}
                      onChange={(e) => setEnableSilenceRemoval(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Remove Dead Air & Long Pauses</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SEO & SOCIAL COPY */}
          {activeTab === 'seo' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Platform-Tuned Metadata</span>
                </h4>

                <button
                  onClick={handleRegenerateSEO}
                  disabled={isRegeneratingSEO}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingSEO ? 'animate-spin' : ''}`} />
                  <span>Regenerate with AI</span>
                </button>
              </div>

              {/* YouTube Shorts Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                    YouTube Shorts
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${seo.yt_title}\n\n${seo.yt_description}\n\n${seo.yt_hashtags.join(' ')}`,
                        'yt_all'
                      )
                    }
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedType === 'yt_all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'yt_all' ? 'Copied All!' : 'Copy All YT Data'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Title ({seo.yt_title.length}/100 chars)
                  </label>
                  <input
                    type="text"
                    value={seo.yt_title}
                    onChange={(e) => setSeo({ ...seo, yt_title: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Description & CTA
                  </label>
                  <textarea
                    rows={3}
                    value={seo.yt_description}
                    onChange={(e) => setSeo({ ...seo, yt_description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Hashtags
                  </label>
                  <input
                    type="text"
                    value={seo.yt_hashtags.join(' ')}
                    onChange={(e) => setSeo({ ...seo, yt_hashtags: e.target.value.split(' ') })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-mono"
                  />
                </div>
              </div>

              {/* Instagram Reels Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-pink-400 uppercase tracking-wider">
                    Instagram Reels
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${seo.ig_caption}\n\n${seo.ig_hashtags.join(' ')}`,
                        'ig_all'
                      )
                    }
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedType === 'ig_all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'ig_all' ? 'Copied Caption!' : 'Copy Reels Caption'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Caption (Hook + Value + CTA)
                  </label>
                  <textarea
                    rows={4}
                    value={seo.ig_caption}
                    onChange={(e) => setSeo({ ...seo, ig_caption: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Reels Hashtags
                  </label>
                  <input
                    type="text"
                    value={seo.ig_hashtags.join(' ')}
                    onChange={(e) => setSeo({ ...seo, ig_hashtags: e.target.value.split(' ') })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-pink-400 font-mono"
                  />
                </div>
              </div>

              {/* Hints */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Best Time To Post: {seo.best_time_to_post}</span>
                <span>Thumbnail Frame: {seo.thumbnail_timestamp.toFixed(1)}s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
