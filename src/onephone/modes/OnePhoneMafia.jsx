import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInitials } from '../../utils/avatar';
import mafiaRoleCardImage from '../../assets/mafia/mafia-card.png';
import detectiveRoleCardImage from '../../assets/mafia/detective-card.png';
import doctorRoleCardImage from '../../assets/mafia/doctor-card.png';
import civilianRoleCardImage from '../../assets/mafia/civilian-card.png';
import cardBackImage from '../../assets/mafia/card-back.png';
import { KILL_CAUSES, SAVE_CAUSES, KILL_NOTE, SAVE_NOTE } from '../../mafia/causes';

const ROLE_CARD_IMAGES = {
  mafia: mafiaRoleCardImage,
  doctor: doctorRoleCardImage,
  detective: detectiveRoleCardImage,
  civilian: civilianRoleCardImage
};

function shuffle(players) {
  const copy = [...players];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items[Math.floor(Math.random() * items.length)];
}

function assignRoles(players = [], rules = {}) {
  const activePlayers = Array.isArray(players) ? players.filter(Boolean) : [];
  const shuffledPlayers = shuffle(activePlayers);
  const roles = {};
  const remainingPlayers = [...shuffledPlayers];

  const mafiaCount = Math.min(Math.max(0, Number(rules?.mafiaCount) || 0), remainingPlayers.length);
  const doctorEnabled = Boolean(rules?.doctorEnabled);
  const detectiveEnabled = Boolean(rules?.detectiveEnabled);

  for (let i = 0; i < mafiaCount; i += 1) {
    const player = remainingPlayers.shift();
    if (player) {
      roles[player.id] = 'mafia';
    }
  }

  if (doctorEnabled) {
    const doctorPlayer = remainingPlayers.shift();
    if (doctorPlayer) {
      roles[doctorPlayer.id] = 'doctor';
    }
  }

  if (detectiveEnabled) {
    const detectivePlayer = remainingPlayers.shift();
    if (detectivePlayer) {
      roles[detectivePlayer.id] = 'detective';
    }
  }

  remainingPlayers.forEach((player) => {
    roles[player.id] = 'civilian';
  });

  return roles;
}

function formatCommaNames(players) {
  if (!players.length) return 'None';
  return players.map((player) => player.displayName).join(', ');
}

function getRoleLabel(role) {
  switch (role) {
    case 'mafia':
      return 'Mafia';
    case 'doctor':
      return 'Doctor';
    case 'detective':
      return 'Detective';
    default:
      return 'Civilian';
  }
}

function getRoleStampStyle(role) {
  switch (role) {
    case 'mafia':
      return {
        borderColor: '#8b3a3a',
        color: '#8b3a3a'
      };
    case 'doctor':
      return {
        borderColor: '#4a7c5a',
        color: '#4a7c5a'
      };
    case 'detective':
      return {
        borderColor: '#8b6b3f',
        color: '#8b6b3f'
      };
    default:
      return {
        borderColor: '#5a7a9a',
        color: '#5a7a9a'
      };
  }
}

function buildNightReport({ nightResults, players, eliminatedPlayers }) {
  const killedPlayer = nightResults.killed ? players.find((player) => player.id === nightResults.killed) : null;
  const savedPlayer = nightResults.saved ? players.find((player) => player.id === nightResults.saved) : null;
  const isSaved = Boolean(killedPlayer && nightResults.saved && nightResults.saved === nightResults.killed);

  if (killedPlayer && isSaved) {
    return {
      type: 'save',
      victimId: killedPlayer.id,
      playerName: killedPlayer.displayName,
      cause: pickRandom(SAVE_CAUSES),
      note: SAVE_NOTE.replace('[Name]', killedPlayer.displayName)
    };
  }

  if (killedPlayer) {
    return {
      type: 'kill',
      victimId: killedPlayer.id,
      playerName: killedPlayer.displayName,
      cause: pickRandom(KILL_CAUSES),
      note: KILL_NOTE
    };
  }

  if (savedPlayer) {
    return {
      type: 'save',
      victimId: savedPlayer.id,
      playerName: savedPlayer.displayName,
      cause: pickRandom(SAVE_CAUSES),
      note: SAVE_NOTE.replace('[Name]', savedPlayer.displayName)
    };
  }

  return {
    type: 'quiet',
    victimId: null,
    playerName: '',
    cause: '',
    note: 'The night passed quietly'
  };
}

function getAlivePlayers(players, eliminatedPlayers) {
  return players.filter((player) => !eliminatedPlayers.includes(player.id));
}

function getMafiaNames(players, roles, eliminatedPlayers) {
  return getAlivePlayers(players, eliminatedPlayers)
    .filter((player) => roles[player.id] === 'mafia')
    .map((player) => player.displayName);
}

