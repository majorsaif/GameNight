import React from 'react';

export default function GameNightLogo() {
  return (
    <div className="w-[120px] h-[34px] overflow-visible">
      <div className="origin-top-left scale-[0.4]">
        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-0">
            <div className="flex items-center justify-center">
              <span className="text-xl leading-none font-black italic text-violet-400 -rotate-90 origin-center whitespace-nowrap -mr-1">ITS</span>
            </div>
            <h1 className="text-5xl font-black leading-tight mb-2">
              <span className="text-white italic">GAME</span>
              <span className="text-violet-400 italic">NIGHT</span>
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
}
