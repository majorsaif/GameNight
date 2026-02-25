import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function GamesScreen() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleGameClick = () => {
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Sticky Back Button Container */}
      <div className="sticky top-0 z-50 pointer-events-none">
        <div className="w-full max-w-md mx-auto px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-xl"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-0 w-full max-w-md mx-auto px-6 -mt-[68px] pt-4 pb-4">
        <div className="flex items-center justify-center">
          <h1 className="text-white text-xl font-black uppercase tracking-tight">Browse Games</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6">
        
        {/* Search/Filter Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search games..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 pl-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Game Tiles */}
        <div className="flex flex-col gap-4">
          
          {/* Word Imposter */}
          <button 
            onClick={handleGameClick}
            className="group relative overflow-hidden bg-gradient-to-br from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52"
          >
            <div className="relative z-10">
              <div className="w-12 h-12 bg-teal-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-teal-200 rounded"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">WORD<br/>IMPOSTER</h2>
              <p className="text-teal-100 text-sm">Find the imposter who doesn't know the word</p>
            </div>
            <div className="absolute bottom-0 right-0 text-teal-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </div>
          </button>

          {/* Spyfall */}
          <button 
            onClick={handleGameClick}
            className="group relative overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52"
          >
            <div className="relative z-10">
              <div className="w-12 h-12 bg-indigo-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-indigo-200 rounded-full"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">SPYFALL</h2>
              <p className="text-indigo-100 text-sm">One player is the spy — can you find them?</p>
            </div>
            <div className="absolute bottom-0 right-0 text-indigo-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
          </button>

          {/* Mafia */}
          <button 
            onClick={handleGameClick}
            className="group relative overflow-hidden bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52"
          >
            <div className="relative z-10">
              <div className="w-12 h-12 bg-red-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-red-200 rotate-45"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">MAFIA</h2>
              <p className="text-red-100 text-sm">Town vs Mafia — who do you trust?</p>
            </div>
            <div className="absolute bottom-0 right-0 text-red-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="12,2 22,12 12,22 2,12" />
              </svg>
            </div>
          </button>

        </div>
      </main>

      {/* Coming Soon Toast */}
      {showComingSoon && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-6 py-3 shadow-2xl">
            <p className="text-white font-semibold">Coming soon! 🎮</p>
          </div>
        </div>
      )}
    </div>
  );
}
