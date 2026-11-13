import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play, Pause, RotateCcw, Volume2, Sparkles, Sliders, Type, Scissors,
  Share2, Copy, Check, RefreshCw, Film, Save, CheckCircle2, ChevronRight, Eye,
  Wand2, Split, Merge, Trash2, List, AlignLeft, Layers
} from 'lucide-react';
import { Clip, WordItem, SubtitlePreset, SEOMetadata } from '../types';
import {
  updateClip, renderClipPreview, regenerateClipSEO, applyPresetToAll,
  savePreset, getPresets, polishClipSubtitles
} from '../services/api';

interface EditorViewProps {
  clip: Clip;
  videoId: string;
  onBack: () => void;
  onRefreshJob: () => void;
}

interface SubtitlePhrase {
  id: string;
  index: number;
  start: number; // relative to clip start (seconds)
  end: number;   // relative to clip start (seconds, with latch)
  rawStart: number; // absolute seconds in full video
  rawEnd: number;
  text: string;
  words: {
    word: WordItem;
    globalIndex: number;
    clipIndex: number;
    relStart: number;
    relEnd: number;
  }[];
}

const roundTo2 = (num: number) => Math.round(num * 100) / 100;

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
  const [syncOffsetMs, setSyncOffsetMs] = useState<number>(clip.subtitle_settings?.sync_offset_ms || 0);

  // Subtitle styling state
  const [presets, setPresets] = useState<SubtitlePreset[]>([]);
  const [activePresetId, setActivePresetId] = useState(clip.subtitle_preset_id || 'hormozi');
  const [customStyle, setCustomStyle] = useState<SubtitlePreset>({
    id: 'hormozi',
    name: 'Hormozi Viral',
    is_builtin: true,
    font_family: 'Montserrat',
    font_size: 34, // Scaled for live preview canvas
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
  const [subtitleViewMode, setSubtitleViewMode] = useState<'phrases' | 'words'>('phrases');
  const [isRendering, setIsRendering] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
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
        setCustomStyle((prev) => ({
          ...match,
          font_size: prev.font_size || 34,
        }));
      }
    });
  }, [activePresetId]);

  // Sync video time to current clip relative time
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
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
    const target = actualStart + Math.max(0, Math.min(newRelativeTime, clipDuration));
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
        subtitle_settings: {
          ...customStyle,
          sync_offset_ms: syncOffsetMs,
        },
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

  // Filter words belonging to this clip (purge >> or > artifacts)
  const clipWords = useMemo(() => {
    return words
      .filter((w) => w.end >= actualStart && w.start <= actualEnd)
      .filter((w) => !/^(?:>>+|>+|»)\s*$/.test(w.word.trim()))
      .map((w) => ({
        ...w,
        word: w.word.replace(/^(?:>>+|>+|»)\s*/, '').trim(),
      }))
      .filter((w) => w.word.length > 0);
  }, [words, actualStart, actualEnd]);

  // NATURAL PHRASE GROUPING
  // Groups words based on punctuation, pause duration, and words_per_line
  const phrases = useMemo<SubtitlePhrase[]>(() => {
    if (clipWords.length === 0) return [];

    const list: SubtitlePhrase[] = [];
    const wordsPerLine = customStyle.words_per_line || 3;
    let i = 0;
    const total = clipWords.length;

    while (i < total) {
      let count = 1;
      while (count < wordsPerLine && (i + count) < total) {
        const prevW = clipWords[i + count - 1];
        const currW = clipWords[i + count];
        // Terminal punctuation break (. ? ! …)
        if (/[.?!…]$/.test(prevW.word.trim())) break;
        // Natural speech pause between words > 0.35s
        if (currW.start - prevW.end > 0.35) break;
        // Comma breath pause if already >= 2 words
        if (/[,;:]$/.test(prevW.word.trim()) && count >= 2) break;
        count++;
      }

      const phraseWords = clipWords.slice(i, i + count);
      const phraseStart = Math.max(0, phraseWords[0].start - actualStart);
      let phraseEnd = Math.max(phraseStart + 0.1, phraseWords[phraseWords.length - 1].end - actualStart);

      // Latch phrase end so subtitle doesn't blink out during small pauses
      if (i + count < total) {
        const nextStart = Math.max(0, clipWords[i + count].start - actualStart);
        if (nextStart - phraseEnd < 0.45) {
          phraseEnd = nextStart;
        } else {
          phraseEnd = Math.min(phraseEnd + 0.25, nextStart);
        }
      } else {
        phraseEnd = Math.min(clipDuration, phraseEnd + 0.4);
      }

      const phraseItems = phraseWords.map((w, subIdx) => ({
        word: w,
        globalIndex: words.indexOf(w),
        clipIndex: i + subIdx,
        relStart: Math.max(0, w.start - actualStart),
        relEnd: Math.max(0, w.end - actualStart),
      }));

      list.push({
        id: `phrase_${i}`,
        index: list.length,
        start: roundTo2(phraseStart),
        end: roundTo2(phraseEnd),
        rawStart: phraseWords[0].start,
        rawEnd: phraseWords[phraseWords.length - 1].end,
        text: phraseWords.map((w) => w.word).join(' '),
        words: phraseItems,
      });

      i += count;
    }

    return list;
  }, [clipWords, words, actualStart, clipDuration, customStyle.words_per_line]);

  // EFFECTIVE CURRENT TIME WITH SYNC OFFSET
  const effectiveCurrentTime = Math.max(0, currentTime - (syncOffsetMs / 1000.0));

  // ACTIVE PHRASE FOR LIVE SUBTITLE OVERLAY
  const currentActivePhrase = useMemo(() => {
    if (phrases.length === 0) return null;
    // Exact match
    const exact = phrases.find((p) => effectiveCurrentTime >= p.start && effectiveCurrentTime <= p.end);
    if (exact) return exact;

    // Small bridge latching: if video currentTime is within 0.3s after a phrase, keep it visible
    const prev = [...phrases].reverse().find((p) => effectiveCurrentTime >= p.end && effectiveCurrentTime - p.end < 0.35);
    if (prev) return prev;

    return null;
  }, [phrases, effectiveCurrentTime]);

  // ACTIVE WORD WITHIN ACTIVE PHRASE
  const activeWordInPhraseIndex = useMemo(() => {
    if (!currentActivePhrase) return -1;
    const idx = currentActivePhrase.words.findIndex(
      (item) => effectiveCurrentTime >= item.relStart && effectiveCurrentTime <= item.relEnd
    );
    if (idx !== -1) return idx;

    // If before the first word of the phrase, do NOT highlight early
    if (currentActivePhrase.words.length > 0 && effectiveCurrentTime < currentActivePhrase.words[0].relStart) {
      return -1;
    }

    // In a micro gap between words (<0.22s), keep the most recently spoken word active
    const recent = [...currentActivePhrase.words]
      .map((item, i) => ({ i, relStart: item.relStart, relEnd: item.relEnd }))
      .filter((item) => effectiveCurrentTime >= item.relStart)
      .pop();

    if (recent && effectiveCurrentTime - recent.relEnd < 0.22) {
      return recent.i;
    }

    return -1;
  }, [currentActivePhrase, effectiveCurrentTime]);

  // EDIT PHRASE TEXT
  const handlePhraseTextChange = (phrase: SubtitlePhrase, newText: string) => {
    const newTokens = newText.trim().split(/\s+/).filter(Boolean);
    if (newTokens.length === 0) return;

    const globalStartIdx = phrase.words[0].globalIndex;
    const oldWordCount = phrase.words.length;
    const updated = [...words];

    if (newTokens.length === oldWordCount) {
      // 1-to-1 word replacement: preserve exact start/end
      phrase.words.forEach((item, idx) => {
        updated[item.globalIndex] = {
          ...updated[item.globalIndex],
          word: newTokens[idx],
        };
      });
    } else {
      // Word count changed: evenly distribute timestamps across the phrase window
      const pStart = phrase.rawStart;
      const pEnd = phrase.rawEnd;
      const totalDuration = Math.max(0.2, pEnd - pStart);
      const wordDuration = totalDuration / newTokens.length;

      const newWordItems: WordItem[] = newTokens.map((tok, idx) => ({
        word: tok,
        start: roundTo2(pStart + idx * wordDuration),
        end: roundTo2(pStart + (idx + 1) * wordDuration),
        confidence: 1.0,
        is_emphasized: false,
      }));

      updated.splice(globalStartIdx, oldWordCount, ...newWordItems);
    }

    setWords(updated);
  };

  // TOGGLE WORD EMPHASIS
  const handleToggleWordEmphasis = (globalIndex: number) => {
    if (globalIndex < 0 || globalIndex >= words.length) return;
    const updated = [...words];
    updated[globalIndex] = {
      ...updated[globalIndex],
      is_emphasized: !updated[globalIndex].is_emphasized,
    };
    setWords(updated);
  };

  // PLAY PHRASE SNIPPET
  const handlePlayPhrase = (phrase: SubtitlePhrase) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = phrase.rawStart;
    setCurrentTime(phrase.start);
    videoRef.current.play();
    setIsPlaying(true);
  };

  // AI POLISH SUBTITLES (GEMINI)
  const handleAIPolishSubtitles = async () => {
    try {
      setIsPolishing(true);
      setSaveStatus('✨ AI Polishing punctuation & typos with Gemini...');
      const res = await polishClipSubtitles(clip.id, words);
      if (res.words && res.words.length > 0) {
        setWords(res.words);
        setSaveStatus('✨ Subtitles polished and synchronized!');
        setTimeout(() => setSaveStatus(null), 3500);
        onRefreshJob();
      }
    } catch (e: any) {
      alert(e.message || 'AI Subtitle Polish failed');
    } finally {
      setIsPolishing(false);
    }
  };

  // QUICK CLEAN: REMOVE FILLER WORDS
  const handleRemoveFillers = () => {
    const fillerSet = new Set(['um', 'uh', 'er', 'ah', 'like,', 'you know,']);
    const updated = words.filter((w) => !fillerSet.has(w.word.trim().toLowerCase()));
    setWords(updated);
    setSaveStatus('Filler words removed');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  // QUICK FORMAT: CAPITALIZATION
  const handleFormatCapitalization = (mode: 'sentence' | 'upper') => {
    const updated = words.map((w, idx) => {
      let cleaned = w.word;
      if (mode === 'upper') {
        cleaned = cleaned.toUpperCase();
      } else if (mode === 'sentence') {
        const isStart = idx === 0 || /[.?!]$/.test(words[idx - 1].word);
        cleaned = isStart ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : cleaned;
      }
      return { ...w, word: cleaned };
    });
    setWords(updated);
    setSaveStatus(`Formatted ${mode === 'upper' ? 'UPPERCASE' : 'Sentence Case'}`);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  // Preset Selection
  const selectPreset = (preset: SubtitlePreset) => {
    setActivePresetId(preset.id);
    setCustomStyle({
      ...preset,
      font_size: customStyle.font_size || 34,
    });
  };

  // Apply preset to all clips
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

  // Copy to clipboard
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

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
                {clipDuration.toFixed(1)}s ({actualStart.toFixed(1)}s - {actualEnd.toFixed(1)}s)
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

            {/* Gradient shadow scrim at bottom to guarantee high contrast on bright videos */}
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none z-10" />

            {/* Top Hook Overlay Banner (first 3.2s of clip) */}
            {enableHookOverlay && currentTime <= 3.2 && hookText && (
              <div className="relative z-20 mx-4 mt-8 p-3 rounded-xl bg-slate-950/85 border border-emerald-500/40 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-center">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-400 block mb-0.5">
                  ★ HOOK
                </span>
                <p className="text-sm font-black text-white leading-tight font-montserrat uppercase drop-shadow">
                  {hookText}
                </p>
              </div>
            )}

            {/* LIVE ROCK-SOLID SUBTITLE OVERLAY (NO FLICKER) */}
            <div
              className={`absolute inset-x-0 z-20 px-4 pointer-events-none transition-all duration-150 flex flex-col items-center text-center ${
                customStyle.position === 'top'
                  ? 'top-20'
                  : customStyle.position === 'middle'
                  ? 'top-1/2 -translate-y-1/2'
                  : 'bottom-20' // Safe zone above Shorts/Reels captions
              }`}
            >
              {currentActivePhrase && (
                <div
                  className={`inline-block px-4 py-2 rounded-2xl text-center leading-snug transition-transform select-none ${
                    customStyle.bg_box ? 'bg-black/85 backdrop-blur-md shadow-2xl border border-white/10' : ''
                  }`}
                  style={{
                    fontFamily:
                      customStyle.font_family === 'Montserrat'
                        ? "'Montserrat', sans-serif"
                        : customStyle.font_family === 'Noto Sans Devanagari'
                        ? "'Noto Sans Devanagari', sans-serif"
                        : customStyle.font_family,
                    fontWeight: customStyle.font_weight === 'black' ? 900 : 700,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    {currentActivePhrase.words.map((item, idx) => {
                      const isActive = idx === activeWordInPhraseIndex;
                      const isEmphasized = item.word.is_emphasized && customStyle.keyword_emphasis;
                      const displayWord = customStyle.uppercase ? item.word.word.toUpperCase() : item.word.word;

                      const strokeWidth = Math.min(3, Math.max(1.5, (customStyle.stroke_width || 5) * 0.45));
                      const strokeColor = customStyle.stroke_color || '#000000';
                      const primaryColor = customStyle.primary_color || '#FFFFFF';
                      const highlightColor = customStyle.highlight_color || '#FFDF00';

                      return (
                        <span
                          key={idx}
                          className={`inline-block transition-all duration-100 tracking-tight font-black ${
                            isActive
                              ? customStyle.animation_style === 'bounce'
                                ? 'scale-115 -translate-y-0.5'
                                : 'scale-110 -translate-y-0.5'
                              : 'scale-100 opacity-95'
                          }`}
                          style={{
                            fontSize: `${customStyle.font_size || 34}px`,
                            color: isActive
                              ? highlightColor
                              : isEmphasized
                              ? highlightColor
                              : primaryColor,
                            paintOrder: 'stroke fill',
                            WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
                            textShadow: `
                              -2px -2px 0 ${strokeColor},
                               2px -2px 0 ${strokeColor},
                              -2px  2px 0 ${strokeColor},
                               2px  2px 0 ${strokeColor},
                               0px 4px 12px rgba(0,0,0,0.95)
                            `,
                            filter: isActive
                              ? `drop-shadow(0 0 10px ${highlightColor})`
                              : 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
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

            {/* Safe Zone Indicator Margin */}
            <div className="absolute bottom-0 inset-x-0 h-16 pointer-events-none border-t border-dashed border-red-500/20 flex items-center justify-center z-10">
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
                className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg transition cursor-pointer"
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
              <span>Subtitles & Accuracy ({phrases.length} lines)</span>
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

          {/* TAB 1: MODERN PHRASE & ACCURACY SUBTITLE EDITOR */}
          {activeTab === 'subtitles' && (
            <div className="space-y-5">
              {/* Hook text banner */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Hook Title Banner (First 3s on-screen teaser)
                </label>
                <input
                  type="text"
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-bold focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Subtitle Accuracy & AI Polishing Toolbar */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAIPolishSubtitles}
                    disabled={isPolishing}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer disabled:opacity-50"
                    title="Uses Gemini 3.6 Flash to fix punctuation, speech-to-text typos, capitalization, and remove filler words"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isPolishing ? 'animate-spin' : ''}`} />
                    <span>{isPolishing ? 'AI Polishing...' : '✨ AI Polish Subtitles'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveFillers}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                    title="Remove 'um', 'uh', 'er', 'ah'"
                  >
                    Clean Fillers
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatCapitalization('sentence')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                    title="Capitalize sentence starts"
                  >
                    Sentence Case
                  </button>

                  <button
                    type="button"
                    onClick={() => handleFormatCapitalization('upper')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                    title="Force ALL CAPS for viral punch"
                  >
                    ALL CAPS
                  </button>
                </div>

                {/* View toggle */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSubtitleViewMode('phrases')}
                    className={`px-2.5 py-1 rounded font-semibold transition ${
                      subtitleViewMode === 'phrases'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Phrases ({phrases.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubtitleViewMode('words')}
                    className={`px-2.5 py-1 rounded font-semibold transition ${
                      subtitleViewMode === 'words'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Words ({clipWords.length})
                  </button>
                </div>
              </div>

              {/* Subtitle Audio Sync Calibration Slider */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Subtitle Audio Sync Offset</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${syncOffsetMs === 0 ? 'text-slate-400' : 'text-emerald-400'}`}>
                    {syncOffsetMs > 0 ? `+${syncOffsetMs}ms (delay)` : syncOffsetMs < 0 ? `${syncOffsetMs}ms (earlier)` : '0ms (in sync)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSyncOffsetMs((prev) => Math.max(-500, prev - 50))}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700 cursor-pointer"
                    title="Highlight 50ms earlier"
                  >
                    -50ms
                  </button>

                  <input
                    type="range"
                    min={-500}
                    max={500}
                    step={25}
                    value={syncOffsetMs}
                    onChange={(e) => setSyncOffsetMs(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => setSyncOffsetMs((prev) => Math.min(500, prev + 50))}
                    className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700 cursor-pointer"
                    title="Highlight 50ms later"
                  >
                    +50ms
                  </button>

                  {syncOffsetMs !== 0 && (
                    <button
                      type="button"
                      onClick={() => setSyncOffsetMs(0)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-400 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  Nudge earlier if words highlight after speech; nudge later if words highlight before speech.
                </p>
              </div>

              {/* MODE 1: PHRASE CARDS (RECOMMENDED DESCRIPT/CAPCUT STYLE) */}
              {subtitleViewMode === 'phrases' && (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-2">
                  {phrases.map((phrase) => {
                    const isPhraseActive = currentActivePhrase?.id === phrase.id;

                    return (
                      <div
                        key={phrase.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isPhraseActive
                            ? 'border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/40 ring-1 ring-emerald-500/50'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        {/* Phrase Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSeek(phrase.start)}
                              className="font-mono text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/20 transition cursor-pointer"
                              title="Click to seek video"
                            >
                              {phrase.start.toFixed(2)}s - {phrase.end.toFixed(2)}s
                            </button>

                            {isPhraseActive && (
                              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                                Speaking
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePlayPhrase(phrase)}
                              className="p-1 rounded text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition"
                              title="Play this phrase snippet"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Phrase Text Input */}
                        <div className="mb-2">
                          <input
                            type="text"
                            value={phrase.text}
                            onChange={(e) => handlePhraseTextChange(phrase, e.target.value)}
                            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                            placeholder="Type to edit phrase..."
                          />
                        </div>

                        {/* Word Chips with Emphasis Toggle */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-500 font-mono mr-1">Words:</span>
                          {phrase.words.map((item, wIdx) => {
                            const isEmphasized = item.word.is_emphasized;

                            return (
                              <button
                                key={wIdx}
                                type="button"
                                onClick={() => handleToggleWordEmphasis(item.globalIndex)}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition border flex items-center gap-1 ${
                                  isEmphasized
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30'
                                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                                }`}
                                title={`Click to toggle emphasis. Time: ${item.relStart.toFixed(2)}s`}
                              >
                                <span>{item.word.word}</span>
                                {isEmphasized && <span className="text-amber-400 text-[10px]">★</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* MODE 2: DETAILED WORD-BY-WORD TIMELINE */}
              {subtitleViewMode === 'words' && (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-2">
                  {clipWords.map((w, index) => {
                    const globalIdx = words.indexOf(w);
                    const isActive =
                      currentTime >= (w.start - actualStart) &&
                      currentTime <= (w.end - actualStart);

                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded-lg border transition ${
                          isActive
                            ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/40'
                            : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSeek(w.start - actualStart)}
                          className="font-mono text-[10px] text-emerald-400 hover:underline w-16 shrink-0 text-left"
                        >
                          {(w.start - actualStart).toFixed(2)}s
                        </button>

                        <input
                          type="text"
                          value={w.word}
                          onChange={(e) => {
                            const updated = [...words];
                            updated[globalIdx].word = e.target.value;
                            setWords(updated);
                          }}
                          className="bg-transparent border-none text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1 flex-1"
                        />

                        <button
                          type="button"
                          onClick={() => handleToggleWordEmphasis(globalIdx)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition border ${
                            w.is_emphasized
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                          }`}
                        >
                          {w.is_emphasized ? '★ Highlight' : 'Normal'}
                        </button>

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
              )}
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
                  Fine-Tune Style & Typography Settings
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
                      <option value="Montserrat">Montserrat (Viral Short-Form)</option>
                      <option value="Noto Sans Devanagari">Noto Sans Devanagari (Hindi)</option>
                      <option value="Bebas Neue">Bebas Neue (Punchy Caps)</option>
                      <option value="Arial">Arial (Clean Minimal)</option>
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
                      <option value="hormozi">Hormozi (Pop Scale & Active Color)</option>
                      <option value="bounce">Bouncy Pop</option>
                      <option value="karaoke">Smooth Word Karaoke</option>
                      <option value="pop">Whole Frame Pop</option>
                      <option value="typewriter">Typewriter Reveal</option>
                      <option value="fade">Subtle Fade</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Font Size: {customStyle.font_size || 34}px
                    </label>
                    <input
                      type="range"
                      min={22}
                      max={52}
                      step={2}
                      value={customStyle.font_size || 34}
                      onChange={(e) => setCustomStyle({ ...customStyle, font_size: Number(e.target.value) })}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Words Per Line ({customStyle.words_per_line || 3})
                    </label>
                    <select
                      value={customStyle.words_per_line || 3}
                      onChange={(e) =>
                        setCustomStyle({
                          ...customStyle,
                          words_per_line: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value={2}>2 Words (Snappy)</option>
                      <option value={3}>3 Words (Optimal Viral)</option>
                      <option value={4}>4 Words (Descriptive)</option>
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

                <div className="flex flex-wrap items-center gap-6 pt-2">
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

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={customStyle.keyword_emphasis}
                      onChange={(e) => setCustomStyle({ ...customStyle, keyword_emphasis: e.target.checked })}
                      className="rounded accent-emerald-500"
                    />
                    <span>Keyword Highlight Stars</span>
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
                    9:16 Framing & Speaker Focus
                  </label>
                  <select
                    value={framingMode}
                    onChange={(e) => setFramingMode(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="auto_face">AI Smart Framing (Avoids Table Mic)</option>
                    <option value="blur_bg">Blurred Background Fill (Best for 2-Person Podcasts - Shows Both)</option>
                    <option value="focus_left">Focus Left Speaker (Host)</option>
                    <option value="focus_right">Focus Right Speaker (Guest)</option>
                    <option value="center">Fixed Center Crop</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Tip: If a tabletop microphone is in the center between two speakers, select <b>Blurred Background Fill</b> to see both people, or <b>Focus Left/Right</b> to lock onto one speaker!
                  </p>
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
