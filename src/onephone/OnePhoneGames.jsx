import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameNightLogo from '../components/GameNightLogo';
import mafiaButtonImage from '../assets/mafia-button.png';
import wordImposterButtonImage from '../assets/word-imposter-button.png';
import spyfallButtonImage from '../assets/spyfall-button.png';

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

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 overflow-y-auto">
        <div className="text-center pt-2 pb-4">
          <h1 className="text-5xl font-black leading-tight mb-2">
            <span className="text-slate-400 italic text-2xl block">SOCIAL</span>
            <span className="text-violet-400 italic">DEDUCTION</span>
          </h1>
          <p className="text-slate-400 text-sm">Choose a game to continue.</p>
        </div>

        <button
          type="button"
          aria-label="Mafia"
          onClick={() => {}}
          style={{
            backgroundImage: `url(${mafiaButtonImage})`,
            backgroundSize: '112%',
            backgroundPosition: 'center'
          }}
          className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
        >
          <div className="absolute inset-0 bg-black/25" />
        </button>

        <button
          type="button"
          aria-label="Word Imposter"
          onClick={() => {}}
          style={{
            backgroundImage: `url(${wordImposterButtonImage})`,
            backgroundSize: '112%',
            backgroundPosition: 'center'
          }}
          className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
        >
          <div className="absolute inset-0 bg-black/25" />
        </button>

        <button
          type="button"
          aria-label="Spyfall"
          onClick={() => {}}
          style={{
            backgroundImage: `url(${spyfallButtonImage})`,
            backgroundSize: '112%',
            backgroundPosition: 'center'
          }}
          className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
        >
          <div className="absolute inset-0 bg-black/25" />
        </button>
      </main>
    </div>
  );
}