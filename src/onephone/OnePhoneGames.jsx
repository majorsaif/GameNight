import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import mafiaButtonImage from '../assets/mafia-button.png';
import wordImposterButtonImage from '../assets/word-imposter-button.png';
import spyfallButtonImage from '../assets/spyfall-button.png';

export default function OnePhoneGames() {
  const location = useLocation();
  const navigate = useNavigate();
  const players = Array.isArray(location.state?.players) ? location.state.players : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="sticky top-0 z-50 pointer-events-none">
        <div className="w-full max-w-md mx-auto px-6 py-4">
          <button
            onClick={() => navigate('/one-phone')}
            className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-xl"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      <header className="relative z-0 w-full max-w-md mx-auto px-6 -mt-[68px] pt-4 pb-4">
        <div className="flex items-center justify-center">
          <h1 className="text-white text-xl font-black uppercase tracking-tight">Social Deduction</h1>
        </div>
      </header>

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6">
        <div className="flex flex-col gap-4">

          <button
            type="button"
            aria-label="Mafia"
            onClick={() => navigate('/one-phone/mafia', { state: { players } })}
            style={{
              backgroundImage: `url(${mafiaButtonImage})`,
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
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
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
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
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>
        </div>
      </main>
    </div>
  );
}