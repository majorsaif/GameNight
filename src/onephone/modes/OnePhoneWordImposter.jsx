import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AnimatedNumberStepper from '../../components/AnimatedNumberStepper';
import { Toggle } from '../../components/LobbyCard';
import PassAroundReveal from '../PassAroundReveal';
import { loadPassPlayPlayers, toGamePlayers } from '../passPlay';
import { dealWordImposter, maxImpostersFor, WORD_IMPOSTER_MIN_PLAYERS } from '../../games/wordImposter/logic';
import { pickRandom } from '../../lib/random';

const card = 'rounded-2xl p-6 text-center';
const cardStyle = { backgroundColor: '#1e2a3a', border: '1px solid #2a3a5a' };
const mono = { fontFamily: "'Special Elite', monospace" };

export default function OnePhoneWordImposter() {
  const navigate = useNavigate();
  const players = useMemo(() => toGamePlayers(loadPassPlayPlayers()), []);
  const [rules, setRules] = useState({ imposterCount: 1, showCategory: true, imposterNoWord: false });
  const [game, setGame] = useState(null);
  const [stage, setStage] = useState('setup'); // setup | reveal | describe | answer
  const [confirmReveal, setConfirmReveal] = useState(false);

  if (players.length === 0) return <Navigate to="/one-phone" replace />;

  const max = maxImpostersFor(players.length);
  const enough = players.length >= WORD_IMPOSTER_MIN_PLAYERS;
  const nameOf = (uid) => players.find((p) => p.uid === uid)?.displayName || 'Someone';

  const deal = () => {
    const dealt = dealWordImposter(players, { ...rules, imposterCount: Math.min(rules.imposterCount, max) }, null);
    setGame({ ...dealt, firstPlayer: pickRandom(players)?.uid });
    setStage('reveal');
    setConfirmReveal(false);
  };

  const shell = (children) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
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
          <h1 className="text-white text-lg font-black uppercase tracking-tight">Word Imposter</h1>
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
          Everyone gets the same secret word except the imposter{rules.imposterCount > 1 ? 's' : ''}. Take turns giving one-word clues,
          then argue it out and vote by pointing.
        </p>
        <div>
          <p className="text-white font-semibold mb-2 text-sm text-center">Number of Imposters</p>
          <AnimatedNumberStepper value={Math.min(rules.imposterCount, max)} min={1} max={max} valueWidthClass="w-16" onChange={(v) => setRules({ ...rules, imposterCount: v })} />
        </div>
        <Toggle label="Show Category" description="Everyone sees the word's category as a hint" checked={rules.showCategory} onChange={(v) => setRules({ ...rules, showCategory: v })} onClass="bg-teal-600" />
        <Toggle label="Imposter gets no word" description="Off: imposters get a similar decoy word instead" checked={rules.imposterNoWord} onChange={(v) => setRules({ ...rules, imposterNoWord: v })} onClass="bg-teal-600" />
        <button
          type="button"
          disabled={!enough}
          onClick={deal}
          className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold"
        >
          {enough ? `Deal words (${players.length} players)` : `Need ${WORD_IMPOSTER_MIN_PLAYERS}+ players`}
        </button>
      </div>
    );
  }

  if (stage === 'reveal') {
    return shell(
      <PassAroundReveal
        players={players}
        title="Secret words"
        accent="bg-teal-600 hover:bg-teal-500"
        onDone={() => setStage('describe')}
        renderSecret={(player) => {
          const isImposter = game.imposterIds.includes(player.uid);
          if (isImposter && game.rules.imposterNoWord) {
            return (
              <div className={card} style={cardStyle}>
                <p className="text-xs uppercase tracking-widest mb-3" style={{ ...mono, color: '#8899bb' }}>You are the</p>
                <p className="text-4xl font-black mb-3" style={{ ...mono, color: '#c9384c' }}>IMPOSTER</p>
                {game.rules.showCategory && <p style={{ ...mono, color: '#7a8aaa' }}>Category: {game.category}</p>}
                <p className="text-sm mt-3" style={{ color: '#aab' }}>Blend in and try to work out the word.</p>
              </div>
            );
          }
          const word = isImposter ? game.imposterWordsByUid?.[player.uid] : game.word;
          return (
            <div className={card} style={cardStyle}>
              <p className="text-xs uppercase tracking-widest mb-3" style={{ ...mono, color: '#8899bb' }}>Your word is</p>
              <p className="text-4xl font-black mb-3 break-words" style={{ ...mono, color: '#c8d0e0' }}>{word}</p>
              {game.rules.showCategory && <p style={{ ...mono, color: '#7a8aaa' }}>Category: {game.category}</p>}
            </div>
          );
        }}
      />
    );
  }

  if (stage === 'describe') {
    return shell(
      <div className="space-y-4">
        <div className={card} style={cardStyle}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ ...mono, color: '#8899bb' }}>Starting with</p>
          <p className="text-3xl font-black text-white">{nameOf(game.firstPlayer)}</p>
          <p className="mt-2 inline-block px-3 py-1 rounded-full text-xs" style={{ ...mono, backgroundColor: '#4dd9ac22', color: '#4dd9ac' }}>
            then {game.direction}
          </p>
          <p className="text-sm mt-4" style={{ ...mono, color: '#8899bb' }}>
            One clue each. Go round as many times as you like, then vote by pointing on three.
          </p>
        </div>
        {!confirmReveal ? (
          <button type="button" onClick={() => setConfirmReveal(true)} className="w-full py-4 rounded-xl bg-slate-200 hover:bg-white text-slate-900 font-bold">
            Votes are in - reveal the imposter
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
      <div className={card} style={cardStyle}>
        <p className="text-xs uppercase tracking-widest mb-2" style={{ ...mono, color: '#8899bb' }}>
          The imposter{game.imposterIds.length > 1 ? 's were' : ' was'}
        </p>
        <p className="text-3xl font-black" style={{ color: '#c9384c' }}>{game.imposterIds.map(nameOf).join(', ')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={card} style={cardStyle}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ ...mono, color: '#8899bb' }}>Town word</p>
          <p className="text-xl font-bold break-words" style={{ color: '#c9a84c' }}>{game.word}</p>
        </div>
        <div className={card} style={cardStyle}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ ...mono, color: '#8899bb' }}>Imposter word</p>
          <p className="text-xl font-bold break-words" style={{ color: '#c9384c' }}>{game.imposterWord || 'None'}</p>
        </div>
      </div>
      <button type="button" onClick={deal} className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold">Play again</button>
      <button type="button" onClick={() => navigate('/one-phone')} className="w-full py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold">Back to Pass &amp; Play</button>
    </div>
  );
}
