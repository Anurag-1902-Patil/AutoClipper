import React, { useState, useEffect } from 'react';
import { Download, FolderCheck, CheckCircle2, Copy, Check, FileText, ArrowLeft, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { Job } from '../types';
import { batchExportJob, openExportFolder } from '../services/api';

interface ExportViewProps {
  job: Job;
  onBackToDashboard: () => void;
}

export const ExportView: React.FC<ExportViewProps> = ({ job, onBackToDashboard }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportedData, setExportedData] = useState<{
    export_folder: string;
    folder_name: string;
    clips: Array<{
      clip_index: number;
      filename: string;
      relative_path: string;
      duration: number;
      virality_score: number;
      hook_text: string;
      seo: any;
    }>;
  } | null>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openStatus, setOpenStatus] = useState<string | null>(null);

  const handleStartExport = async () => {
    try {
      setIsExporting(true);
      const res = await batchExportJob(job.id);
      setExportedData(res);
    } catch (e: any) {
      alert(e.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // Automatically kick off batch export on enter
    handleStartExport();
  }, []);

  const handleOpenFolder = async () => {
    try {
      await openExportFolder(job.id);
      setOpenStatus('Opened in File Explorer');
      setTimeout(() => setOpenStatus(null), 3000);
    } catch (e) {
      alert('Could not open folder automatically.');
    }
  };

  const copyClipMetadata = (clip: any, index: number) => {
    const text = `--- YouTube Shorts ---
Title: ${clip.seo?.yt_title || clip.hook_text}
Description: ${clip.seo?.yt_description || ''}
Hashtags: ${(clip.seo?.yt_hashtags || []).join(' ')}

--- Instagram Reels ---
Caption:
${clip.seo?.ig_caption || ''}
${(clip.seo?.ig_hashtags || []).join(' ')}
`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-6 mb-8 border-b border-slate-800">
        <button
          onClick={onBackToDashboard}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Clips</span>
        </button>

        <div className="flex items-center gap-3">
          {exportedData && (
            <button
              onClick={handleOpenFolder}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition"
            >
              <FolderCheck className="w-4 h-4 text-emerald-400" />
              <span>{openStatus || 'Open Output Folder'}</span>
            </button>
          )}

          <button
            onClick={handleStartExport}
            disabled={isExporting}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isExporting ? 'Rendering Clips...' : 'Re-Export All'}</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isExporting && (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white">Rendering Production MP4s...</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Running frame-accurate FFmpeg cuts, dynamic 9:16 vertical crop, burning animated subtitles via libass, and balancing audio loudnorm.
          </p>
        </div>
      )}

      {/* Success View */}
      {exportedData && !isExporting && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Batch Export Complete</span>
              </div>
              <h2 className="text-lg font-bold text-white">
                {exportedData.clips.length} Ready-to-Upload Vertical Clips Generated
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-xl">
                Destination: {exportedData.export_folder}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
                metadata.json & metadata.csv generated
              </span>
            </div>
          </div>

          {/* Exported Clips Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Exported Files</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {exportedData.clips.map((clip, index) => (
                <div
                  key={index}
                  className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-800/40 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Clip #{clip.clip_index}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {clip.duration.toFixed(1)}s • Score: {clip.virality_score}/100
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white truncate">
                      "{clip.hook_text}"
                    </h4>

                    <p className="text-xs font-mono text-slate-500 truncate mt-0.5">
                      {clip.filename}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => copyClipMetadata(clip, index)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
                      title="Copy YouTube and Instagram metadata"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Copy/SEO</span>
                        </>
                      )}
                    </button>

                    <a
                      href={clip.relative_path}
                      download={clip.filename}
                      className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download MP4</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
