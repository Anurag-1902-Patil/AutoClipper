import React, { useState } from 'react';
import { Sparkles, Edit3, CheckSquare, Square, Download, Share2, Flame, Play, Clock, Zap, DollarSign, Wand2 } from 'lucide-react';
import { Job, Clip } from '../types';
import { updateClip } from '../services/api';

interface DashboardViewProps {
  job: Job;
  onEditClip: (clip: Clip) => void;
  onGoToExport: () => void;
  onRefreshJob: () => void;
  onReclip?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  job,
  onEditClip,
  onGoToExport,
  onRefreshJob,
  onReclip,
}) => {
  const clips = job.clips || [];
  const selectedClips = clips.filter((c) => Boolean(c.is_selected));

  const handleToggleSelect = async (clip: Clip, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = !Boolean(clip.is_selected);
    await updateClip(clip.id, { is_selected: newSelected });
    onRefreshJob();
  };

  const handleSelectAll = async (select: boolean) => {
    await Promise.all(clips.map((c) => updateClip(c.id, { is_selected: select })));
    onRefreshJob();
  };

  const getViralityColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40';
    if (score >= 80) return 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40';
    return 'text-amber-400 bg-amber-950/60 border-amber-500/40';
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Video Overview Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {job.thumbnail_url && (
            <img
              src={job.thumbnail_url}
              alt={job.title}
              className="w-24 h-16 object-cover rounded-xl border border-slate-700/80 shadow"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Analysis Complete
              </span>
              <span className="text-xs text-slate-400">
                {clips.length} Curated Clips Discovered
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white truncate mt-1">
              {job.title || `Video ${job.video_id}`}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {job.channel} • Total Duration: {Math.round((job.duration || 0) / 60)} min
            </p>
          </div>
        </div>

        {/* Cost & Tokens Pill */}
        <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-slate-800">
          <div className="text-right">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 justify-end">
              <DollarSign className="w-3 h-3 text-emerald-400" />
              <span>Job Cost</span>
            </div>
            <div className="text-sm font-mono font-bold text-white">
              ${(job.estimated_cost_usd || 0.001).toFixed(4)}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {(job.token_usage_input || 0) + (job.token_usage_output || 0)} tokens ({job.llm_provider})
            </div>
          </div>

          {onReclip && (
            <button
              onClick={onReclip}
              className="px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-purple-500 to-indigo-600 hover:brightness-110 text-white flex items-center gap-2 transition shadow-md shadow-indigo-500/20 cursor-pointer"
              title="Re-run viral Q&A & punchy hook discovery on this video (~15s)"
            >
              <Wand2 className="w-4 h-4" />
              <span>Re-Mine with New AI</span>
            </button>
          )}

          <button
            onClick={onGoToExport}
            disabled={selectedClips.length === 0}
            className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-lg ${
              selectedClips.length > 0
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export Selected ({selectedClips.length})</span>
          </button>
        </div>
      </div>

      {/* Grid Controls */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <span>Discovered Clips</span>
          </h2>
          <span className="text-xs text-slate-400">
            (Ranked by viral hook strength)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => handleSelectAll(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Select All
          </button>
          <button
            onClick={() => handleSelectAll(false)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Clips Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clips.map((clip) => {
          const isSelected = Boolean(clip.is_selected);
          return (
            <div
              key={clip.id}
              onClick={() => onEditClip(clip)}
              className={`rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden group shadow-lg ${
                isSelected
                  ? 'bg-slate-900/90 border-slate-700 hover:border-emerald-500/60 ring-1 ring-emerald-500/20'
                  : 'bg-slate-950/60 border-slate-800/80 opacity-70 hover:opacity-100 hover:border-slate-700'
              }`}
            >
              <div className="p-5">
                {/* Top Badges */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleToggleSelect(clip, e)}
                      className="text-slate-400 hover:text-white transition"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-600" />
                      )}
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      Clip #{clip.clip_index}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-full border ${getViralityColor(
                        clip.virality_score
                      )}`}
                    >
                      {clip.virality_score}/100
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      {Math.round(clip.duration)}s
                    </span>
                  </div>
                </div>

                {/* Hook Strategy & Topic */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
                    {clip.hook_strategy.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium truncate">
                    {clip.topic}
                  </span>
                </div>

                {/* Hook text */}
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition leading-snug mb-2 line-clamp-2">
                  "{clip.hook_text}"
                </h3>

                {/* Summary */}
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                  {clip.summary}
                </p>

                {/* Reasoning quote */}
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400 italic">
                  "{clip.reasoning}"
                </div>
              </div>

              {/* Bottom Card Bar */}
              <div className="px-5 py-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[11px]">
                  {Math.floor(clip.start_time / 60)}:{Math.floor(clip.start_time % 60).toString().padStart(2, '0')} -{' '}
                  {Math.floor(clip.end_time / 60)}:{Math.floor(clip.end_time % 60).toString().padStart(2, '0')}
                </span>

                <button
                  onClick={() => onEditClip(clip)}
                  className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-medium transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Clip</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
