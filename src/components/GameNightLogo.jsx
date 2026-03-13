import React from 'react';

export default function GameNightLogo({ size = 'compact', className = '' }) {
  const isHero = size === 'hero';
  const wrapperClasses = isHero
    ? 'inline-flex items-center justify-center'
    : 'inline-flex items-center';
  const paddingLeftClasses = isHero ? 'pl-6 sm:pl-8' : 'pl-2 sm:pl-3';
  const itsClasses = isHero
    ? 'text-xl sm:text-2xl'
    : 'text-[9px] sm:text-[10px]';
  const itsPositionClasses = isHero
    ? 'left-2 bottom-1 sm:left-3 sm:bottom-1'
    : 'left-1 bottom-0';
  const wordClasses = isHero
    ? 'text-5xl sm:text-6xl'
    : 'text-xl sm:text-2xl';

  return (
    <div className={`${wrapperClasses} ${className}`.trim()}>
      <div className={`relative flex items-center ${paddingLeftClasses}`}>
        <span className={`absolute ${itsPositionClasses} rotate-[-78deg] origin-bottom-left whitespace-nowrap leading-none font-black italic tracking-tight text-violet-400 ${itsClasses}`}>
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
