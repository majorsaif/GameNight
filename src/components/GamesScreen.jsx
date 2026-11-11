import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { openLobby } from '../lib/lobby';
import { useToast } from './Toast';
import { GameLoading } from './GameShell';
import { maxMafiaFor } from '../games/mafia/logic';
import { maxImpostersFor } from '../games/wordImposter/logic';
import { maxSpiesFor } from '../games/spyfall/logic';
import mafiaButtonImage from '../assets/mafia-button.webp';
import wordImposterButtonImage from '../assets/word-imposter-button.webp';
import spyfallButtonImage from '../assets/spyfall-button.webp';
import AnimatedNumberStepper from './AnimatedNumberStepper';

export default function GamesScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { roomId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { isHost, room, loading } = useRoom(roomId, user);
  const [showHostOnly, setShowHostOnly] = useState(false);
  const [busy, setBusy] = useState(false);
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
    showCategory: true,
    imposterNoWord: false
  });
  const [showSpyfallSetup, setShowSpyfallSetup] = useState(false);
  const [spyCountError, setSpyCountError] = useState('');
  const [spyfallRules, setSpyfallRules] = useState({
    spyCount: '1',
    showRoles: true,
    discussionTime: 8
  });

  const roomPlayerCount = room?.players?.length || 0;
  const maxMafia = maxMafiaFor(roomPlayerCount);
  const maxImposters = maxImpostersFor(roomPlayerCount);
  const maxSpies = maxSpiesFor(roomPlayerCount);

  const formatMinutes = (value) => `${value} min`;
  const formatVotingTime = (stepValue) => {
    if (stepValue === 1) return '30s';
    const minutes = stepValue / 2;
    if (Number.isInteger(minutes)) return `${minutes} min`;
    return `${Math.floor(minutes)} min 30s`;
  };

  const hostOnly = () => {
    setShowHostOnly(true);
    setTimeout(() => setShowHostOnly(false), 3000);
  };

  const confirmReplacingActivity = () => {
    const current = room?.activeActivity;
    if (!current) return true;
    // Starting a new lobby replaces whatever is running
    return window.confirm('A game is already running in this room. Start a new one instead?');
  };

  const launch = async (type, finalRules, close) => {
    if (!isHost || !roomId || busy) return;
    if (!confirmReplacingActivity()) return;
    setBusy(true);
    try {
      await openLobby(roomId, type, finalRules);
      close(false);
      navigate(`/room/${roomId}`);
    } catch (error) {
      console.error('Could not open lobby:', error);
      toast.error("Couldn't start the lobby. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleMafiaClick = () => (isHost ? setShowMafiaSetup(true) : hostOnly());
  const handleWordImposterClick = () => (isHost ? setShowWordImposterSetup(true) : hostOnly());
  const handleSpyfallClick = () => (isHost ? setShowSpyfallSetup(true) : hostOnly());

  const handleStartLobby = () => {
    setMafiaCountError('');
    const mafiaCount = parseInt(rules.mafiaCount, 10);
    if (Number.isNaN(mafiaCount) || mafiaCount < 1) {
      setMafiaCountError('Number of mafia must be at least 1');
      return;
    }
    launch('mafia', {
      mafiaCount,
      doctor: Boolean(rules.doctor),
      detective: Boolean(rules.detective),
      discussionTime: rules.discussionTime,
      votingTime: rules.votingTime
    }, setShowMafiaSetup);
  };

  const handleStartWordImposterLobby = () => {
    setImposterCountError('');
    const imposterCount = parseInt(wordImposterRules.imposterCount, 10);
    if (Number.isNaN(imposterCount) || imposterCount < 1) {
      setImposterCountError('Number of imposters must be at least 1');
      return;
    }
    launch('wordImposter', {
      imposterCount,
      showCategory: Boolean(wordImposterRules.showCategory),
      imposterNoWord: Boolean(wordImposterRules.imposterNoWord)
    }, setShowWordImposterSetup);
  };

  const handleStartSpyfallLobby = () => {
    setSpyCountError('');
    const spyCount = parseInt(spyfallRules.spyCount, 10);
    if (Number.isNaN(spyCount) || spyCount < 1) {
      setSpyCountError('Number of spies must be at least 1');
      return;
    }
    launch('spyfall', {
      spyCount,
      showRoles: Boolean(spyfallRules.showRoles),
      discussionTime: spyfallRules.discussionTime
    }, setShowSpyfallSetup);
  };

  if (!authLoading && !user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  if (authLoading || loading) return <GameLoading label="Loading games..." />;
  if (!room) return <Navigate to={`/room/${roomId}`} replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Sticky Back Button Container */}
      <div className="sticky top-0 z-50 pointer-events-none">
        <div className="w-full max-w-md mx-auto px-6 py-4">
          <button
            onClick={() => navigate(`/room/${roomId}`)}
            aria-label="Back to room"
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
          
          {/* Mafia */}
          <button 
            onClick={handleMafiaClick}
            aria-label="Mafia"
            style={{
              backgroundImage: `url(${mafiaButtonImage})`,
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>

          {/* Word Imposter */}
          <button 
            onClick={handleWordImposterClick}
            aria-label="Word Imposter"
            style={{
              backgroundImage: `url(${wordImposterButtonImage})`,
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>

          {/* Spyfall */}
          <button 
            onClick={handleSpyfallClick}
            aria-label="Spyfall"
            style={{
              backgroundImage: `url(${spyfallButtonImage})`,
              backgroundSize: '108%',
              backgroundPosition: 'center bottom'
            }}
            className="group relative overflow-hidden rounded-[2rem] shadow-xl hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 h-52 bg-slate-900"
          >
            <div className="absolute inset-0 bg-black/25" />
          </button>

        </div>
      </main>

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
              <h2 className="text-white text-2xl font-bold">Mafia Setup</h2>
              <button
                onClick={() => setShowMafiaSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of mafias */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Number of Mafia</label>
                <AnimatedNumberStepper
                  value={parseInt(rules.mafiaCount, 10) || 1}
                  min={1}
                  max={maxMafia}
                  valueWidthClass="w-16"
                  onChange={(nextValue) => {
                    setRules({ ...rules, mafiaCount: String(nextValue) });
                    setMafiaCountError('');
                  }}
                />
                {mafiaCountError && (
                  <p className="text-red-400 text-sm mt-2">{mafiaCountError}</p>
                )}
              </div>

              {/* Discussion time */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Discussion Time</label>
                <AnimatedNumberStepper
                  value={rules.discussionTime}
                  min={1}
                  max={10}
                  valueWidthClass="w-28"
                  formatValue={formatMinutes}
                  onChange={(nextValue) => setRules({ ...rules, discussionTime: nextValue })}
                />
              </div>

              {/* Voting time */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Voting Time</label>
                <AnimatedNumberStepper
                  value={Math.max(1, Math.min(6, Math.round((rules.votingTime || 0.5) * 2)))}
                  min={1}
                  max={6}
                  valueWidthClass="w-28"
                  formatValue={formatVotingTime}
                  onChange={(nextValue) => setRules({ ...rules, votingTime: nextValue / 2 })}
                />
              </div>

              {/* Doctor */}
              <div>
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
              <div>
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

              <button
                onClick={handleStartLobby}
                disabled={busy}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {busy ? 'Starting...' : 'Start Lobby'}
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
              <h2 className="text-white text-2xl font-bold">Spyfall Setup</h2>
              <button
                onClick={() => setShowSpyfallSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of spies */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Number of Spies</label>
                <AnimatedNumberStepper
                  value={parseInt(spyfallRules.spyCount, 10) || 1}
                  min={1}
                  max={maxSpies}
                  valueWidthClass="w-16"
                  onChange={(nextValue) => {
                    setSpyfallRules({ ...spyfallRules, spyCount: String(nextValue) });
                    setSpyCountError('');
                  }}
                />
                {spyCountError && (
                  <p className="text-red-400 text-sm mt-2">{spyCountError}</p>
                )}
              </div>

              {/* Discussion time */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Discussion Time</label>
                <AnimatedNumberStepper
                  value={spyfallRules.discussionTime}
                  min={1}
                  max={10}
                  valueWidthClass="w-28"
                  formatValue={formatMinutes}
                  onChange={(nextValue) => setSpyfallRules({ ...spyfallRules, discussionTime: nextValue })}
                />
              </div>

              {/* Show roles */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Show Roles</label>
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

              <button
                onClick={handleStartSpyfallLobby}
                disabled={busy}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {busy ? 'Starting...' : 'Start Lobby'}
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
              <h2 className="text-white text-2xl font-bold">Word Imposter Setup</h2>
              <button
                onClick={() => setShowWordImposterSetup(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Number of imposters */}
              <div>
                <label className="text-white font-semibold block mb-2 text-center">Number of Imposters</label>
                <AnimatedNumberStepper
                  value={parseInt(wordImposterRules.imposterCount, 10) || 1}
                  min={1}
                  max={maxImposters}
                  valueWidthClass="w-16"
                  onChange={(nextValue) => {
                    setWordImposterRules({ ...wordImposterRules, imposterCount: String(nextValue) });
                    setImposterCountError('');
                  }}
                />
                {imposterCountError && (
                  <p className="text-red-400 text-sm mt-2">{imposterCountError}</p>
                )}
              </div>

              {/* Show category to imposter */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Show Category</label>
                    <p className="text-slate-400 text-sm">Everyone sees the word's category as a hint</p>
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

              {/* Imposter gets no word */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-white font-semibold">Imposter gets no word</label>
                    <p className="text-slate-400 text-sm">When off, imposter receives a different related word</p>
                  </div>
                  <button
                    onClick={() => setWordImposterRules({ ...wordImposterRules, imposterNoWord: !wordImposterRules.imposterNoWord })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      wordImposterRules.imposterNoWord ? 'bg-teal-600' : 'bg-slate-600'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      wordImposterRules.imposterNoWord ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              <button
                onClick={handleStartWordImposterLobby}
                disabled={busy}
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {busy ? 'Starting...' : 'Start Lobby'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
