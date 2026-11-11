import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AnimatedNumberStepper from '../../components/AnimatedNumberStepper';
import { Toggle } from '../../components/LobbyCard';
import PassAroundReveal from '../PassAroundReveal';
import { loadPassPlayPlayers, toGamePlayers } from '../passPlay';
import { dealSpyfall, maxSpiesFor, SPYFALL_MIN_PLAYERS } from '../../games/spyfall/logic';
import { useCountdown } from '../../lib/activity';
import { pickRandom } from '../../lib/random';
import LOCATIONS from '../../spyfall/locations';

const mono = { fontFamily: "'Courier Prime', monospace" };

export default function OnePhoneSpyfall() {
  const navigate = useNavigate();
  const players = useMemo(() => toGamePlayers(loadPassPlayPlayers()), []);
  const [rules, setRules] = useState({ spyCount: 1, showRoles: true, discussionTime: 8 });
  const [game, setGame] = useState(null);
  const [stage, setStage] = useState('setup'); // setup | reveal | question | answer
  const [endsAt, setEndsAt] = useState(null);
  const [crossed, setCrossed] = useState(() => new Set());
  const [confirmReveal, setConfirmReveal] = useState(false);
  const secondsLeft = useCountdown(stage === 'question' ? endsAt : null);

  if (players.length === 0) return <Navigate to="/one-phone" replace />;

  const max = maxSpiesFor(players.length);
  const enough = players.length >= SPYFALL_MIN_PLAYERS;
  const nameOf = (uid) => players.find((p) => p.uid === uid)?.displayName || 'Someone';

  const deal = () => {
    const dealt = dealSpyfall(players, { ...rules, spyCount: Math.min(rules.spyCount, max) }, null);
    setGame({ ...dealt, firstAsker: pickRandom(players)?.uid });
    setCrossed(new Set());
    setConfirmReveal(false);
    setStage('reveal');
  };

  const shell = (children) => (
    <div className="spyfall-game min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => (stage === 'setup' ? navigate('/one-phone/games') : setStage('setup'))}
            aria-label="Back"
            className="w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white flex items-center justify-center"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white text-lg font-black uppercase tracking-tight">Spyfall</h1>
          <div className="w-11" />
        </div>
        {children}
      </div>
    </div>
  );

  if (stage === 'setup' || !game) {
    return shell(
      <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-6 space-y-5">
        <p className="text-slate-300 text-sm">
          Everyone learns the secret location except the spy. Ask each other questions to find the spy, while the spy tries to work out where you are.
        </p>
        <div>
          <p className="text-white font-semibold mb-2 text-sm text-center">Number of Spies</p>
          <AnimatedNumberStepper value={Math.min(rules.spyCount, max)} min={1} max={max} valueWidthClass="w-16" onChange={(v) => setRules({ ...rules, spyCount: v })} />
        </div>
        <div>
          <p className="text-white font-semibold mb-2 text-sm text-center">Round Time</p>
          <AnimatedNumberStepper value={rules.discussionTime} min={1} max={15} valueWidthClass="w-28" formatValue={(v) => `${v} min`} onChange={(v) => setRules({ ...rules, discussionTime: v })} />
        </div>
        <Toggle label="Show Roles" description="Non-spies also get a role at the location" checked={rules.showRoles} onChange={(v) => setRules({ ...rules, showRoles: v })} onClass="bg-indigo-600" />
        <button
          type="button"
          disabled={!enough}
          onClick={deal}
          className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold"
        >
          {enough ? `Deal cards (${players.length} players)` : `Need ${SPYFALL_MIN_PLAYERS}+ players`}
        </button>
      </div>
    );
  }

  if (stage === 'reveal') {
    return shell(
      <PassAroundReveal
        players={game.players}
        title="Boarding passes"
        accent="bg-indigo-600 hover:bg-indigo-500"
        onDone={() => {
          setEndsAt(Date.now() + game.rules.discussionTime * 60 * 1000);
          setStage('question');
        }}
        renderSecret={(player) => {
          const isSpy = game.spyIds.includes(player.uid);
          return (
            <div className="rounded-2xl overflow-hidden border border-[#c9882a]/40 bg-[#ece9e1] text-left">
              <div className="bg-[#c9882a] px-5 py-2 flex justify-between text-white text-xs font-bold tracking-widest" style={mono}>
                <span>BOARDING PASS</span><span>✈︎</span>
              </div>
              <div className="px-5 py-6 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#7a8c9e]" style={mono}>Destination</p>
                  <p className={`text-3xl font-black ${isSpy ? 'text-[#cc3333]' : 'text-[#2c1810]'}`} style={mono}>
                    {isSpy ? 'UNKNOWN' : game.location}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#7a8c9e]" style={mono}>Role</p>
                  <p className="text-xl font-bold text-[#2c1810]" style={mono}>{isSpy ? 'SPY' : (player.role || 'Passenger')}</p>
                </div>
                {isSpy && <p className="text-sm text-[#5a4837]">Work out the location without giving yourself away.</p>}
              </div>
            </div>
          );
        }}
      />
    );
  }

  if (stage === 'question') {
    const mins = Math.floor((secondsLeft ?? 0) / 60);
    const secs = String((secondsLeft ?? 0) % 60).padStart(2, '0');
    return shell(
      <div className="space-y-4">
        <div className="bg-[#111] border border-[#2e3f52] rounded-xl p-4 flex items-center justify-between">
          <span className="text-[#e8e0c8] font-bold tracking-widest text-sm" style={mono}>TIME</span>
          <span className={`text-3xl font-bold ${secondsLeft === 0 ? 'text-red-400 animate-pulse' : 'text-[#f5c842]'}`} style={mono}>{mins}:{secs}</span>
        </div>
        <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-xl p-4 text-center">
          <p className="text-[#7a8c9e] text-xs uppercase tracking-widest" style={mono}>First to ask a question</p>
          <p className="text-white text-2xl font-bold mt-1">{nameOf(game.firstAsker)}</p>
          {secondsLeft === 0 && <p className="text-red-300 text-sm mt-2">Time&apos;s up! Vote by pointing on three.</p>}
        </div>
        <div>
          <p className="text-[#7a8c9e] text-xs uppercase tracking-widest mb-2" style={mono}>All locations (tap to cross out)</p>
          <div className="grid grid-cols-2 gap-1.5">
            {LOCATIONS.map(({ name }) => (
              <button
                key={name}
                type="button"
                onClick={() => setCrossed((prev) => {
                  const next = new Set(prev);
                  if (next.has(name)) next.delete(name); else next.add(name);
                  return next;
                })}
                className={`rounded-lg px-3 py-2 text-sm bg-[#1e2a3a] border border-[#2e3f52] text-[#d4c9a8] ${crossed.has(name) ? 'line-through opacity-40' : ''}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {!confirmReveal ? (
          <button type="button" onClick={() => setConfirmReveal(true)} className="w-full py-4 rounded-xl bg-slate-200 hover:bg-white text-slate-900 font-bold">
            Reveal the spy and location
          </button>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirmReveal(false)} className="flex-1 py-4 rounded-xl bg-slate-700 text-slate-200 font-bold">Not yet</button>
            <button type="button" onClick={() => setStage('answer')} className="flex-1 py-4 rounded-xl bg-red-700 hover:bg-red-600 text-white font-bold">Reveal</button>
          </div>
        )}
      </div>
    );
  }

  return shell(
    <div className="space-y-4">
      <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-2xl p-6 text-center">
        <p className="text-[#7a8c9e] text-xs uppercase tracking-widest" style={mono}>The spy{game.spyIds.length > 1 ? ' team was' : ' was'}</p>
        <p className="text-3xl font-black text-[#cc3333] mt-1">{game.spyIds.map(nameOf).join(', ')}</p>
        <p className="text-[#7a8c9e] text-xs uppercase tracking-widest mt-5" style={mono}>The location was</p>
        <p className="text-3xl font-black text-[#c9882a] mt-1">{game.location}</p>
      </div>
      <button type="button" onClick={deal} className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold">Play again</button>
      <button type="button" onClick={() => navigate('/one-phone')} className="w-full py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold">Back to Pass &amp; Play</button>
    </div>
  );
}
