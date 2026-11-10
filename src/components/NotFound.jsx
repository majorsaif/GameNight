import React from 'react';
import { Link } from 'react-router-dom';
import GameNightLogo from './GameNightLogo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center text-center gap-6 px-6">
      <GameNightLogo size="hero" />
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="text-slate-400">That link doesn&apos;t go anywhere. Host a new room or join one with a code.</p>
      <Link to="/" className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl">
        Go home
      </Link>
    </div>
  );
}
