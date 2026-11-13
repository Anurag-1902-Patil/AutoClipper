import React, { useState, useEffect } from 'react';
import { Sparkles, Youtube, Sliders, Play, Clock, Video, Zap, Volume2, Mic, Film } from 'lucide-react';
import { SubtitlePreset, Job } from '../types';
import { getPresets, getJobs } from '../services/api';

interface HomeViewProps {
  onStartJob: (params: {
    youtube_url: string;
    llm_provider: string;
    min_clip_duration: number;
    max_clip_duration: number;
    num_clips_target: number;
    default_preset_id: string;
    enable_face_tracking: boolean;
    enable_loudnorm: boolean;
    enable_silence_removal: boolean;
    enable_hook_overlay: boolean;
  }) => void;
  onSelectExistingJob: (job: Job) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onStartJob, onSelectExistingJob }) => {
  const [url, setUrl] = useState('');
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [minDuration, setMinDuration] = useState(20);
  const [maxDuration, setMaxDuration] = useState(45);
  const [numClips, setNumClips] = useState(6);
  const [presetId, setPresetId] = useState('hormozi');
  const [enableFaceTracking, setEnableFaceTracking] = useState(true);
  const [enableLoudnorm, setEnableLoudnorm] = useState(true);
  const [enableSilenceRemoval, setEnableSilenceRemoval] = useState(false);
  const [enableHookOverlay, setEnableHookOverlay] = useState(true);

  const [presets, setPresets] = useState<SubtitlePreset[]>([]);
  const [pastJobs, setPastJobs] = useState<Job[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPresets().then(setPresets).catch(() => {});
    getJobs().then(setPastJobs).catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!url.trim()) {
      setError('Please paste a valid YouTube URL or Video ID');
      return;
    }
    onStartJob({
      youtube_url: url.trim(),
      llm_provider: llmProvider,
      min_clip_duration: minDuration,
      max_clip_duration: maxDuration,
      num_clips_target: numClips,
      default_preset_id: presetId,
      enable_face_tracking: enableFaceTracking,
      enable_loudnorm: enableLoudnorm,
      enable_silence_removal: enableSilenceRemoval,
      enable_hook_overlay: enableHookOverlay,
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI-Powered Viral Shorts Machine</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          Turn Any Long YouTube Video Into <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
            Ready-To-Post 9:16 Viral Clips
          </span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Frame-accurate cutting, speaker face tracking, Hormozi-style animated subtitles, 
          and platform-tuned SEO for YouTube Shorts & Instagram Reels.
        </p>
      </div>

      {/* Main Ingest Form Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              YouTube Video Link or ID
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-4 text-rose-500">
                <Youtube className="w-6 h-6" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-13 pr-28 py-4 text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition shadow-inner font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setUrl(text);
                  } catch {}
                }}
                className="absolute right-3 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              >
                Paste
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-400 font-medium">{error}</p>}
          </div>

          {/* Quick preset selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
              Default Animated Subtitle Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {presets.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    presetId === p.id
                      ? 'border-emerald-500 bg-emerald-950/30 text-white ring-1 ring-emerald-500'
                      : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700'
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
                    {p.animation_style} • {p.font_family}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 font-medium transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showSettings ? 'Hide Pipeline Settings' : 'Tune Pipeline Settings (LLM, Duration, Framing)'}</span>
            </button>

            {showSettings && (
              <div className="mt-4 p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-5 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      LLM Provider
                    </label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="gemini">Google Gemini (Default)</option>
                      <option value="openai">OpenAI GPT-4o-mini</option>
                      <option value="anthropic">Anthropic Claude 3.5 Haiku</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Clip Target Count: <span className="text-emerald-400 font-bold">{numClips}</span>
                    </label>
                    <input
                      type="range"
                      min={3}
                      max={12}
                      value={numClips}
                      onChange={(e) => setNumClips(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Target Length: <span className="text-emerald-400 font-bold">{minDuration}s - {maxDuration}s</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={15}
                        max={45}
                        value={minDuration}
                        onChange={(e) => setMinDuration(Number(e.target.value))}
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                      />
                      <input
                        type="number"
                        min={30}
                        max={90}
                        value={maxDuration}
                        onChange={(e) => setMaxDuration(Number(e.target.value))}
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableFaceTracking}
                      onChange={(e) => setEnableFaceTracking(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Face Speaker Tracking</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableHookOverlay}
                      onChange={(e) => setEnableHookOverlay(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>3s Animated Hook Title</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableLoudnorm}
                      onChange={(e) => setEnableLoudnorm(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Audio Loudnorm</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableSilenceRemoval}
                      onChange={(e) => setEnableSilenceRemoval(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Remove Dead Pauses</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Action button */}
          <button
            type="submit"
            className="w-full py-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 hover:brightness-110 shadow-lg shadow-emerald-500/25 transition transform active:scale-[0.99] flex items-center justify-center gap-2 text-base cursor-pointer"
          >
            <Sparkles className="w-5 h-5 fill-slate-950" />
            <span>Generate Viral Clips Now</span>
          </button>
        </form>
      </div>

      {/* Past Jobs List */}
      {pastJobs.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Previous Video Projects ({pastJobs.length})</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {pastJobs.map((j) => (
              <div
                key={j.id}
                onClick={() => onSelectExistingJob(j)}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition cursor-pointer flex items-center gap-3.5 group"
              >
                {j.thumbnail_url ? (
                  <img
                    src={j.thumbnail_url}
                    alt={j.title}
                    className="w-16 h-12 object-cover rounded-lg shrink-0 border border-slate-800"
                  />
                ) : (
                  <div className="w-16 h-12 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                    <Video className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold text-white truncate group-hover:text-emerald-400 transition">
                    {j.title || `Video ${j.video_id}`}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className="capitalize">{j.channel || 'YouTube'}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium capitalize">{j.status}</span>
                    {j.duration && (
                      <>
                        <span>•</span>
                        <span>{Math.round(j.duration / 60)} min</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
