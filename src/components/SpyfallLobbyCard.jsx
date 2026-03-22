import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import LOCATIONS from '../spyfall/locations';
import AnimatedNumberStepper from './AnimatedNumberStepper';

export default function SpyfallLobbyCard({
  lobbyState,
  roomPlayers,
  userId,
  roomId,
  navigate,
  isHost,
  rules,
  setRules,
  showRulesModal,
  setShowRulesModal,
}) {
  const lobbyPlayers = lobbyState?.lobbyPlayers || [];
  const allPlayers = lobbyState?.players || [];
  const roomPlayersByUid = new Map((roomPlayers || []).map((p) => [p.id, p]));

  const getLobbyPlayerPhoto = (uid) => {
    const rp = roomPlayersByUid.get(uid);
    return rp?.photo || null;
  };

  const gameRules = lobbyState?.rules || rules;
  const [showRulesEdit, setShowRulesEdit] = useState(showRulesModal || false);
  const [editRules, setEditRules] = useState({
    spyCount: String(gameRules?.spyCount || '1'),
    showRoles: gameRules?.showRoles !== false,
    discussionTime: gameRules?.discussionTime || 8,
  });
  const [spyCountError, setSpyCountError] = useState('');

  useEffect(() => {
    if (showRulesEdit) {
      setEditRules({
        spyCount: String(gameRules?.spyCount || '1'),
        showRoles: gameRules?.showRoles !== false,
        discussionTime: gameRules?.discussionTime || 8,
      });
      setSpyCountError('');
    }
  }, [showRulesEdit]);

  const handleJoinLobby = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    if (!lobbyPlayers.includes(userId)) {
      await updateDoc(roomRef, {
        'activeActivity.lobbyPlayers': arrayUnion(userId),
        lastActivity: serverTimestamp(),
      });
    }
  };

  const handleLeaveLobby = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.lobbyPlayers': arrayRemove(userId),
      lastActivity: serverTimestamp(),
    });
  };

  const validateSpyCount = (spyCountStr, totalPlayers) => {
    const spyCount = parseInt(spyCountStr, 10);
    if (isNaN(spyCount) || spyCount < 1) return { error: 'Number of spies must be at least 1', value: null };
    const maxAllowed = Math.max(1, Math.floor(totalPlayers * 0.25));
    if (spyCount > maxAllowed) {
      return { error: `Too many spies! With ${totalPlayers} players you can have a maximum of ${maxAllowed} spy(s)`, value: null };
    }
    return { error: null, value: spyCount };
  };

  const handleStartGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) return;

    const currentRoom = roomDoc.data();
    const currentActivity = currentRoom.activeActivity || {};
    const latestLobbyPlayers = Array.isArray(currentActivity.lobbyPlayers) ? currentActivity.lobbyPlayers : [];
    const latestGamePlayers = Array.isArray(currentActivity.players) ? currentActivity.players : allPlayers;

    if (latestLobbyPlayers.length < 3) {
      alert(`Need at least 3 players to start (${latestLobbyPlayers.length})`);
      return;
    }

    const { error, value: spyCount } = validateSpyCount(editRules.spyCount, latestLobbyPlayers.length);
    if (error) {
      alert(error);
      return;
    }

    const roomPlayersRaw = Array.isArray(currentRoom.players) ? currentRoom.players : [];
    const roomPlayersById = new Map(roomPlayersRaw.map((p) => [p.id, p]));
    const latestGamePlayersById = new Map(latestGamePlayers.map((p) => [p.uid, p]));

    const playersToAssign = latestLobbyPlayers
      .map((playerId) => {
        const existing = latestGamePlayersById.get(playerId);
        if (existing) {
          return {
            uid: existing.uid,
            displayName: existing.displayName,
            avatarColor: existing.avatarColor || getAvatarColor({ id: existing.uid, displayName: existing.displayName }, roomId),
          };
        }
        const rp = roomPlayersById.get(playerId);
        if (!rp) return null;
        return {
          uid: rp.id,
          displayName: rp.displayNameForGame || rp.displayName,
          avatarColor: rp.avatarColor || getAvatarColor(rp, roomId),
        };
      })
      .filter(Boolean);

    if (playersToAssign.length < 3) {
      alert('Need at least 3 players to start');
      return;
    }

    // Pick random location
    const locationData = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const locationName = locationData.name;

    // Shuffle players, pick spies
    const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
    const spyIds = shuffled.slice(0, spyCount).map((p) => p.uid);

    // Assign roles to non-spies (cycling if needed)
    const roles = locationData.roles;
    const finalRules = {
      spyCount,
      showRoles: editRules.showRoles,
      discussionTime: editRules.discussionTime,
    };

    const playersWithRoles = playersToAssign.map((player, index) => {
      if (spyIds.includes(player.uid)) {
        return { ...player, role: null };
      }
      // Assign roles only to non-spies — cycle through roles list
      const nonSpyIndex = playersToAssign
        .filter((p) => !spyIds.includes(p.uid))
        .findIndex((p) => p.uid === player.uid);
      const role = finalRules.showRoles ? roles[nonSpyIndex % roles.length] : null;
      return { ...player, role };
    });

    await updateDoc(roomRef, {
      'activeActivity.phase': 'location-reveal',
      'activeActivity.location': locationName,
      'activeActivity.rules': finalRules,
      'activeActivity.spyIds': spyIds,
      'activeActivity.eliminatedSpyIds': [],
      'activeActivity.players': playersWithRoles,
      'activeActivity.currentAskerId': null,
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.spyGuessing': null,
      'activeActivity.winner': null,
      'activeActivity.roundNumber': 1,
      'activeActivity.phaseStartedAt': null,
      lastActivity: serverTimestamp(),
    });

    navigate(`/room/${roomId}/games/spyfall`);
  };

  const handleSaveRules = async () => {
    if (!isHost) return;
    setSpyCountError('');

    const { error, value: spyCount } = validateSpyCount(editRules.spyCount, lobbyPlayers.length);
    if (error) {
      setSpyCountError(error);
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.rules': {
        spyCount,
        showRoles: editRules.showRoles,
        discussionTime: editRules.discussionTime,
      },
      lastActivity: serverTimestamp(),
    });
    setShowRulesEdit(false);
  };

  const handleCancelGame = async () => {
    if (!isHost) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp(),
    });
  };

  const spectators = lobbyState?.spectators || [];
  const isSpectating = spectators.includes(userId);
  const hasJoined = lobbyPlayers.includes(userId);
  const canStart = lobbyPlayers.length >= 3;

  const handleSpectate = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.lobbyPlayers': arrayRemove(userId),
      'activeActivity.spectators': arrayUnion(userId),
      lastActivity: serverTimestamp(),
    });
  };

  const handleJoinFromSpectate = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.spectators': arrayRemove(userId),
      'activeActivity.lobbyPlayers': arrayUnion(userId),
      lastActivity: serverTimestamp(),
    });
  };

  const joinedPlayers = allPlayers.filter((player) => lobbyPlayers.includes(player.uid));
  const maxStepperCount = Math.max(1, Math.floor(lobbyPlayers.length * 0.25));
  const formatMinutes = (value) => `${value} min`;
  const dossierCardClass = 'relative overflow-hidden bg-[#d4b483] border border-[#8b6b3f] rounded-2xl p-5 text-left shadow-xl';
  const stampButtonClass = 'w-full bg-[#efe4cc]/90 hover:bg-[#f5ecd9] text-[#3a2a1a] border-2 border-dashed border-[#4a3622] font-mono uppercase tracking-widest font-semibold py-2.5 rounded-md transition-colors text-xs';
  const startEnabledClass = 'w-full bg-[#f7ecd8] hover:bg-[#fbf3e4] text-red-700 border-2 border-red-700 font-mono uppercase tracking-widest font-black py-3 rounded-md transition-colors text-xs';
  const startDisabledClass = 'w-full bg-[#d8cbb2] text-[#8f8676] border-2 border-[#a79a85] font-mono uppercase tracking-widest font-bold py-3 rounded-md cursor-not-allowed text-xs';

  const renderDossierHeader = () => (
    <div className="relative z-10 mb-4">
      <div className="inline-block -rotate-3 border-2 border-red-700 text-red-700 font-serif font-black uppercase tracking-[0.22em] text-[11px] px-3 py-1 mb-3">
        Case File
      </div>
      <p className="text-[#2f2418] font-mono font-bold uppercase tracking-widest text-sm">CASE: SPYFALL</p>
      <div className="mt-3 h-px bg-[#4a3622]/45" />
    </div>
  );

  const RulesModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>
        <div className="space-y-4">
          {/* Spy count */}
          <div>
            <label className="text-white font-semibold block mb-2 text-sm text-center">Number of Spies</label>
            <AnimatedNumberStepper
              value={parseInt(editRules.spyCount, 10) || 1}
              min={1}
              max={maxStepperCount}
              valueWidthClass="w-16"
              onChange={(nextValue) => {
                setEditRules({ ...editRules, spyCount: String(nextValue) });
                setSpyCountError('');
              }}
            />
            {spyCountError && <p className="text-red-400 text-sm mt-2">{spyCountError}</p>}
          </div>

          {/* Discussion time */}
          <div>
            <label className="text-white font-semibold block mb-2 text-sm text-center">Discussion Time</label>
            <AnimatedNumberStepper
              value={editRules.discussionTime}
              min={1}
              max={10}
              valueWidthClass="w-28"
              formatValue={formatMinutes}
              onChange={(nextValue) => setEditRules({ ...editRules, discussionTime: nextValue })}
            />
          </div>

          {/* Show roles */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-semibold text-sm">Show Roles</label>
                <p className="text-slate-400 text-xs">Non-spy players see their role at the location</p>
              </div>
              <button
                onClick={() => setEditRules({ ...editRules, showRoles: !editRules.showRoles })}
                className={`w-12 h-7 rounded-full transition-colors ${editRules.showRoles ? 'bg-indigo-600' : 'bg-slate-600'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${editRules.showRoles ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
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
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  const PlayerList = () => (
    <div className="relative z-10 bg-[#eadfca]/85 border border-[#8b6b3f]/45 rounded-xl p-4 mb-4">
      <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">
        Agents Assigned: ({lobbyPlayers.length})
      </p>
      <div className="space-y-2">
        {joinedPlayers.map((player) => {
          const photo = getLobbyPlayerPhoto(player.uid) || player.photo || player.photoURL || null;
          return (
            <div key={player.uid} className="flex items-center gap-3 border border-[#8b6b3f]/35 bg-[#f3ead8]/80 rounded-md px-3 py-2">
              {photo ? (
                <img src={photo} alt={player.displayName} className="w-8 h-8 rounded-full object-cover border border-[#4a3622]" />
              ) : (
                <div className={`w-8 h-8 ${player.avatarColor} rounded-full border border-[#4a3622] flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(player.displayName)}
                </div>
              )}
              <span className="text-[#2f2418] text-sm font-mono uppercase tracking-wide font-bold">{player.displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isHost) {
    return (
      <div className={dossierCardClass}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
            Confidential
          </span>
        </div>

        {renderDossierHeader()}

        <PlayerList />

        <div className="relative z-10 space-y-3">
          <button
            onClick={() => setShowRulesEdit(true)}
            className={stampButtonClass}
          >
            Edit Rules
          </button>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={canStart ? startEnabledClass : startDisabledClass}
          >
            {canStart ? `Start Game (${lobbyPlayers.length})` : `Need 3+ (${lobbyPlayers.length})`}
          </button>
        </div>

        {showRulesEdit && <RulesModal />}
      </div>
    );
  }

  // Player view
  return (
    <div className={dossierCardClass}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="-rotate-[20deg] text-[#3a2a1a]/10 text-5xl font-black uppercase tracking-[0.28em] whitespace-nowrap select-none">
          Confidential
        </span>
      </div>

      {renderDossierHeader()}

      <PlayerList />

      {hasJoined ? (
        <button
          onClick={handleSpectate}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Spectate
        </button>
      ) : isSpectating ? (
        <button
          onClick={handleJoinFromSpectate}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Join Game
        </button>
      ) : (
        <button
          onClick={handleJoinLobby}
          className={`relative z-10 ${stampButtonClass}`}
        >
          Join Lobby
        </button>
      )}
    </div>
  );
}
