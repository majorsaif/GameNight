import React from 'react';

export default function GameNightLogo({ size = 'compact', className = '' }) {
  const isHero = size === 'hero';
  const wrapperClasses = isHero
    ? 'inline-flex items-center justify-center'
    : 'inline-flex items-center';
  const paddingLeftClasses = isHero ? 'pl-7 sm:pl-9' : 'pl-3 sm:pl-4';
  const itsClasses = isHero
    ? 'text-2xl sm:text-3xl'
    : 'text-[10px] sm:text-[11px]';
  const wordClasses = isHero
    ? 'text-5xl sm:text-6xl'
    : 'text-xl sm:text-2xl';

  return (
    <div className={`${wrapperClasses} ${className}`.trim()}>
      <div className={`relative flex items-center ${paddingLeftClasses}`}>
        <span className={`absolute left-0 bottom-0 rotate-[-78deg] origin-bottom-left whitespace-nowrap leading-none font-black italic tracking-tight text-violet-400 ${itsClasses}`}>
          ITS
        </span>
        <div className={`flex items-baseline leading-none ${wordClasses} font-black tracking-tight`}>
          <span className="text-white italic">GAMES</span>
          <span className="text-violet-400 italic">NIGHT</span>
        </div>
      </div>
    </div>
  );
}