function getLivingByRole(players, roles, eliminatedPlayers, role) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] === role);
}

function getLivingTownCount(players, roles, eliminatedPlayers) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] !== 'mafia').length;
}

function getLivingMafiaCount(players, roles, eliminatedPlayers) {
  return getAlivePlayers(players, eliminatedPlayers).filter((player) => roles[player.id] === 'mafia').length;
}

function checkWinner(players, roles, eliminatedPlayers) {
  const livingMafia = getLivingMafiaCount(players, roles, eliminatedPlayers);
  const livingTown = getLivingTownCount(players, roles, eliminatedPlayers);

  if (livingMafia === 0) return 'town';
  if (livingMafia >= livingTown && livingMafia > 0) return 'mafia';
  return null;
}

function Avatar({ player, sizeClass = 'w-10 h-10', textClass = 'text-sm' }) {
  return (
    <div
      className={`${sizeClass} ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold ${textClass}`}
    >
      {getInitials(player.displayName)}
    </div>
  );
}

function SectionLabel({ children, className = '' }) {
  return (
    <div className={`text-slate-400 text-xs font-bold uppercase tracking-widest ${className}`.trim()}>
      {children}
    </div>
  );
}

function CardStamp({ text, tone = 'neutral' }) {
  const toneStyles = {
    neutral: { borderColor: '#5a7a9a', color: '#5a7a9a' },
    town: { borderColor: '#5a7a9a', color: '#5a7a9a' },
    mafia: { borderColor: '#8b3a3a', color: '#8b3a3a' },
    doctor: { borderColor: '#4a7c5a', color: '#4a7c5a' },
    detective: { borderColor: '#8b6b3f', color: '#8b6b3f' },
    alive: { borderColor: '#4a7c5a', color: '#4a7c5a' },
    deceased: { borderColor: '#8b3a3a', color: '#8b3a3a' }
  };

  return (
    <span
      className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
      style={{
        ...(toneStyles[tone] || toneStyles.neutral),
        transform: 'rotate(-6deg)',
        fontSize: '10px'
      }}
    >
      {text}
    </span>
  );
}

