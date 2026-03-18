import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import LOCATIONS from '../spyfall/locations';

export default function GamesScreen() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const { user } = useAuth();
  const { isHost, room } = useRoom(roomId, user?.id, user?.displayName, user?.photo || null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [showHostOnly, setShowHostOnly] = useState(false);
  const [showMafiaSetup, setShowMafiaSetup] = useState(false);
  const [mafiaCountError, setMafiaCountError] = useState('');
  const [rules, setRules] = useState({
    mafiaCount: '1',
    doctor: true,
    detective: true,
    discussionTime: 3,
    votingTime: 1
  });
  const [showWordImposterSetup, setShowWordImposterSetup] = useState(false);
  const [imposterCountError, setImposterCountError] = useState('');
  const [wordImposterRules, setWordImposterRules] = useState({
    imposterCount: '1',
    showCategory: true
  });
  const [showSpyfallSetup, setShowSpyfallSetup] = useState(false);
  const [spyCountError, setSpyCountError] = useState('');
  const [spyfallRules, setSpyfallRules] = useState({
    spyCount: '1',
    showRoles: true,
    discussionTime: 8
  });

  const handleSpyfallClick = () => {
    if (!isHost) {
      setShowHostOnly(true);
      setTimeout(() => setShowHostOnly(false), 3000);
      return;
    }
    setShowSpyfallSetup(true);
  };

  const handleStartSpyfallLobby = async () => {
    if (!isHost || !roomId || !user) return;

    setSpyCountError('');

    const spyCountValue = spyfallRules.spyCount.trim();
    if (!spyCountValue) {
      setSpyCountError('Number of spies is required');
      return;
    }

    const spyCount = parseInt(spyCountValue, 10);
    if (isNaN(spyCount) || spyCount < 1) {
      setSpyCountError('Number of spies must be at least 1');
      return;
    }

    const totalPlayers = room?.players?.length || 0;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers * 0.25));
    if (spyCount > maxAllowed) {
      setSpyCountError(`Too many spies! With ${totalPlayers} players you can have a maximum of ${maxAllowed} spy(s)`);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

    const gamePlayers = room.players.map(p => ({
      uid: p.id,
      displayName: p.displayNameForGame || p.displayName,
      avatarColor: p.avatarColor,
      role: null
    }));

    const finalRules = {
      spyCount,
      showRoles: spyfallRules.showRoles,
      discussionTime: spyfallRules.discussionTime
    };

    await updateDoc(roomRef, {
      activeActivity: {
        type: 'spyfall',
        phase: 'lobby',
        location: null,
        rules: finalRules,
        spyIds: [],
        eliminatedSpyIds: [],
        players: gamePlayers,
        lobbyPlayers: [user.id],
        currentAskerId: null,
        readyVotes: [],
        votes: {},
        eliminatedUid: null,
        spyGuessing: null,
        winner: null,
        roundNumber: 1,
        createdAt: serverTimestamp()
      },
      lastActivity: serverTimestamp()
    });

    setShowSpyfallSetup(false);
    navigate(`/room/${roomId}`);
  };

  const handleWordImposterClick = () => {
    if (!isHost) {
      setShowHostOnly(true);
      setTimeout(() => setShowHostOnly(false), 3000);
      return;
    }
    setShowWordImposterSetup(true);
  };

  const handleStartWordImposterLobby = async () => {
    if (!isHost || !roomId || !user) return;

    setImposterCountError('');

    const imposterCountValue = wordImposterRules.imposterCount.trim();
    if (!imposterCountValue) {
      setImposterCountError('Number of imposters is required');
      return;
    }

    const imposterCount = parseInt(imposterCountValue, 10);
    if (isNaN(imposterCount) || imposterCount < 1) {
      setImposterCountError('Number of imposters must be at least 1');
      return;
    }

    const totalPlayers = room?.players?.length || 0;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers / 3));
    if (imposterCount > maxAllowed) {
      setImposterCountError(`Too many imposters! With ${totalPlayers} players you can have a maximum of ${maxAllowed} imposter(s)`);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

    const gamePlayers = room.players.map(p => ({
      uid: p.id,
      displayName: p.displayNameForGame || p.displayName,
      avatarColor: p.avatarColor
    }));

    const finalRules = {
      imposterCount: imposterCount,
      showCategory: wordImposterRules.showCategory
    };

    await updateDoc(roomRef, {
      activeActivity: {
        type: 'wordImposter',
        phase: 'lobby',
        rules: finalRules,
        players: gamePlayers,
        lobbyPlayers: [user.id],
        word: null,
        category: null,
        imposterIds: [],
        startingPlayerId: null,
        direction: null,
        readyVotes: [],
        votes: {},
        eliminatedUid: null,
        winner: null,
        wordRevealed: null,
        roundNumber: 1,
        createdAt: serverTimestamp()
      },
      lastActivity: serverTimestamp()
    });

    setShowWordImposterSetup(false);
    navigate(`/room/${roomId}`);
  };

  const handleMafiaClick = () => {
    if (!isHost) {
      setShowHostOnly(true);
      setTimeout(() => setShowHostOnly(false), 3000);
      return;
    }
    // Open rules modal instead of navigating
    setShowMafiaSetup(true);
  };

  const handleStartLobby = async () => {
    if (!isHost || !roomId || !user) return;

    setMafiaCountError('');

    // Validate mafia count
    const mafiaCountValue = rules.mafiaCount.trim();
    if (!mafiaCountValue) {
      setMafiaCountError('Number of mafias is required');
      return;
    }

    const mafiaCount = parseInt(mafiaCountValue, 10);
    if (isNaN(mafiaCount) || mafiaCount < 1) {
      setMafiaCountError('Number of mafias must be at least 1');
      return;
    }

    // Check 25% limit based on current room players
    const totalPlayers = room?.players?.length || 0;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers * 0.25));
    if (mafiaCount > maxAllowed) {
      setMafiaCountError(`Too many mafias! With ${totalPlayers} players, you can have a maximum of ${maxAllowed} mafia.`);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);

    // Get all room players and format them for the game
    const gamePlayers = room.players.map(p => ({
      uid: p.id,
      displayName: p.displayNameForGame || p.displayName,
      avatarColor: p.avatarColor,
      isAlive: true,
      role: null
    }));

    const finalRules = {
      ...rules,
      mafiaCount: mafiaCount
    };

    await updateDoc(roomRef, {
      activeActivity: {
        type: 'mafia',
        phase: 'lobby',
        rules: finalRules,
        players: gamePlayers,
        lobbyPlayers: [user.id],
        pendingVictim: null,
        doctorSave: null,
        detectiveResult: null,
        nightVotes: {},
        dayVotes: {},
        readyVotes: [],
        confirmedVotes: [],
        lastEliminated: null,
        lastSaved: null,
        winner: null,
        phaseStartedAt: null,
        phaseDurationMs: null,
        roundNumber: 1,
        createdAt: serverTimestamp()
      },
      lastActivity: serverTimestamp()
    });

    // Close modal and navigate back to HomeScreen
    setShowMafiaSetup(false);
    navigate(`/room/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Sticky Back Button Container */}
      <div className="sticky top-0 z-50 pointer-events-none">
        <div className="w-full max-w-md mx-auto px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-xl"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-0 w-full max-w-md mx-auto px-6 -mt-[68px] pt-4 pb-4">
        <div className="flex items-center justify-center">
          <h1 className="text-white text-xl font-black uppercase tracking-tight">Social Deduction</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-0 flex-1 w-full max-w-md mx-auto px-6 py-6 flex flex-col gap-6">

        {/* Game Tiles */}
        <div className="flex flex-col gap-4">
          
          {/* Word Imposter */}
          <button 
            onClick={handleWordImposterClick}
            style={{
              backgroundImage: 'url("/images/cards/word-imposter.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-teal-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-teal-200 rounded"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">WORD<br/>IMPOSTER</h2>
              <p className="text-teal-100 text-sm">Find the imposter who doesn't know the word</p>
            </div>
            <div className="absolute bottom-0 right-0 text-teal-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </div>
          </button>

          {/* Spyfall */}
          <button 
            onClick={handleSpyfallClick}
            style={{
              backgroundImage: 'url("/images/cards/spyfall.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-indigo-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-indigo-200 rounded-full"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">SPYFALL</h2>
              <p className="text-indigo-100 text-sm">One player is the spy — can you find them?</p>
            </div>
            <div className="absolute bottom-0 right-0 text-indigo-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
          </button>

          {/* Mafia */}
          <button 
            onClick={handleMafiaClick}
            style={{
              backgroundImage: 'url("/images/cards/mafia.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
            className="group relative overflow-hidden rounded-2xl p-8 text-left shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-red-500/30 rounded-xl flex items-center justify-center mb-4">
                <div className="w-6 h-6 bg-red-200 rotate-45"></div>
              </div>
              <h2 className="text-white font-black text-3xl uppercase mb-2 tracking-tight">MAFIA</h2>
              <p className="text-red-100 text-sm">Town vs Mafia — who do you trust?</p>
            </div>
            <div className="absolute bottom-0 right-0 text-red-400/10 transform translate-x-8 translate-y-8">
              <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="12,2 22,12 12,22 2,12" />
              </svg>
            </div>
          </button>

        </div>
      </main>

      {/* Coming Soon Toast */}
      {showComingSoon && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-xl px-6 py-3 shadow-2xl">
            <p className="text-white font-semibold">Coming soon! 🎮</p>
          </div>
        </div>
      )}

      {/* Host Only Toast */}
      {showHostOnly && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-red-800 border border-red-700 rounded-xl px-6 py-3 shadow-2xl">
            <p className="text-white font-semibold">Only the host can start a game 🔐</p>
          </div>
        </div>
      )}

      {/* Mafia Setup Modal */}
      {showMafiaSetup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-2xl font-bold">🔪 Mafia Setup</h2>
              <button
                onClick={() => setShowMafiaSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of mafias */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Number of Mafias</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rules.mafiaCount}
                  onChange={(e) => {
                    setRules({ ...rules, mafiaCount: e.target.value });
                    setMafiaCountError('');
                  }}
                  placeholder="Enter number"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                />
                {mafiaCountError && (
                  <p className="text-red-400 text-sm mt-2">{mafiaCountError}</p>
                )}
              </div>

              {/* Doctor */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Doctor 🩺</label>
                    <p className="text-slate-400 text-sm">Can save one player each night</p>
                  </div>
                  <button
                    onClick={() => setRules({ ...rules, doctor: !rules.doctor })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      rules.doctor ? 'bg-violet-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      rules.doctor ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Detective */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Detective 🔍</label>
                    <p className="text-slate-400 text-sm">Can investigate one player each night</p>
                  </div>
                  <button
                    onClick={() => setRules({ ...rules, detective: !rules.detective })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      rules.detective ? 'bg-violet-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      rules.detective ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Discussion time */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Discussion Time</label>
                <select
                  value={rules.discussionTime}
                  onChange={(e) => setRules({ ...rules, discussionTime: parseInt(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                >
                  <option value={1}>1 minute</option>
                  <option value={2}>2 minutes</option>
                  <option value={3}>3 minutes</option>
                  <option value={5}>5 minutes</option>
                </select>
              </div>

              {/* Voting time */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Voting Time</label>
                <select
                  value={rules.votingTime}
                  onChange={(e) => setRules({ ...rules, votingTime: parseFloat(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                >
                  <option value={0.5}>30 seconds</option>
                  <option value={1}>1 minute</option>
                  <option value={2}>2 minutes</option>
                </select>
              </div>

              <button
                onClick={handleStartLobby}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spyfall Setup Modal */}
      {showSpyfallSetup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-2xl font-bold">🕵️ Spyfall Setup</h2>
              <button
                onClick={() => setShowSpyfallSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of spies */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Number of Spies</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={spyfallRules.spyCount}
                  onChange={(e) => {
                    setSpyfallRules({ ...spyfallRules, spyCount: e.target.value });
                    setSpyCountError('');
                  }}
                  placeholder="Enter number"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                />
                {spyCountError && (
                  <p className="text-red-400 text-sm mt-2">{spyCountError}</p>
                )}
              </div>

              {/* Show roles */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Show Roles 🎭</label>
                    <p className="text-slate-400 text-sm">Each non-spy player sees their role at the location</p>
                  </div>
                  <button
                    onClick={() => setSpyfallRules({ ...spyfallRules, showRoles: !spyfallRules.showRoles })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      spyfallRules.showRoles ? 'bg-indigo-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      spyfallRules.showRoles ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Discussion time */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Discussion Time</label>
                <select
                  value={spyfallRules.discussionTime}
                  onChange={(e) => setSpyfallRules({ ...spyfallRules, discussionTime: parseInt(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                >
                  <option value={5}>5 minutes</option>
                  <option value={8}>8 minutes</option>
                  <option value={10}>10 minutes</option>
                </select>
              </div>

              <button
                onClick={handleStartSpyfallLobby}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Word Imposter Setup Modal */}
      {showWordImposterSetup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-2xl font-bold">🕵️ Word Imposter Setup</h2>
              <button
                onClick={() => setShowWordImposterSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of imposters */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <label className="text-white font-semibold block mb-2">Number of Imposters</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={wordImposterRules.imposterCount}
                  onChange={(e) => {
                    setWordImposterRules({ ...wordImposterRules, imposterCount: e.target.value });
                    setImposterCountError('');
                  }}
                  placeholder="Enter number"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
                />
                {imposterCountError && (
                  <p className="text-red-400 text-sm mt-2">{imposterCountError}</p>
                )}
              </div>

              {/* Show category to imposter */}
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Show Category 📂</label>
                    <p className="text-slate-400 text-sm">Imposters see the category but not the word</p>
                  </div>
                  <button
                    onClick={() => setWordImposterRules({ ...wordImposterRules, showCategory: !wordImposterRules.showCategory })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      wordImposterRules.showCategory ? 'bg-teal-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      wordImposterRules.showCategory ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              <button
                onClick={handleStartWordImposterLobby}
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
