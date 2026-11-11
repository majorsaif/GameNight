import React, { useState } from 'react';
import { getInitials } from '../utils/avatar';

/**
 * Hands the phone to each player in turn so they can privately see their
 * secret. Calls onDone once everyone has looked.
 */
export default function PassAroundReveal({ players, renderSecret, onDone, accent = 'bg-violet-600 hover:bg-violet-500', title = 'Secret cards' }) {
  const [seen, setSeen] = useState([]);
  const [current, setCurrent] = useState(null);
  const [step, setStep] = useState('list'); // list | handover | secret

  const currentPlayer = players.find((p) => p.uid === current) || null;
  const allSeen = players.length > 0 && players.every((p) => seen.includes(p.uid));

  if (step === 'handover' && currentPlayer) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-6">
        <div className="text-6xl" aria-hidden="true">📱</div>
        <h2 className="text-3xl font-black text-white">Pass the phone to<br />{currentPlayer.displayName}</h2>
        <p className="text-slate-400">Make sure nobody else can see the screen.</p>
        <button
          type="button"
          onClick={() => setStep('secret')}
          className={`w-full max-w-xs py-4 rounded-xl text-white font-bold ${accent}`}
        >
          I&apos;m {currentPlayer.displayName}, show me
        </button>
        <button type="button" onClick={() => { setCurrent(null); setStep('list'); }} className="text-slate-500 text-sm underline">
          Back
        </button>
      </div>
    );
  }

  if (step === 'secret' && currentPlayer) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-6">
        <div className="w-full max-w-sm">{renderSecret(currentPlayer)}</div>
        <button
          type="button"
          onClick={() => {
            setSeen((list) => (list.includes(currentPlayer.uid) ? list : [...list, currentPlayer.uid]));
            setCurrent(null);
            setStep('list');
          }}
          className="w-full max-w-xs py-4 rounded-xl bg-slate-200 hover:bg-white text-slate-900 font-bold"
        >
          Got it - hide and pass back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <p className="text-slate-400 text-sm mt-1">Tap your name, then look at the screen on your own.</p>
      </div>
      <div className="space-y-2">
        {players.map((player) => {
          const done = seen.includes(player.uid);
          return (
            <button
              key={player.uid}
              type="button"
              disabled={done}
              onClick={() => {
                setCurrent(player.uid);
                setStep('handover');
              }}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left ${done ? 'bg-slate-900/30 border-slate-800 opacity-60' : 'bg-slate-900/60 border-slate-700 hover:bg-slate-800'}`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className={`w-10 h-10 rounded-full ${player.avatarColor || 'bg-slate-600'} flex items-center justify-center text-white text-sm font-bold`}>
                  {getInitials(player.displayName)}
                </span>
                <span className="text-slate-200 font-medium truncate">{player.displayName}</span>
              </span>
              <span className={`text-xs font-bold uppercase tracking-wider ${done ? 'text-emerald-400' : 'text-slate-400'}`}>
                {done ? 'Seen ✓' : 'Tap to see'}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!allSeen}
        onClick={onDone}
        className={`w-full py-4 rounded-xl text-white font-bold disabled:bg-slate-700 disabled:text-slate-400 ${accent}`}
      >
        {allSeen ? 'Everyone has seen theirs - start' : `Waiting for ${players.length - seen.length} more`}
      </button>
    </div>
  );
}
