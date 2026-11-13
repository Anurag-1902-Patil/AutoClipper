import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Download, FileText, Cpu, Share2 } from 'lucide-react';
import { Job } from '../types';
import { getJob, resumeJob } from '../services/api';

interface ProcessingViewProps {
  jobId: string;
  onJobReady: (job: Job) => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ jobId, onJobReady }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    // Initial fetch
    getJob(jobId)
      .then((data) => {
        setJob(data);
        if (data.status === 'ready') {
          onJobReady(data);
        }
      })
      .catch((err) => setError(err.message));

    // Connect to Server-Sent Events (SSE)
    const eventSource = new EventSource(`/api/jobs/${jobId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.status) {
          setJob((prev) => (prev ? { ...prev, ...payload } : payload));
        }

        if (payload.status === 'ready' || payload.type === 'completed') {
          eventSource.close();
          getJob(jobId).then(onJobReady);
        }

        if (payload.status === 'failed') {
          setError(payload.error_message || 'Pipeline processing failed.');
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    eventSource.onerror = () => {
      // If SSE disconnects, fall back to polling
      const pollTimer = setInterval(async () => {
        try {
          const fresh = await getJob(jobId);
          setJob(fresh);
          if (fresh.status === 'ready') {
            clearInterval(pollTimer);
            onJobReady(fresh);
          } else if (fresh.status === 'failed') {
            clearInterval(pollTimer);
            setError(fresh.error_message || 'Job failed');
          }
        } catch {}
      }, 3000);

      return () => clearInterval(pollTimer);
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, onJobReady]);

  const handleResume = async () => {
    try {
      setIsResuming(true);
      setError(null);
      await resumeJob(jobId);
    } catch (e: any) {
      setError(e.message || 'Failed to resume');
    } finally {
      setIsResuming(false);
    }
  };

  const steps = [
    { key: 'ingesting', label: '1. Ingest & Download', icon: Download, desc: 'Fetching 1080p stream with yt-dlp' },
    { key: 'transcribing', label: '2. Word-Level Captions', icon: FileText, desc: 'Extracting word timestamps' },
    { key: 'analyzing', label: '3. Viral AI Discovery', icon: Cpu, desc: '2-Pass selection (Discovery + Critic)' },
    { key: 'seo', label: '4. Platform SEO & Framing', icon: Share2, desc: 'Generating Shorts & Reels metadata' },
  ];

  const getStepStatus = (stepKey: string, currentStepKey: string, jobStatus: string) => {
    if (jobStatus === 'ready') return 'completed';
    const order = ['queued', 'ingesting', 'transcribing', 'analyzing', 'seo', 'ready'];
    const currentIdx = order.indexOf(currentStepKey || jobStatus);
    const stepIdx = order.indexOf(stepKey);
    if (currentIdx > stepIdx) return 'completed';
    if (currentIdx === stepIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Header with Title and Thumbnail */}
        {job?.thumbnail_url && (
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-800">
            <img
              src={job.thumbnail_url}
              alt={job.title || 'Video'}
              className="w-20 h-14 object-cover rounded-lg border border-slate-700/80 shadow"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">{job.title || 'Processing Video...'}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{job.channel || 'YouTube Video'} • {job.duration ? `${Math.round(job.duration / 60)} min` : ''}</p>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3.5">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white">AI Processing Video...</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {job?.current_step || 'Initializing transcription and analysis models...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
            <span>Overall Progress</span>
            <span className="text-emerald-400 font-bold">{job?.progress_pct || 10}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, job?.progress_pct || 10)}%` }}
            ></div>
          </div>
        </div>

        {/* Stepper */}
        <div className="space-y-3.5">
          {steps.map((s) => {
            const status = getStepStatus(s.key, job?.status || 'queued', job?.status || 'queued');
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                  status === 'active'
                    ? 'border-emerald-500/50 bg-emerald-950/20'
                    : status === 'completed'
                    ? 'border-slate-800 bg-slate-950/40 text-slate-300'
                    : 'border-slate-800/50 bg-slate-950/20 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      status === 'active'
                        ? 'bg-emerald-500 text-slate-950'
                        : status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800 text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">{s.label}</h4>
                    <p className="text-[11px] text-slate-400">{s.desc}</p>
                  </div>
                </div>

                <div>
                  {status === 'active' && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
                  {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Card */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-200">Processing Interrupted</p>
                <p className="mt-1 text-slate-300 leading-relaxed font-mono text-[11px]">{error}</p>
                <button
                  onClick={handleResume}
                  disabled={isResuming}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1.5 transition text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResuming ? 'animate-spin' : ''}`} />
                  <span>Resume from Last Step</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
