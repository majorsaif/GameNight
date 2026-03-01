import React from 'react';

export default function GameNightLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center text-2xl">
        🎲
      </div>
      <h1 className="text-2xl font-black">
        <span className="text-white italic">GAME</span>
        <span className="text-violet-400 italic">NIGHT</span>
      </h1>
    </div>
  );
}
