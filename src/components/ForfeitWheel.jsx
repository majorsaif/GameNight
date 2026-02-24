import React from 'react';
import { useWheel } from '../hooks/useWheel';

export default function ForfeitWheel({ players = ['Alice', 'Bob', 'Carlos', 'Diana'] }) {
  const { isSpinning, selectedPlayer, rotation, spin, reset } = useWheel(players);

  const segmentAngle = 360 / players.length;
  const colors = [
    'from-violet-600 to-purple-600',
    'from-purple-600 to-fuchsia-600',
    'from-fuchsia-600 to-pink-600',
    'from-pink-600 to-violet-600',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4">
      
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black text-white mb-2">🎡 Forfeit Wheel</h1>
        <p className="text-slate-400">Who will take the forfeit?</p>
      </div>

      {/* Wheel Container */}
      <div className="relative w-full max-w-sm aspect-square mb-8">
        
        {/* Pointer/Arrow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-20">
          <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[30px] border-t-yellow-400 drop-shadow-lg"></div>
        </div>

        {/* Wheel */}
        <div className="relative w-full h-full">
          <div
            className="absolute inset-0 rounded-full shadow-2xl shadow-purple-900/50 overflow-hidden transition-transform duration-[4000ms] ease-out"
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionTimingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
            }}
          >
            {players.map((player, index) => {
              const startAngle = index * segmentAngle;
              const colorIndex = index % colors.length;
              
              return (
                <div
                  key={player}
                  className={`absolute inset-0 bg-gradient-to-br ${colors[colorIndex]}`}
                  style={{
                    transform: `rotate(${startAngle}deg)`,
                    clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin((segmentAngle * Math.PI) / 180)}% ${50 - 50 * Math.cos((segmentAngle * Math.PI) / 180)}%)`
                  }}
                >
                  <div
                    className="absolute top-[20%] left-1/2 -translate-x-1/2 text-white font-bold text-lg whitespace-nowrap"
                    style={{
                      transform: `rotate(${segmentAngle / 2}deg)`
                    }}
                  >
                    {player}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-slate-900 border-4 border-yellow-400 rounded-full shadow-lg z-10"></div>
        </div>
      </div>

      {/* Spin Button */}
      <button
        onClick={spin}
        disabled={isSpinning}
        className={`px-12 py-4 text-xl font-bold rounded-2xl transition-all duration-300 ${
          isSpinning
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-purple-900/50 hover:shadow-xl hover:shadow-purple-800/60 hover:-translate-y-1 active:translate-y-0'
        }`}
      >
        {isSpinning ? '🎡 Spinning...' : '✨ Spin the Wheel'}
      </button>

      {/* Winner Overlay */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-4 border-violet-500 rounded-3xl p-12 max-w-md mx-4 text-center shadow-2xl animate-scale-in">
            <div className="text-7xl mb-6 animate-bounce">🎉</div>
            <h2 className="text-3xl font-black text-white mb-3">
              {selectedPlayer}
            </h2>
            <p className="text-2xl text-violet-400 font-bold mb-8">
              takes the forfeit!
            </p>
            <button
              onClick={reset}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors"
            >
              Spin Again
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