function OnePhoneMafia({ players = [], narrator = null, rules = {} }) {
  const navigate = useNavigate();
  const [roles, setRoles] = useState(() => assignRoles(players, rules));
  const [phase, setPhase] = useState('role-reveal');
  const [eliminatedPlayers, setEliminatedPlayers] = useState([]);
  const [nightResults, setNightResults] = useState({
    killed: null,
    saved: null,
    investigated: null
  });
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [revealedPlayers, setRevealedPlayers] = useState([]);
  const [winner, setWinner] = useState(null);
  const [nightCount, setNightCount] = useState(1);
  const [roleRevealTargetId, setRoleRevealTargetId] = useState(null);
  const [roleRevealStep, setRoleRevealStep] = useState('list');
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [eyesClosedNextPhase, setEyesClosedNextPhase] = useState('night-mafia');
  const [showDetectiveResult, setShowDetectiveResult] = useState(false);
  const [nightReport, setNightReport] = useState({
    type: 'quiet',
    victimId: null,
    playerName: '',
    cause: '',
    note: 'The night passed quietly'
  });

  const activePlayers = Array.isArray(players) ? players : [];
  const narratorName = narrator?.displayName || 'Narrator';
  const mafiaNames = getMafiaNames(activePlayers, roles, eliminatedPlayers);
  const alivePlayers = getAlivePlayers(activePlayers, eliminatedPlayers);
  const allPlayersRevealed = activePlayers.length > 0 && revealedPlayers.length === activePlayers.length;
  const selectedRevealPlayer = roleRevealTargetId ? activePlayers.find((player) => player.id === roleRevealTargetId) : null;
  const selectedRole = selectedRevealPlayer ? roles[selectedRevealPlayer.id] : null;
  const selectedRoleImage = selectedRole ? ROLE_CARD_IMAGES[selectedRole] : cardBackImage;
  const mafiaLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'mafia');
  const doctorLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'doctor');
  const detectiveLiving = getLivingByRole(activePlayers, roles, eliminatedPlayers, 'detective');
  const isDoctorEnabled = Boolean(rules?.doctorEnabled) && doctorLiving.length > 0;
  const isDetectiveEnabled = Boolean(rules?.detectiveEnabled) && detectiveLiving.length > 0;

  const resetGame = () => {
    setRoles(assignRoles(activePlayers, rules));
    setPhase('role-reveal');
    setEliminatedPlayers([]);
    setNightResults({ killed: null, saved: null, investigated: null });
    setSelectedTarget(null);
    setRevealedPlayers([]);
    setWinner(null);
    setNightCount(1);
    setRoleRevealTargetId(null);
    setRoleRevealStep('list');
    setIsCardFlipped(false);
    setEyesClosedNextPhase('night-mafia');
    setShowDetectiveResult(false);
    setNightReport({
      type: 'quiet',
      victimId: null,
      playerName: '',
      cause: '',
      note: 'The night passed quietly'
    });
  };

  const handleReturnToPassPlay = () => {
    navigate('/one-phone', {
      state: {
        players: activePlayers,
        narrator,
        rules
      }
    });
  };

  const handleCheckWinner = (nextEliminatedPlayers) => {
    const nextWinner = checkWinner(activePlayers, roles, nextEliminatedPlayers);
    if (nextWinner) {
      setWinner(nextWinner);
      setPhase('ended');
      return nextWinner;
    }
    return null;
  };

  const revealPlayer = (playerId) => {
    if (revealedPlayers.includes(playerId)) return;
    setSelectedTarget(playerId);
    setRoleRevealTargetId(playerId);
    setRoleRevealStep('pass-to-player');
    setIsCardFlipped(false);
  };

  const startRoleCard = () => {
    setRoleRevealStep('card');
    setIsCardFlipped(false);
  };

  const handleRoleCardTap = () => {
    if (!selectedRevealPlayer) return;

    if (!isCardFlipped) {
      setIsCardFlipped(true);
      return;
    }

    setIsCardFlipped(false);
    setRevealedPlayers((current) => (current.includes(selectedRevealPlayer.id) ? current : [...current, selectedRevealPlayer.id]));
    setRoleRevealStep('pass-back');
  };

  const finishRoleReveal = () => {
    setSelectedTarget(null);
    setRoleRevealTargetId(null);
    setRoleRevealStep('list');
    setIsCardFlipped(false);
  };

  const startNight = () => {
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('night-mafia');
    setSelectedTarget(null);
  };

  const enterDayDiscussion = () => {
    const nextNightResults = { ...nightResults };
    const nextEliminatedPlayers = [...eliminatedPlayers];
    const nextReport = buildNightReport({ nightResults: nextNightResults, players: activePlayers, eliminatedPlayers: nextEliminatedPlayers });

    if (nextReport.type === 'kill' && nextReport.victimId && !nextEliminatedPlayers.includes(nextReport.victimId)) {
      nextEliminatedPlayers.push(nextReport.victimId);
    }

    setNightReport(nextReport);
    setEliminatedPlayers(nextEliminatedPlayers);
    setSelectedTarget(null);
    setShowDetectiveResult(false);

    const nextWinner = handleCheckWinner(nextEliminatedPlayers);
    if (nextWinner) return;

    setPhase('day-discussion');
  };

  const continueEyesClosed = () => {
    if (eyesClosedNextPhase === 'night-mafia') {
      setPhase('night-mafia');
      setSelectedTarget(null);
      setShowDetectiveResult(false);
      return;
    }

    if (eyesClosedNextPhase === 'night-doctor') {
      setPhase('night-doctor');
      setSelectedTarget(null);
      return;
    }

    if (eyesClosedNextPhase === 'night-detective') {
      setPhase('night-detective');
      setSelectedTarget(null);
      return;
    }

    enterDayDiscussion();
  };

  const getNextAfterMafia = () => {
    if (isDoctorEnabled) return 'night-doctor';
    if (isDetectiveEnabled) return 'night-detective';
    return 'day-discussion';
  };

  const getNextAfterDoctor = () => {
    if (isDetectiveEnabled) return 'night-detective';
    return 'day-discussion';
  };

  const getCurrentRoleHolder = (role) => {
    const player = activePlayers.find((candidate) => roles[candidate.id] === role && !eliminatedPlayers.includes(candidate.id));
    return player || null;
  };

  const handleConfirmMafiaKill = () => {
    if (!selectedTarget) return;
    setNightResults((current) => ({
      ...current,
      killed: selectedTarget,
      saved: current.saved && current.saved === selectedTarget ? current.saved : current.saved
    }));
    setSelectedTarget(null);
    setPhase(getNextAfterMafia());
  };

  const handleConfirmDoctorSave = () => {
    setNightResults((current) => ({
      ...current,
      saved: selectedTarget
    }));
    setSelectedTarget(null);
    setPhase(getNextAfterDoctor());
  };

  const handleNoSave = () => {
    setNightResults((current) => ({
      ...current,
      saved: null
    }));
    setSelectedTarget(null);
    setPhase(getNextAfterDoctor());
  };

  const handleConfirmInvestigation = () => {
    if (!selectedTarget) return;
    setNightResults((current) => ({
      ...current,
      investigated: {
        targetId: selectedTarget,
        isMafia: roles[selectedTarget] === 'mafia'
      }
    }));
    setShowDetectiveResult(true);
  };

  const handleContinueAfterInvestigation = () => {
    setShowDetectiveResult(false);
    setSelectedTarget(null);
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('day-discussion');
  };

  const handleStartVoting = () => {
    setPhase('day-vote');
    setSelectedTarget(null);
  };

  const handleConfirmDayVote = () => {
    if (!selectedTarget) return;

    const nextEliminatedPlayers = eliminatedPlayers.includes(selectedTarget)
      ? eliminatedPlayers
      : [...eliminatedPlayers, selectedTarget];

    setEliminatedPlayers(nextEliminatedPlayers);
    setSelectedTarget(null);

    const nextWinner = handleCheckWinner(nextEliminatedPlayers);
    if (nextWinner) return;

    setNightResults({ killed: null, saved: null, investigated: null });
    setNightReport({
      type: 'quiet',
      victimId: null,
      playerName: '',
      cause: '',
      note: 'The night passed quietly'
    });
    setPhase('night-eyes-closed');
    setEyesClosedNextPhase('night-mafia');
    setNightCount((current) => current + 1);
    setShowDetectiveResult(false);
  };

  const renderRoleRevealList = () => (
    <div className="space-y-3">
      {activePlayers.map((player) => {
        const hasSeenRole = revealedPlayers.includes(player.id);
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => revealPlayer(player.id)}
            disabled={hasSeenRole}
            className={`w-full flex items-center justify-between gap-3 rounded-xl p-3 border transition-all ${
              hasSeenRole
                ? 'bg-slate-800/40 border-slate-700 opacity-50 cursor-not-allowed'
                : 'bg-slate-800/70 border-slate-700 hover:bg-slate-700/70'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar player={player} sizeClass="w-10 h-10" textClass="text-sm" />
              <span className={`text-left font-medium truncate ${hasSeenRole ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {player.displayName}
              </span>
            </div>
            {hasSeenRole && (
              <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Seen</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderRoleRevealScreen = () => {
    if (roleRevealStep === 'pass-to-player' && selectedRevealPlayer) {
      return (
        <div className="min-h-screen bg-black p-6 flex items-center justify-center">
          <div className="w-full max-w-md text-center">
            <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-2xl">
              <p className="text-slate-300 text-sm font-mono uppercase tracking-[0.3em] mb-4">
                Pass the phone to
              </p>
              <h1 className="text-white text-4xl font-black mb-8">{selectedRevealPlayer.displayName}</h1>
              <button
                type="button"
                onClick={startRoleCard}
                className="w-full max-w-[18rem] mx-auto h-14 flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-colors"
              >
                I&apos;m ready
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (roleRevealStep === 'card' && selectedRevealPlayer) {
      const roleLabel = getRoleLabel(selectedRole);
      const displayedCard = isCardFlipped ? selectedRoleImage : cardBackImage;

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <h1 className="text-white text-2xl font-bold mb-6">For your eyes only</h1>

            <div className="mx-auto w-[200px] h-[280px]" style={{ perspective: '600px', WebkitPerspective: '600px' }}>
              <button
                type="button"
                onClick={handleRoleCardTap}
                className="relative w-full h-full"
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.3s ease',
                  transform: `rotateY(${isCardFlipped ? 180 : 0}deg)`
                }}
              >
                <div
                  className="absolute inset-0 rounded-2xl border border-white/20 object-cover shadow-2xl overflow-hidden"
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <img src={cardBackImage} alt="Mafia role card back" className="w-full h-full object-cover" />
                </div>
                <div
                  className="absolute inset-0 rounded-2xl border border-white/20 object-cover shadow-2xl overflow-hidden"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  <img src={selectedRoleImage} alt={`${roleLabel} role card`} className="w-full h-full object-cover" />
                </div>
              </button>
            </div>

            <p className="text-slate-300 text-sm mt-6">
              Tap the card to {isCardFlipped ? 'hide' : 'reveal'} the role.
            </p>
          </div>
        </div>
      );
    }

    if (roleRevealStep === 'pass-back' && selectedRevealPlayer) {
      return (
        <div className="min-h-screen bg-black p-6 flex items-center justify-center">
          <div className="w-full max-w-md text-center">
            <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-2xl">
              <p className="text-slate-300 text-sm font-mono uppercase tracking-[0.3em] mb-4">
                Pass the phone back to the group
              </p>
              <h1 className="text-white text-4xl font-black mb-8">Done</h1>
              <button
                type="button"
                onClick={finishRoleReveal}
                className="w-full max-w-[18rem] mx-auto h-14 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto flex flex-col gap-6">
          <div className="border-y border-slate-700 py-2 text-center">
            <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-slate-500">
              NARRATOR: {narratorName}
            </p>
          </div>

          <div className="text-center">
            <h1 className="text-white text-4xl font-black">Choose a player</h1>
            <p className="text-slate-400 text-sm mt-2">Each player will pass the phone, reveal their role, then hand it back.</p>
          </div>

          {renderRoleRevealList()}

          {allPlayersRevealed && (
            <button
              type="button"
              onClick={startNight}
              className="w-full max-w-[18rem] mx-auto h-14 flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-colors"
            >
              Start Night
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderNightEyesClosed = () => (
    <div className="min-h-screen bg-black p-6">
      <div className="w-full max-w-md mx-auto flex flex-col gap-6">
        <div className="border-y border-slate-700 py-2 text-center">
          <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-slate-500">
            NARRATOR: {narratorName}
          </p>
        </div>

        <div className="min-h-[58vh] flex items-center justify-center">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-4xl font-black">Everyone close your eyes</h1>
            <p className="mt-4 text-slate-300 font-mono text-[11px] uppercase tracking-[0.3em]">
              Mafia: {formatCommaNames(mafiaLiving)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={continueEyesClosed}
          className="w-full max-w-[18rem] mx-auto h-14 flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderSelectablePlayerRows = (candidatePlayers, selectedClass = 'bg-red-600 ring-2 ring-white') => (
    <div className="space-y-3">
      {candidatePlayers.map((player) => {
        const isSelected = selectedTarget === player.id;
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => setSelectedTarget(player.id)}
            className={`w-full flex items-center gap-3 rounded-xl p-4 transition-all ${
              isSelected ? selectedClass : 'bg-slate-800/50 hover:bg-slate-700'
            }`}
          >
            <Avatar player={player} sizeClass="w-12 h-12" textClass="text-base" />
            <span className="text-white font-semibold flex-1 text-left">{player.displayName}</span>
            <span
              className={`inline-flex h-6 w-6 items-center justify-center border-2 text-sm font-black ${
                isSelected ? 'bg-white text-slate-900 border-white' : 'bg-transparent border-slate-400 text-transparent'
              }`}
            >
              {isSelected ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderNightMafia = () => {
    const mafiaReminder = formatCommaNames(mafiaLiving);
    const candidates = alivePlayers.filter((player) => roles[player.id] !== 'mafia');

    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-red-950 p-6">
        <div className="w-full max-w-md mx-auto flex flex-col gap-6">
          <div className="text-center mb-2">
            <p className="text-red-300 font-mono text-4xl mb-2">Mafia, open your eyes</p>
            <h2 className="text-white text-xl font-semibold">Choose a player to eliminate</h2>
          </div>

          <div className="text-center border-y border-red-900/70 py-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-red-200/80">
              Mafia: {mafiaReminder}
            </p>
          </div>

          {renderSelectablePlayerRows(candidates, 'bg-red-600 ring-2 ring-white')}

          {selectedTarget && (
            <button
              type="button"
              onClick={handleConfirmMafiaKill}
              className="w-full bg-white hover:bg-slate-200 text-red-900 font-bold py-4 rounded-xl transition-colors"
            >
              Confirm Kill
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderNightDoctor = () => {
    const doctor = getCurrentRoleHolder('doctor');
    const candidates = alivePlayers;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-950 p-6">
        <div className="w-full max-w-md mx-auto flex flex-col gap-6">
          <div className="text-center mb-2">
            <p className="text-green-300 font-mono text-4xl mb-2">Doctor, open your eyes</p>
            <h2 className="text-white text-xl font-semibold">Choose who to save</h2>
          </div>

          <div className="text-center border-y border-green-900/70 py-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-green-200/80">
              Doctor: {doctor?.displayName || 'None'}
            </p>
          </div>

          {renderSelectablePlayerRows(candidates, 'bg-green-600 ring-2 ring-white')}

          <div className="flex flex-col gap-3">
            {selectedTarget && (
              <button
                type="button"
                onClick={handleConfirmDoctorSave}
                className="w-full bg-white hover:bg-slate-200 text-green-900 font-bold py-4 rounded-xl transition-colors"
              >
                Confirm Save
              </button>
            )}

            <button
              type="button"
              onClick={handleNoSave}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl transition-colors border border-white/20"
            >
              No Save
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNightDetective = () => {
    const detective = getCurrentRoleHolder('detective');
    const candidates = alivePlayers.filter((player) => roles[player.id] !== 'detective');
    const investigation = nightResults.investigated;
    const investigatedPlayer = investigation?.targetId ? activePlayers.find((player) => player.id === investigation.targetId) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 p-6">
        <div className="w-full max-w-md mx-auto flex flex-col gap-6">
          <div className="text-center mb-2">
            <p className="text-yellow-300 font-mono text-4xl mb-2">Detective, open your eyes</p>
            <h2 className="text-white text-xl font-semibold">Choose who to investigate</h2>
          </div>

          <div className="text-center border-y border-yellow-900/70 py-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-yellow-200/80">
              Detective: {detective?.displayName || 'None'}
            </p>
          </div>

          {!showDetectiveResult ? (
            <>
              {renderSelectablePlayerRows(candidates, 'bg-yellow-600 ring-2 ring-white')}
              {selectedTarget && (
                <button
                  type="button"
                  onClick={handleConfirmInvestigation}
                  className="w-full bg-white hover:bg-slate-200 text-yellow-900 font-bold py-4 rounded-xl transition-colors"
                >
                  Confirm Investigation
                </button>
              )}
            </>
          ) : (
            <div className="bg-yellow-950/50 border border-yellow-700 rounded-xl p-5 text-center shadow-xl">
              <p className="text-yellow-100 text-sm font-mono uppercase tracking-[0.3em] mb-2">Detective Report</p>
              <p className="text-white text-3xl font-black">
                {investigation?.isMafia
                  ? `${investigatedPlayer?.displayName || 'Target'} is Mafia`
                  : `${investigatedPlayer?.displayName || 'Target'} is Not Mafia`}
              </p>
              <button
                type="button"
                onClick={handleContinueAfterInvestigation}
                className="w-full mt-5 bg-white hover:bg-slate-200 text-yellow-900 font-bold py-4 rounded-xl transition-colors"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDayDiscussion = () => {
    const survivingPlayers = alivePlayers;
    const victim = nightReport.victimId ? activePlayers.find((player) => player.id === nightReport.victimId) : null;
    const savedPlayer = nightResults.saved ? activePlayers.find((player) => player.id === nightResults.saved) : null;
    const detectiveResult = nightResults.investigated;
    const detectiveTarget = detectiveResult?.targetId ? activePlayers.find((player) => player.id === detectiveResult.targetId) : null;
    const reportText = nightReport.type === 'quiet'
      ? 'The night passed quietly'
      : nightReport.note;

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#020817] via-[#0b1325] to-[#020817] p-6">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background: 'radial-gradient(circle at center, rgba(127, 29, 29, 0) 58%, rgba(127, 29, 29, 0.13) 100%)'
          }}
        />

        <div className="relative z-10 w-full max-w-md mx-auto flex flex-col gap-4">
          <div className="text-center border-y border-[#e8e0d0]/40 py-2 text-[#e8e0d0]">
            <p className="font-mono text-[11px] uppercase tracking-[0.35em]">NARRATOR: {narratorName}</p>
          </div>

          {victim && (
            <div className="relative overflow-hidden bg-[#e8dcc8] border border-[#c1ab89] rounded-xl p-5 text-left shadow-lg">
              <p className="font-mono text-[#3f3127] text-xs font-bold tracking-[0.2em]">INCIDENT REPORT</p>
              <div className="border-t border-[#665341] my-3" />
              <p className="font-mono text-[#2f241c] text-sm">
                {nightReport.type === 'save' ? 'PATIENT' : 'VICTIM'}: {victim.displayName}
              </p>

              {nightReport.type === 'kill' && nightReport.cause && (
                <p className="font-mono text-[#2f241c] text-sm mt-1">CAUSE: {nightReport.cause}</p>
              )}

              {nightReport.type === 'save' && nightReport.cause && (
                <p className="font-mono text-[#2f241c] text-sm mt-1">INTERVENTION: {nightReport.cause}</p>
              )}

              {detectiveResult && detectiveTarget && (
                <p className="font-mono text-[#2f241c] text-sm mt-1">
                  DETECTIVE CHECK: {detectiveTarget.displayName}
                </p>
              )}

              <p className="font-mono text-[#2f241c] text-sm mt-1">
                STATUS: {nightReport.type === 'save' ? 'ALIVE' : 'DECEASED'}
              </p>

              <p className="font-mono text-[#2f241c] text-sm mt-4 text-center">{reportText}</p>

              <div className="border-t border-[#665341] my-3" />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`border-4 px-4 py-1 text-3xl font-black uppercase tracking-widest opacity-60 ${
                    nightReport.type === 'save' ? 'border-green-900 text-green-900' : 'border-red-900 text-red-900'
                  }`}
                  style={{ transform: 'rotate(-15deg)' }}
                >
                  {nightReport.type === 'save' ? 'ALIVE' : 'DECEASED'}
                </div>
              </div>
            </div>
          )}

          {!victim && nightReport.type === 'quiet' && (
            <div className="bg-[#0b1325] border border-[#334258] rounded-xl p-5 text-[#f0e5cf] shadow-lg text-center">
              <h2 className="font-serif text-2xl font-black uppercase tracking-wide">THE MORNING AFTER</h2>
              <div className="border-t border-[#f0e5cf]/60 my-2" />
              <p className="font-serif text-3xl font-black">The night passed quietly</p>
            </div>
          )}

          {victim && (
            <div
              className="bg-[#0b1325] border border-[#334258] rounded-xl p-4 text-[#f0e5cf] shadow-lg"
              style={{ transform: 'rotate(-1deg)' }}
            >
              <h2 className="font-serif text-2xl font-black uppercase tracking-wide">THE MORNING AFTER</h2>
              <div className="border-t border-[#f0e5cf]/60 my-2" />
              <p className="font-serif text-4xl font-black">{nightReport.type === 'save' ? 'Everyone breathes easier' : 'A quiet morning'}</p>
            </div>
          )}

          <div className="bg-[#0f1a2f] border border-[#334258] rounded-xl p-4 shadow-lg">
            <SectionLabel>Suspects</SectionLabel>
            <div className="border-t border-red-700/70 mt-2 mb-3" />
            <div className="space-y-2">
              {survivingPlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 bg-[#16233b] border border-[#334258] rounded-lg p-3"
                >
                  <Avatar player={player} sizeClass="w-10 h-10" textClass="text-sm" />
                  <span className="text-[#e7dbc6] font-mono">{player.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartVoting}
            className="w-full border-2 border-[#e7dbc6] bg-[#0f1a2f] hover:bg-[#16233b] text-[#f2e8d3] font-black uppercase tracking-wide py-3 rounded-md transition-colors"
          >
            Start Voting
          </button>
        </div>
      </div>
    );
  };

  const renderDayVote = () => {
    const ballotCandidates = alivePlayers;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="relative bg-[#f5f0e8] border-2 border-[#bfae95] rounded-xl p-4 shadow-[0_8px_24px_rgba(0,0,0,0.3)] text-[#3f3127] overflow-hidden">
            <div className="text-center mb-4">
              <h3 className="font-serif text-[#3f3127] text-2xl font-black uppercase tracking-wide">OFFICIAL BALLOT</h3>
              <p className="mt-1 text-sm italic text-[#5a4837]">Cast your vote - mark one candidate</p>
              <div className="border-t border-[#5a4837] mt-3" />
            </div>

            <div className="mb-4 overflow-hidden rounded-lg border border-[#ccbda6] bg-[#f8f3ea]">
              {ballotCandidates.map((player, index) => {
                const isSelected = selectedTarget === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedTarget(player.id)}
                    className={`w-full text-left px-3 py-3 transition-colors ${
                      index > 0 ? 'border-t border-[#d5c7b2]' : ''
                    } ${isSelected ? 'bg-[#eadfcf]' : 'bg-[#f8f3ea]'} hover:bg-[#efe3cf]`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center border-2 text-sm font-black ${
                          isSelected
                            ? 'bg-[#3f3127] border-[#3f3127] text-[#f5f0e8]'
                            : 'bg-[#fdfaf3] border-[#5a4837] text-transparent'
                        }`}
                      >
                        {isSelected ? '✓' : ''}
                      </span>

                      <Avatar player={player} sizeClass="w-11 h-11" textClass="text-sm" />

                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <span className="text-[#2f241c] font-mono font-semibold truncate">
                          {player.displayName}
                        </span>
                        <span className="inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-[#3f3127] text-[#f5f0e8] text-sm font-bold">
                          0
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleConfirmDayVote}
              disabled={!selectedTarget}
              className="w-full border-2 border-[#4a3a2b] bg-[#f5f0e8] hover:bg-[#ece1cf] disabled:bg-[#ddd2c2] text-[#3f3127] disabled:text-[#867a6b] font-black uppercase tracking-[0.16em] py-3 rounded-md shadow-[0_3px_0_#4a3a2b] active:translate-y-[2px] active:shadow-none transition-all"
            >
              CONFIRM VOTE
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEndedScreen = () => {
    const townWon = winner === 'town';
    const mafiaCount = activePlayers.filter((player) => roles[player.id] === 'mafia').length;
    const eliminatedCount = eliminatedPlayers.length;
    const rightMetaText = `ELIMINATED: ${eliminatedCount}`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8 text-[#e8e0d0]" style={{ fontFamily: 'serif' }}>
            <div className="border-t-2 border-[#e8e0d0]/40 mb-2" style={{ fontSize: '1px' }} />
            <div className="flex items-center justify-between py-1 mb-2 text-[15px] leading-none">
              <span className="font-mono tracking-wider">MAFIAS: {mafiaCount}</span>
              <span className="font-mono text-center flex-1">THE GAMES NIGHT GAZETTE</span>
              <span className="font-mono tracking-wider">{rightMetaText}</span>
            </div>
            <div className="border-t-2 border-[#e8e0d0]/60" style={{ marginBottom: '2px' }} />
            <div className="border-t border-[#e8e0d0]/40 mb-4" />

            <h1
              className="font-black uppercase text-center mb-2"
              style={{
                fontSize: '3rem',
                letterSpacing: '0.1em',
                lineHeight: '1.1',
                fontFamily: "'Playfair Display', 'Georgia', serif",
                fontWeight: 900
              }}
            >
              {townWon ? 'TOWN TRIUMPHS' : 'MAFIA REIGNS'}
            </h1>

            <p
              className="text-center italic mb-4"
              style={{
                fontSize: '14px',
                fontFamily: "'Georgia', serif",
                lineHeight: '1.4'
              }}
            >
              {townWon
                ? 'Mafia members identified and removed from the village'
                : 'Civilians deceived as mafia seizes control of the village'}
            </p>

            <div className="border-t border-[#e8e0d0]/40" />
          </div>

          <div className="relative overflow-hidden rounded-xl p-5 mb-6 text-left shadow-lg" style={{ backgroundColor: '#d4b483', border: '1px solid #8b6b3f' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono font-bold uppercase tracking-widest text-sm" style={{ color: '#3a2a1a' }}>
                CASE:
              </span>
              <CardStamp text="CLOSED" tone={townWon ? 'town' : 'mafia'} />
            </div>

            <div style={{ height: '1px', backgroundColor: '#4a3622', marginBottom: '16px', opacity: '0.45' }} />

            <div style={{ backgroundColor: '#eadfca', border: '1px solid #8b6b3f', borderRadius: '8px', padding: '16px' }}>
              <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">
                AGENTS ASSIGNED: {activePlayers.length}
              </p>
              <div className="border-t border-[#8b6b3f]/40 mb-3" />
              <div>
                {activePlayers.map((player, index) => {
                  const eliminatedRound = eliminatedPlayers.indexOf(player.id) + 1;
                  const survivedRounds = eliminatedRound > 0 ? Math.min(nightCount, eliminatedRound) : nightCount;
                  const roundsLabel = `Rounds: ${survivedRounds}`;
                  const roleRoundsColor = getRoleStampStyle(roles[player.id] || 'civilian').color;
                  const isEliminated = eliminatedPlayers.includes(player.id);

                  return (
                    <div key={player.id}>
                      <div
                        className="relative flex items-center justify-between py-3"
                        style={{ backgroundColor: index % 2 === 0 ? 'transparent' : '#f3ead8/40' }}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar player={player} sizeClass="w-8 h-8" textClass="text-xs" />
                          <span
                            className={`font-mono font-semibold uppercase ${isEliminated ? 'line-through opacity-60' : ''}`}
                            style={{ color: '#2f2418', fontSize: '14px' }}
                          >
                            {player.displayName}
                            <span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'monospace', color: roleRoundsColor }}>
                              {roundsLabel}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CardStamp text={getRoleLabel(roles[player.id] || 'civilian')} tone={roles[player.id] || 'civilian'} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={resetGame}
              className="w-full border-2 border-[#e7dbc6] bg-[#0f1a2f] hover:bg-[#16233b] text-[#f2e8d3] font-black uppercase tracking-wide py-3 rounded-md transition-colors"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={handleReturnToPassPlay}
              className="w-full border-2 border-[#e7dbc6] bg-[#0f1a2f] hover:bg-[#16233b] text-[#f2e8d3] font-black uppercase tracking-wide py-3 rounded-md transition-colors"
            >
              Return to Pass &amp; Play
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (phase === 'ended') {
    return renderEndedScreen();
  }

  if (phase === 'role-reveal') {
    return renderRoleRevealScreen();
  }

  if (phase === 'night-eyes-closed') {
    return renderNightEyesClosed();
  }

  if (phase === 'night-mafia') {
    return renderNightMafia();
  }

  if (phase === 'night-doctor') {
    return renderNightDoctor();
  }

  if (phase === 'night-detective') {
    return renderNightDetective();
  }

  if (phase === 'day-discussion') {
    return renderDayDiscussion();
  }

  if (phase === 'day-vote') {
    return renderDayVote();
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center text-white">
        <p className="text-xl font-bold">Mafia game unavailable</p>
        <button
          type="button"
          onClick={handleReturnToPassPlay}
          className="mt-4 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 font-bold"
        >
          Return to Pass &amp; Play
        </button>
      </div>
    </div>
  );
}

export default OnePhoneMafia;
