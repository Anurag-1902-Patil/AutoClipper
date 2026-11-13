import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { ProcessingView } from './components/ProcessingView';
import { DashboardView } from './components/DashboardView';
import { EditorView } from './components/EditorView';
import { ExportView } from './components/ExportView';
import { Job, Clip } from './types';
import { createJob, getJob, reclipJob } from './services/api';

export function App() {
  const [currentView, setCurrentView] = useState<'home' | 'processing' | 'dashboard' | 'editor' | 'export'>('home');
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [activeClip, setActiveClip] = useState<Clip | null>(null);

  const handleStartJob = async (params: any) => {
    try {
      const res = await createJob(params);
      const jobData = await getJob(res.job_id);
      setCurrentJob(jobData);
      setCurrentView('processing');
    } catch (e: any) {
      alert(e.message || 'Failed to start video processing');
    }
  };

  const handleSelectExistingJob = (job: Job) => {
    setCurrentJob(job);
    if (job.status === 'ready') {
      setCurrentView('dashboard');
    } else {
      setCurrentView('processing');
    }
  };

  const handleJobReady = (job: Job) => {
    setCurrentJob(job);
    setCurrentView('dashboard');
  };

  const handleEditClip = (clip: Clip) => {
    setActiveClip(clip);
    setCurrentView('editor');
  };

  const refreshCurrentJob = async () => {
    if (!currentJob) return;
    try {
      const fresh = await getJob(currentJob.id);
      setCurrentJob(fresh);
      if (activeClip) {
        const matching = fresh.clips?.find((c) => c.id === activeClip.id);
        if (matching) setActiveClip(matching);
      }
    } catch {}
  };

  const handleReclipJob = async () => {
    if (!currentJob) return;
    try {
      await reclipJob(currentJob.id, 20, 45, 6);
      setCurrentView('processing');
    } catch (e: any) {
      alert(e.message || 'Failed to re-mine clips');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      <Navbar
        currentView={currentView}
        onNavigateHome={() => {
          setCurrentView('home');
          setCurrentJob(null);
          setActiveClip(null);
        }}
        onNavigateDashboard={() => setCurrentView('dashboard')}
        activeJobTitle={currentJob?.title}
      />

      <main className="flex-1">
        {currentView === 'home' && (
          <HomeView
            onStartJob={handleStartJob}
            onSelectExistingJob={handleSelectExistingJob}
          />
        )}

        {currentView === 'processing' && currentJob && (
          <ProcessingView
            jobId={currentJob.id}
            onJobReady={handleJobReady}
          />
        )}

        {currentView === 'dashboard' && currentJob && (
          <DashboardView
            job={currentJob}
            onEditClip={handleEditClip}
            onGoToExport={() => setCurrentView('export')}
            onRefreshJob={refreshCurrentJob}
            onReclip={handleReclipJob}
          />
        )}

        {currentView === 'editor' && currentJob && activeClip && (
          <EditorView
            clip={activeClip}
            videoId={currentJob.video_id}
            onBack={() => setCurrentView('dashboard')}
            onRefreshJob={refreshCurrentJob}
          />
        )}

        {currentView === 'export' && currentJob && (
          <ExportView
            job={currentJob}
            onBackToDashboard={() => setCurrentView('dashboard')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
