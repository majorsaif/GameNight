import React from 'react';

export default function GameNightLogo() {
  return (
    <div className="flex items-center gap-0">
      <div className="flex items-center justify-center">
        <span className="text-xl leading-none font-black italic text-violet-400 -rotate-90 origin-center whitespace-nowrap -mr-1">ITS</span>
      </div>
      <h1 className="text-2xl font-black">
        <span className="text-white italic">GAME</span>
        <span className="text-violet-400 italic">NIGHT</span>
      </h1>
    </div>
  );
}
