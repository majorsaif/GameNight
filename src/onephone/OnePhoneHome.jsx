import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameNightLogo from '../components/GameNightLogo';
import mafiaButtonImage from '../assets/mafia-button.png';
import wordImposterButtonImage from '../assets/word-imposter-button.png';
import spyfallButtonImage from '../assets/spyfall-button.png';
import { getAvatarColor, getInitials } from '../utils/avatar';

function createPlayerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPlayer(displayName) {
  const id = createPlayerId();

  return {
    id,
    displayName,
    avatarColor: getAvatarColor({ id })
  };
}

export default function OnePhoneHome() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [narratorId, setNarratorId] = useState('');

  useEffect(() => {
    if (!narratorId) return;
    if (!players.some((player) => player.id === narratorId)) {
      setNarratorId('');
    }
  }, [players, narratorId]);

  const handleLeave = () => {
    navigate('/');
  };

  const handleAddPlayer = (event) => {
    event.preventDefault();

    const displayName = playerName.trim();
    if (!displayName) return;

    setPlayers((currentPlayers) => [...currentPlayers, createPlayer(displayName)]);
    setPlayerName('');
  };

  const handleRemovePlayer = (playerId) => {
    setPlayers((currentPlayers) => currentPlayers.filter((player) => player.id !== playerId));
    setNarratorId((currentNarratorId) => (currentNarratorId === playerId ? '' : currentNarratorId));
  };

  const visiblePlayers = players.slice(0, 6);
  const remainingCount = players.length - visiblePlayers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <header className="relative z-40 w-full max-w-md mx-auto px-4 sm:px-6 py-4">
        <div className="flex justify-between items-center">
          <GameNightLogo className="translate-y-0.5" />

          <button
            onClick={handleLeave}
            className="flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title="Leave room"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6 overflow-y-auto">
        <div className="text-center pt-2 pb-4">
          <h1 className="text-3xl font-semibold text-white">Pass &amp; Play</h1>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Players in Room ({players.length})
            </h3>
          </div>

          <div className="flex items-center gap-0">
            {visiblePlayers.map((player, index) => (
              <div
                key={player.id}
                className="relative"
                style={{ marginLeft: index > 0 ? '-8px' : '0' }}
              >
                <div
                  className={`w-11 h-11 rounded-full ${player.avatarColor} flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900`}
                  title={player.displayName}
                >
                  {getInitials(player.displayName)}
                </div>
                {player.id === narratorId && (
                  <div className="absolute -bottom-0.5 -right-0.5 px-1.5 h-5 bg-violet-500 rounded-full flex items-center justify-center text-[10px] font-black uppercase tracking-wide text-white border-2 border-slate-900">
                    Narrator
                  </div>
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold border-2 border-slate-900"
                style={{ marginLeft: '-8px' }}
                title={`${remainingCount} more player${remainingCount > 1 ? 's' : ''}`}
              >
                +{remainingCount}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-5 shadow-xl shadow-slate-950/20">
          <form onSubmit={handleAddPlayer} className="space-y-3">
            <div>
              <label className="mb-2 block text-slate-400 text-xs font-bold uppercase tracking-widest">
                Add Player
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Enter a name"
                  className="flex-1 bg-[#16213e] border border-[#2a3f5f] rounded-lg text-white px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                />
                <button
                  type="submit"
                  className="px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg transition-colors whitespace-nowrap"
                >
                  Add Player
                </button>
              </div>
            </div>
          </form>

          <div>
            <label className="mb-2 block text-slate-400 text-xs font-bold uppercase tracking-widest">
              Narrator
            </label>
            <select
              value={narratorId}
              onChange={(event) => setNarratorId(event.target.value)}
              disabled={players.length === 0}
              className="w-full bg-[#16213e] border border-[#2a3f5f] rounded-lg text-white px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">Choose a narrator</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {players.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-4 py-5 text-center text-sm text-slate-500">
                Add a few players to start the local game.
              </div>
            ) : (
              players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${player.avatarColor} flex items-center justify-center text-white text-sm font-bold`}
                    >
                      {getInitials(player.displayName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate text-slate-200 font-medium">{player.displayName}</span>
                        {player.id === narratorId && (
                          <span className="inline-flex items-center rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-200">
                            Narrator
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemovePlayer(player.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-colors hover:bg-red-500 hover:text-white"
                    aria-label={`Remove ${player.displayName}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4">
          <button
            type="button"
            aria-label="Mafia"
            onClick={() => navigate('/one-phone/mafia')}
            style={{
              backgroundImage: `url(${mafiaButtonImage})`,
              backgroundSize: '112%',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>

          <button
            type="button"
            aria-label="Word Imposter"
            onClick={() => navigate('/one-phone/word-imposter')}
            style={{
              backgroundImage: `url(${wordImposterButtonImage})`,
              backgroundSize: '112%',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>

          <button
            type="button"
            aria-label="Spyfall"
            onClick={() => navigate('/one-phone/spyfall')}
            style={{
              backgroundImage: `url(${spyfallButtonImage})`,
              backgroundSize: '112%',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>
        </section>
      </main>
    </div>
  );
}