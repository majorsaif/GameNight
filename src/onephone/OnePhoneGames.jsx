import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameNightLogo from '../components/GameNightLogo';

export default function OnePhoneGames() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <header className="relative z-40 w-full max-w-md mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          <GameNightLogo className="translate-y-0.5" />
          <button
            onClick={() => navigate('/one-phone')}
            className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-violet-300 hover:bg-slate-700 transition-colors"
            title="Back to One Phone"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col items-center justify-center text-center gap-5">
        <div className="text-6xl">🎮</div>
        <h1 className="text-4xl font-black text-white">Social Deduction</h1>
        <p className="text-slate-400 max-w-sm">
          The local game library is coming next. For now, this screen is a placeholder for the One Phone flow.
        </p>
        <button
          onClick={() => navigate('/one-phone')}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold transition-colors"
        >
          Back to One Phone
        </button>
      </main>
    </div>
  );
}