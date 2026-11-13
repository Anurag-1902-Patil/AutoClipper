import React from 'react';
import { Scissors, Sparkles, FolderArchive, ArrowLeft } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigateHome: () => void;
  onNavigateDashboard?: () => void;
  activeJobTitle?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigateHome,
  onNavigateDashboard,
  activeJobTitle,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {currentView !== 'home' && (
            <button
              onClick={currentView === 'editor' && onNavigateDashboard ? onNavigateDashboard : onNavigateHome}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{currentView === 'editor' ? 'Back to Dashboard' : 'New Video'}</span>
            </button>
          )}

          <div
            onClick={onNavigateHome}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition">
              <Scissors className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold tracking-tight text-white text-base">
                <span>Clipper</span>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  AI 9:16
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Long YouTube to Viral Shorts & Reels</p>
            </div>
          </div>
        </div>

        {activeJobTitle && (
          <div className="hidden md:flex items-center gap-2 max-w-md truncate px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate font-medium">{activeJobTitle}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Single-User Local Edition</span>
          </div>
        </div>
      </div>
    </header>
  );
};
