import { Job, Clip, SubtitlePreset, SEOMetadata, WordItem } from '../types';

const BASE_URL = '';

export async function createJob(params: {
  youtube_url: string;
  llm_provider?: string;
  min_clip_duration?: number;
  max_clip_duration?: number;
  num_clips_target?: number;
  default_preset_id?: string;
  enable_face_tracking?: boolean;
  enable_loudnorm?: boolean;
  enable_silence_removal?: boolean;
  enable_hook_overlay?: boolean;
}): Promise<{ job_id: string; status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to submit job');
  }
  return res.json();
}

export async function getJobs(): Promise<Job[]> {
  const res = await fetch(`${BASE_URL}/api/jobs`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error('Failed to fetch job details');
  return res.json();
}

export async function resumeJob(jobId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resume job');
  return res.json();
}

export async function reclipJob(
  jobId: string,
  minDuration: number = 20,
  maxDuration: number = 45,
  targetCount: number = 6
): Promise<{ message: string; job_id: string }> {
  const params = new URLSearchParams({
    min_duration: minDuration.toString(),
    max_duration: maxDuration.toString(),
    target_count: targetCount.toString(),
  });
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/reclip?${params.toString()}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to re-clip job');
  return res.json();
}

export async function updateClip(clipId: string, updates: Partial<Clip>): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/clips/${clipId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update clip');
  return res.json();
}

export async function renderClipPreview(clipId: string): Promise<{ message: string; rendered_video_path: string }> {
  const res = await fetch(`${BASE_URL}/api/clips/${clipId}/render-preview`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to render preview');
  }
  return res.json();
}

export async function regenerateClipSEO(clipId: string): Promise<{ message: string; seo_metadata: SEOMetadata }> {
  const res = await fetch(`${BASE_URL}/api/clips/${clipId}/regenerate-seo`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to regenerate SEO metadata');
  return res.json();
}

export async function getPresets(): Promise<SubtitlePreset[]> {
  const res = await fetch(`${BASE_URL}/api/presets`);
  if (!res.ok) throw new Error('Failed to fetch subtitle presets');
  return res.json();
}

export async function savePreset(preset: SubtitlePreset): Promise<SubtitlePreset> {
  const res = await fetch(`${BASE_URL}/api/presets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  });
  if (!res.ok) throw new Error('Failed to save preset');
  return res.json();
}

export async function applyPresetToAll(jobId: string, presetId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/presets/apply-all/${jobId}?preset_id=${encodeURIComponent(presetId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to apply preset to all clips');
  return res.json();
}

export async function batchExportJob(jobId: string): Promise<{
  message: string;
  export_folder: string;
  folder_name: string;
  clips: Array<{
    clip_index: number;
    filename: string;
    relative_path: string;
    duration: number;
    virality_score: number;
    hook_text: string;
    seo: SEOMetadata;
  }>;
}> {
  const res = await fetch(`${BASE_URL}/api/export/${jobId}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to export clips');
  }
  return res.json();
}

export async function openExportFolder(jobId: string): Promise<{ message: string; folder: string }> {
  const res = await fetch(`${BASE_URL}/api/export/${jobId}/open-folder`);
  if (!res.ok) throw new Error('Failed to open export folder');
  return res.json();
}

export async function polishClipSubtitles(
  clipId: string,
  words?: WordItem[]
): Promise<{ message: string; words: WordItem[] }> {
  const res = await fetch(`${BASE_URL}/api/clips/${clipId}/polish-subtitles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to polish subtitles');
  }
  return res.json();
}

