import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import LOCATIONS from '../spyfall/locations';

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

    // Random first asker
    const firstAsker = playersToAssign[Math.floor(Math.random() * playersToAssign.length)];

    await updateDoc(roomRef, {
      'activeActivity.phase': 'location-reveal',
      'activeActivity.location': locationName,
      'activeActivity.rules': finalRules,
      'activeActivity.spyIds': spyIds,
      'activeActivity.eliminatedSpyIds': [],
      'activeActivity.players': playersWithRoles,
      'activeActivity.currentAskerId': firstAsker.uid,
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

  const RulesModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-white text-lg font-bold mb-6">Game Rules</h3>
        <div className="space-y-4">
          {/* Spy count */}
          <div>
            <label className="text-white font-semibold block mb-2 text-sm">Number of Spies</label>
            <input
              type="text"
              inputMode="numeric"
              value={editRules.spyCount}
              onChange={(e) => {
                setEditRules({ ...editRules, spyCount: e.target.value });
                setSpyCountError('');
              }}
              placeholder="Enter number"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500"
            />
            {spyCountError && <p className="text-red-400 text-sm mt-2">{spyCountError}</p>}
          </div>

          {/* Show roles */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-semibold text-sm">Show Roles 🎭</label>
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

          {/* Discussion time */}
          <div>
            <label className="text-white font-semibold block mb-2 text-sm">Discussion Time</label>
            <select
              value={editRules.discussionTime}
              onChange={(e) => setEditRules({ ...editRules, discussionTime: parseInt(e.target.value) })}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
            >
              <option value={5}>5 minutes</option>
              <option value={8}>8 minutes</option>
              <option value={10}>10 minutes</option>
            </select>
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
    <div className="bg-indigo-900/50 border border-indigo-700 rounded-lg p-4 mb-4">
      <h4 className="text-white font-semibold mb-3 text-sm">Players Joined ({lobbyPlayers.length})</h4>
      <div className="space-y-2">
        {allPlayers.filter((p) => lobbyPlayers.includes(p.uid)).map((player) => {
          const photo = getLobbyPlayerPhoto(player.uid) || player.photoURL || player.photo || null;
          return (
            <div key={player.uid} className="flex items-center gap-3 bg-indigo-800/50 rounded-lg px-3 py-2">
              {photo ? (
                <img src={photo} alt={player.displayName} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className={`w-8 h-8 ${player.avatarColor} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                  {getInitials(player.displayName)}
                </div>
              )}
              <span className="text-white text-sm font-medium">{player.displayName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isHost) {
    return (
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-left shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">🕵️</div>
          <div>
            <h3 className="text-white font-bold text-lg">Spyfall Lobby</h3>
            <p className="text-indigo-100 text-sm">Configure &amp; wait for players</p>
          </div>
        </div>

        <PlayerList />

        <div className="space-y-3">
          <button
            onClick={() => setShowRulesEdit(true)}
            className="w-full bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            Edit Rules
          </button>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className="w-full bg-gradient-to-r from-white to-slate-200 hover:from-slate-100 hover:to-slate-300 disabled:from-slate-600 disabled:to-slate-600 text-indigo-700 disabled:text-slate-400 font-bold py-2 rounded-lg transition-colors"
          >
            {canStart ? `Start Game (${lobbyPlayers.length})` : `Need 3+ (${lobbyPlayers.length})`}
          </button>
          <button
            onClick={handleCancelGame}
            className="w-full bg-indigo-800 hover:bg-indigo-900 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </div>

        {showRulesEdit && <RulesModal />}
      </div>
    );
  }

  // Player view
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-left shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl">🕵️</div>
        <div>
          <h3 className="text-white font-bold text-lg">Spyfall Lobby</h3>
          <p className="text-indigo-100 text-sm">{hasJoined ? "You've joined!" : 'Ready to join?'}</p>
        </div>
      </div>

      <PlayerList />

      {hasJoined ? (
        <button
          onClick={handleSpectate}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Spectate
        </button>
      ) : isSpectating ? (
        <button
          onClick={handleJoinFromSpectate}
          className="w-full bg-white hover:bg-slate-100 text-indigo-700 font-bold py-2 rounded-lg transition-colors"
        >
          Join Game
        </button>
      ) : (
        <button
          onClick={handleJoinLobby}
          className="w-full bg-white hover:bg-slate-100 text-indigo-700 font-bold py-2 rounded-lg transition-colors"
        >
          Join Lobby
        </button>
      )}
    </div>
  );
}
