import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedNumberStepper from '../../components/AnimatedNumberStepper';
import { getInitials } from '../../utils/avatar';

function getAvatarColor(player) {
  return player.avatarColor || 'bg-slate-600';
}

function SectionLabel({ children, className = '' }) {
  return (
    <div className={`text-slate-400 text-xs font-bold uppercase tracking-widest ${className}`.trim()}>
      {children}
    </div>
  );
}

export default function OnePhoneMafiaLobby({ players = [] }) {
  const navigate = useNavigate();
  const activePlayers = Array.isArray(players) ? players : [];
  const [rules, setRules] = useState({
    mafiaCount: 1,
    doctorEnabled: true,
    detectiveEnabled: true
  });
  const [narratorId, setNarratorId] = useState('');
  const [showRulesEdit, setShowRulesEdit] = useState(false);
  const [editRules, setEditRules] = useState({
    mafiaCount: '1',
    doctor: true,
    detective: true
  });
  const [mafiaCountError, setMafiaCountError] = useState('');

  const narrator = useMemo(
    () => activePlayers.find((player) => player.id === narratorId) || null,
    [activePlayers, narratorId]
  );

  useEffect(() => {
    if (showRulesEdit) {
      setEditRules({
        mafiaCount: String(rules.mafiaCount ?? '1'),
        doctor: Boolean(rules.doctorEnabled),
        detective: Boolean(rules.detectiveEnabled)
      });
      setMafiaCountError('');
    }
  }, [showRulesEdit, rules]);

  const maxStepperCount = Math.max(1, Math.floor(activePlayers.length * 0.25));
  const canStart = Boolean(narrator) && activePlayers.length >= 4;
  const dossierCardClass = 'relative overflow-hidden bg-[#d4b483] border border-[#8b6b3f] rounded-2xl p-5 text-left shadow-xl';
  const stampButtonClass = 'w-full bg-[#efe4cc]/90 hover:bg-[#f5ecd9] text-[#3a2a1a] border-2 border-dashed border-[#4a3622] font-mono uppercase tracking-widest font-semibold py-2.5 rounded-md transition-colors text-xs';
  const startEnabledClass = 'w-full bg-[#f7ecd8] hover:bg-[#fbf3e4] text-red-700 border-2 border-red-700 font-mono uppercase tracking-widest font-black py-3 rounded-md transition-colors text-xs';
  const startDisabledClass = 'w-full bg-[#d8cbb2] text-[#8f8676] border-2 border-[#a79a85] font-mono uppercase tracking-widest font-bold py-3 rounded-md cursor-not-allowed text-xs';

  const handleStartGame = () => {
    if (!canStart || !narrator) return;

    const activeGamePlayers = activePlayers.filter((player) => player.id !== narrator.id);
    navigate('/one-phone/mafia', {
      state: {
        started: true,
        players: activeGamePlayers,
        narrator,
        rules: {
          mafiaCount: Number(rules.mafiaCount) || 1,
          doctorEnabled: Boolean(rules.doctorEnabled),
          detectiveEnabled: Boolean(rules.detectiveEnabled)
        }
      }
    });
  };

  const toggleNarrator = (playerId) => {
    setNarratorId((current) => (current === playerId ? '' : playerId));
  };

  const handleBack = () => {
    navigate('/one-phone/games', { state: { players: activePlayers } });
  };

  const handleSaveRules = () => {
    setMafiaCountError('');

    const mafiaCountValue = editRules.mafiaCount.toString().trim();
    if (!mafiaCountValue) {
      setMafiaCountError('Number of mafias is required');
      return;
    }

    const mafiaCount = parseInt(mafiaCountValue, 10);
    if (isNaN(mafiaCount) || mafiaCount < 1) {
      setMafiaCountError('Number of mafias must be at least 1');
      return;
    }

    const totalPlayers = activePlayers.length;
    const maxAllowed = Math.max(1, Math.floor(totalPlayers * 0.25));
    if (mafiaCount > maxAllowed) {
      setMafiaCountError(`Too many mafias! With ${totalPlayers} players, you can have a maximum of ${maxAllowed} mafia.`);
      return;
    }

    setRules({
      mafiaCount,
      doctorEnabled: Boolean(editRules.doctor),
      detectiveEnabled: Boolean(editRules.detective)
    });
    setShowRulesEdit(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-md mx-auto">
        <div className="sticky top-0 z-50 pointer-events-none mb-4">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={handleBack}
              className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shadow-xl"
              title="Back to Games"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </div>

        <div className={dossierCardClass}>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
              Confidential
            </span>
          </div>

          <div className="relative z-10 mb-4">
            <div className="inline-block -rotate-3 border-2 border-red-700 text-red-700 font-serif font-black uppercase tracking-[0.22em] text-[11px] px-3 py-1 mb-3">
              Case File
            </div>
            <p className="text-[#2f2418] font-mono font-bold uppercase tracking-widest text-sm">CASE: MAFIA</p>
            <div className="mt-3 h-px bg-[#4a3622]/45" />
          </div>

          <div className="relative z-10 space-y-3">
            <button
              onClick={() => setShowRulesEdit(true)}
              className={stampButtonClass}
            >
              Edit Rules
            </button>
          </div>

          <div className="relative z-10 mt-4">
            <SectionLabel className="mb-3">Select Narrator</SectionLabel>
            <div className="space-y-2">
              {activePlayers.map((player) => {
                const selected = narratorId === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => toggleNarrator(player.id)}
                    className={`flex justify-between items-center p-3 rounded-lg border transition-colors w-full text-left ${
                      selected ? 'bg-slate-800/70 border-slate-200' : 'bg-slate-900/50 border-slate-700 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(player)} flex items-center justify-center text-white text-sm font-bold`}>
                        {getInitials(player.displayName)}
                      </div>
                      <span className={`truncate ${selected ? 'text-[11px] font-mono uppercase tracking-[0.35em] text-slate-300' : 'text-slate-200 font-medium'}`}>
                        {selected ? `NARRATOR: ${player.displayName}` : player.displayName}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 space-y-3 mt-4">
            <button
              onClick={handleStartGame}
              disabled={!canStart}
              className={canStart ? startEnabledClass : startDisabledClass}
            >
              {canStart ? `Start Game (${activePlayers.length})` : `Need narrator + 4+ (${activePlayers.length})`}
            </button>
          </div>

          {showRulesEdit && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
                <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-white font-semibold block mb-2 text-sm text-center">Number of Mafias</label>
                    <AnimatedNumberStepper
                      value={parseInt(editRules.mafiaCount, 10) || 1}
                      min={1}
                      max={maxStepperCount}
                      valueWidthClass="w-16"
                      onChange={(nextValue) => {
                        setEditRules({ ...editRules, mafiaCount: String(nextValue) });
                        setMafiaCountError('');
                      }}
                    />
                    {mafiaCountError && (
                      <p className="text-red-400 text-sm mt-2">{mafiaCountError}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-white font-semibold flex items-center gap-3 mb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editRules.doctor}
                        onChange={(event) => setEditRules({ ...editRules, doctor: event.target.checked })}
                        className="w-4 h-4"
                      />
                      Doctor 🩺
                    </label>
                    <p className="text-slate-400 text-xs">Can save one player each night</p>
                  </div>

                  <div>
                    <label className="text-white font-semibold flex items-center gap-3 mb-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editRules.detective}
                        onChange={(event) => setEditRules({ ...editRules, detective: event.target.checked })}
                        className="w-4 h-4"
                      />
                      Detective 🔍
                    </label>
                    <p className="text-slate-400 text-xs">Can investigate one player each night</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowRulesEdit(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveRules}
                    className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}