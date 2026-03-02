import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { useMafiaSound } from '../hooks/useMafiaSound';

export default function MafiaGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room, isHost } = useRoom(roomId, user?.id, user?.displayName, user?.avatar || null);
  
  const [gameState, setGameState] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const roleTimerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const { playShh, playMurder, playAngelic, playDetective, playWaking } = useMafiaSound();

  // Rules form state
  const [rules, setRules] = useState({
    narrator: false,
    mafiaCount: 1,
    doctor: true,
    detective: true,
    discussionTime: 3,
    votingTime: 1
  });
  const [selectingNarrator, setSelectingNarrator] = useState(false);
  const [selectedNarrator, setSelectedNarrator] = useState(null);
  const activeRules = gameState?.rules || rules;

  const getCurrentPlayer = () => gameState?.players?.find((player) => player.uid === user?.id);

  const isCurrentUserAlive = () => {
    const currentPlayer = getCurrentPlayer();
    return Boolean(currentPlayer && currentPlayer.isAlive);
  };

  const getLivingNonNarrators = (players = gameState?.players || []) => {
    return players.filter((player) => player.isAlive && player.role !== 'narrator');
  };

  const getWinnerFromPlayers = (players) => {
    const livingMafia = players.filter((player) => player.role === 'mafia' && player.isAlive).length;
    const livingInnocent = players.filter((player) => player.role !== 'mafia' && player.role !== 'narrator' && player.isAlive).length;

    if (livingMafia === 0) return 'town';
    if (livingMafia >= livingInnocent) return 'mafia';
    return null;
  };

  // Subscribe to game state
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.activeActivity && data.activeActivity.type === 'mafia') {
          setGameState(data.activeActivity);
        } else {
          setGameState(null);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Set my role when game state changes
  useEffect(() => {
    if (gameState && gameState.players && user) {
      const myPlayer = gameState.players.find(p => p.uid === user.id);
      if (myPlayer) {
        setMyRole(myPlayer.role);
      }
    }
  }, [gameState, user]);

  // Host auto-advances discussion if all living players voted to skip
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'day-discussion') return;

    const livingUids = getLivingNonNarrators().map((player) => player.uid);
    const skipVotes = gameState.skipVotes || [];

    if (livingUids.length > 0 && livingUids.every((uid) => skipVotes.includes(uid))) {
      const roomRef = doc(db, 'rooms', roomId);
      startDayVotePhase(roomRef);
    }
  }, [isHost, gameState?.phase, gameState?.skipVotes, gameState?.players, roomId]);

  // Handle phase timer countdown
  useEffect(() => {
    if (!gameState || !gameState.phaseEndsAt) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const endsAt = gameState.phaseEndsAt.toMillis ? gameState.phaseEndsAt.toMillis() : gameState.phaseEndsAt;
      const remaining = Math.max(0, Math.floor((endsAt - now) / 1000));
      setTimeLeft(remaining);

      // Only host auto-advances phases
      if (isHost && remaining <= 0) {
        handlePhaseTimeout();
      }
    };

    updateTimer();
    phaseTimerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
      }
    };
  }, [gameState, isHost]);

  // Reset confirmed status when phase changes
  useEffect(() => {
    if (gameState) {
      setHasConfirmed(gameState.confirmedVotes?.includes(user?.id) || false);
      if (gameState.phase === 'night-mafia' || gameState.phase === 'night-doctor' || 
          gameState.phase === 'night-detective' || gameState.phase === 'day-vote') {
        setSelectedPlayer(gameState.nightVotes?.[user?.id] || gameState.dayVotes?.[user?.id] || null);
      } else {
        setSelectedPlayer(null);
      }
    }
  }, [gameState?.phase]);

  const handlePhaseTimeout = async () => {
    if (!isHost || !gameState) return;

    const roomRef = doc(db, 'rooms', roomId);

    switch (gameState.phase) {
      case 'night-mafia':
        await advanceFromMafiaPhase(roomRef);
        break;
      case 'night-eyes-closed-2':
        if (activeRules.doctor) {
          await startDoctorPhase(roomRef);
        } else if (activeRules.detective) {
          await startDetectivePhase(roomRef);
        } else {
          await startDayPhase(roomRef);
        }
        break;
      case 'night-doctor':
        await advanceFromDoctorPhase(roomRef);
        break;
      case 'night-eyes-closed-3':
        if (activeRules.detective) {
          await startDetectivePhase(roomRef);
        } else {
          await startDayPhase(roomRef);
        }
        break;
      case 'night-detective':
        await advanceFromDetectivePhase(roomRef);
        break;
      case 'night-detective-result':
        await startDayPhase(roomRef);
        break;
      case 'day-discussion':
        await startDayVotePhase(roomRef);
        break;
      case 'day-vote':
        await processVoteAndCheckWin(roomRef);
        break;
    }
  };

  const handleStartLobby = async () => {
    if (!isHost) return;

    const roomRef = doc(db, 'rooms', roomId);
    const now = Date.now();

    await updateDoc(roomRef, {
      activeActivity: {
        type: 'mafia',
        phase: 'lobby',
        rules,
        players: [],
        narratorUid: null,
        pendingVictim: null,
        doctorSave: null,
        detectiveResult: null,
        nightVotes: {},
        dayVotes: {},
        skipVotes: [],
        confirmedVotes: [],
        lastEliminated: null,
        lastSaved: null,
        winner: null,
        phaseEndsAt: null,
        roundNumber: 1,
        createdAt: now
      },
      lastActivity: serverTimestamp()
    });
  };

  const handleJoinLobby = async () => {
    if (!gameState || !user || !room) return;

    // Check if already joined
    if (gameState.players.some(p => p.uid === user.id)) return;

    const roomRef = doc(db, 'rooms', roomId);
    const playerData = room.players.find(p => p.id === user.id);

    const newPlayer = {
      uid: user.id,
      displayName: playerData?.displayNameForGame || user.displayName,
      role: null,
      isAlive: true,
      avatarColor: playerData?.avatarColor || getAvatarColor({ id: user.id })
    };

    const updatedPlayers = [...gameState.players, newPlayer];

    await updateDoc(roomRef, {
      'activeActivity.players': updatedPlayers,
      lastActivity: serverTimestamp()
    });
  };

  const handleEditRules = () => {
    // Go back to setup phase
    setGameState(null);
  };

  const handleStartGame = async () => {
    if (!isHost || !gameState) return;

    if (gameState.players.length < 4) {
      alert('Need at least 4 players to start');
      return;
    }

    // If narrator is enabled, show narrator selection
    if (rules.narrator) {
      setSelectingNarrator(true);
    } else {
      await assignRolesAndStart();
    }
  };

  const handleConfirmNarrator = async () => {
    if (!selectedNarrator) return;
    await assignRolesAndStart(selectedNarrator);
  };

  const assignRolesAndStart = async (narratorUid = null) => {
    const roomRef = doc(db, 'rooms', roomId);
    const players = [...gameState.players];

    // Shuffle players
    const shuffled = players.sort(() => Math.random() - 0.5);
    
    let availablePlayers = narratorUid 
      ? shuffled.filter(p => p.uid !== narratorUid)
      : shuffled;

    // Assign narrator
    if (narratorUid) {
      const narrator = players.find(p => p.uid === narratorUid);
      narrator.role = 'narrator';
      narrator.isAlive = false; // Narrator doesn't participate
    }

    // Assign detective
    if (rules.detective && availablePlayers.length > 0) {
      availablePlayers[0].role = 'detective';
      availablePlayers = availablePlayers.slice(1);
    }

    // Assign doctor
    if (rules.doctor && availablePlayers.length > 0) {
      availablePlayers[0].role = 'doctor';
      availablePlayers = availablePlayers.slice(1);
    }

    // Assign mafia
    const mafiaCount = Math.min(rules.mafiaCount, availablePlayers.length);
    for (let i = 0; i < mafiaCount; i++) {
      if (availablePlayers[i]) {
        availablePlayers[i].role = 'mafia';
      }
    }

    // Assign civilians to remaining
    for (let i = mafiaCount; i < availablePlayers.length; i++) {
      availablePlayers[i].role = 'civilian';
    }

    await updateDoc(roomRef, {
      'activeActivity.phase': 'roles',
      'activeActivity.players': players,
      'activeActivity.narratorUid': narratorUid,
      lastActivity: serverTimestamp()
    });

    setSelectingNarrator(false);
  };

  const handleRevealRole = () => {
    setShowRole(true);
    playDetective();

    // Auto-hide after 30 seconds
    roleTimerRef.current = setTimeout(() => {
      setShowRole(false);
      // If everyone has seen roles, host advances
      if (isHost) {
        startNightPhase();
      }
    }, 30000);
  };

  const handleHideRole = () => {
    setShowRole(false);
    if (roleTimerRef.current) {
      clearTimeout(roleTimerRef.current);
    }
    // If host hides early, advance
    if (isHost) {
      startNightPhase();
    }
  };

  const startNightPhase = async () => {
    if (!isHost) return;
    
    const roomRef = doc(db, 'rooms', roomId);
    playShh();

    await updateDoc(roomRef, {
      'activeActivity.phase': 'night-eyes-closed',
      'activeActivity.phaseEndsAt': null,
      'activeActivity.nightVotes': {},
      'activeActivity.confirmedVotes': [],
      'activeActivity.pendingVictim': null,
      'activeActivity.doctorSave': null,
      'activeActivity.detectiveResult': null,
      lastActivity: serverTimestamp()
    });

    // After 3 seconds, advance to mafia turn
    setTimeout(async () => {
      const endsAt = Date.now() + 30000; // 30 second timer
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-mafia',
        'activeActivity.phaseEndsAt': endsAt,
        'activeActivity.confirmedVotes': [],
        'activeActivity.nightVotes': {},
        lastActivity: serverTimestamp()
      });
    }, 3000);
  };

  const handleVotePlayer = async (targetUid) => {
    if (!user || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;
    
    setSelectedPlayer(targetUid);
  };

  const handleConfirmVote = async () => {
    if (!user || !selectedPlayer || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;

    const roomRef = doc(db, 'rooms', roomId);
    const voteField = gameState.phase === 'day-vote' ? 'dayVotes' : 'nightVotes';
    const confirmedVotes = Array.from(new Set([...(gameState.confirmedVotes || []), user.id]));

    await updateDoc(roomRef, {
      [`activeActivity.${voteField}.${user.id}`]: selectedPlayer,
      'activeActivity.confirmedVotes': confirmedVotes,
      lastActivity: serverTimestamp()
    });

    setHasConfirmed(true);

    if (isHost && (gameState.phase === 'night-mafia' || gameState.phase === 'night-doctor')) {
      const activePlayerUids = getActivePlayers().map((player) => player.uid);
      const allConfirmed = activePlayerUids.length > 0 && activePlayerUids.every((uid) => confirmedVotes.includes(uid));

      if (allConfirmed) {
        if (gameState.phase === 'night-mafia') {
          await advanceFromMafiaPhase(roomRef, 5000);
        } else if (gameState.phase === 'night-doctor') {
          await advanceFromDoctorPhase(roomRef, 5000);
        }
        return;
      }
    }

    // Check if all active players have confirmed
    if (isHost) {
      checkAllConfirmed();
    }
  };

  const checkAllConfirmed = async () => {
    if (!isHost || !gameState) return;

    const roomRef = doc(db, 'rooms', roomId);
    const activePlayerUids = getActivePlayers().map(p => p.uid);
    const confirmed = gameState.confirmedVotes || [];

    if (activePlayerUids.every(uid => confirmed.includes(uid))) {
      // All confirmed, advance phase
      switch (gameState.phase) {
        case 'night-mafia':
          await advanceFromMafiaPhase(roomRef);
          break;
        case 'night-doctor':
          await advanceFromDoctorPhase(roomRef);
          break;
        case 'night-detective':
          await advanceFromDetectivePhase(roomRef);
          break;
        case 'day-vote':
          await processVoteAndCheckWin(roomRef);
          break;
      }
    }
  };

  const advanceFromMafiaPhase = async (roomRef, closeEyesMs = 2000) => {
    if (!isHost) return;

    // Count votes
    const votes = gameState.nightVotes || {};
    const voteCounts = {};
    Object.values(votes).forEach(targetUid => {
      voteCounts[targetUid] = (voteCounts[targetUid] || 0) + 1;
    });

    // Find most voted
    let maxVotes = 0;
    let victims = [];
    Object.entries(voteCounts).forEach(([uid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        victims = [uid];
      } else if (count === maxVotes) {
        victims.push(uid);
      }
    });

    // Random tiebreak
    const victim = victims.length > 0 ? victims[Math.floor(Math.random() * victims.length)] : null;

    playMurder();

    await updateDoc(roomRef, {
      'activeActivity.pendingVictim': victim,
      'activeActivity.phase': 'night-eyes-closed-2',
      'activeActivity.phaseEndsAt': Date.now() + closeEyesMs,
      'activeActivity.confirmedVotes': [],
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDoctorPhase = async (roomRef) => {
    const doctorPlayer = gameState.players.find(p => p.role === 'doctor');
    
    if (!doctorPlayer || !doctorPlayer.isAlive) {
      // Doctor is dead, run silent timer
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-doctor',
        'activeActivity.phaseEndsAt': Date.now() + 10000,
        lastActivity: serverTimestamp()
      });

    } else {
      // Doctor is alive
      playAngelic();
      
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-doctor',
        'activeActivity.phaseEndsAt': Date.now() + 30000,
        'activeActivity.confirmedVotes': [],
        lastActivity: serverTimestamp()
      });
    }
  };

  const advanceFromDoctorPhase = async (roomRef, closeEyesMs = 2000) => {
    if (!isHost) return;

    const doctorPlayer = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
    const save = doctorPlayer ? gameState.nightVotes?.[doctorPlayer.uid] : null;

    if (!doctorPlayer) {
      await updateDoc(roomRef, {
        'activeActivity.doctorSave': null,
        'activeActivity.confirmedVotes': [],
        'activeActivity.nightVotes': {},
        lastActivity: serverTimestamp()
      });

      if (activeRules.detective) {
        await startDetectivePhase(roomRef);
      } else {
        await startDayPhase(roomRef);
      }
      return;
    }

    await updateDoc(roomRef, {
      'activeActivity.doctorSave': save,
      'activeActivity.confirmedVotes': [],
      'activeActivity.phase': 'night-eyes-closed-3',
      'activeActivity.phaseEndsAt': Date.now() + closeEyesMs,
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDetectivePhase = async (roomRef) => {
    const detectivePlayer = gameState.players.find(p => p.role === 'detective');
    
    if (!detectivePlayer || !detectivePlayer.isAlive) {
      // Detective is dead, run silent timer
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-detective',
        'activeActivity.phaseEndsAt': Date.now() + 10000,
        lastActivity: serverTimestamp()
      });

    } else {
      // Detective is alive
      playDetective();
      
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-detective',
        'activeActivity.phaseEndsAt': Date.now() + 30000,
        'activeActivity.confirmedVotes': [],
        lastActivity: serverTimestamp()
      });
    }
  };

  const advanceFromDetectivePhase = async (roomRef) => {
    if (!isHost) return;

    const detectivePlayer = gameState.players.find(p => p.role === 'detective' && p.isAlive);
    const investigateUid = detectivePlayer ? gameState.nightVotes?.[detectivePlayer.uid] : null;
    
    let result = null;
    if (investigateUid) {
      const target = gameState.players.find(p => p.uid === investigateUid);
      result = {
        targetUid: investigateUid,
        targetName: target?.displayName,
        isMafia: target?.role === 'mafia'
      };
    }

    await updateDoc(roomRef, {
      'activeActivity.detectiveResult': result,
      'activeActivity.confirmedVotes': [],
      'activeActivity.phase': 'night-detective-result',
      'activeActivity.phaseEndsAt': Date.now() + 5000,
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDayPhase = async (roomRef) => {
    playWaking();

    const currentPlayers = [...(gameState?.players || [])];
    const pendingVictim = gameState?.pendingVictim || null;
    const doctorAlive = currentPlayers.some((player) => player.role === 'doctor' && player.isAlive);
    const isSaved = Boolean(activeRules.doctor && doctorAlive && pendingVictim && gameState?.doctorSave === pendingVictim);

    const updatedPlayers = currentPlayers.map((player) => {
      if (!pendingVictim || isSaved) return player;
      if (player.uid === pendingVictim) {
        return { ...player, isAlive: false };
      }
      return player;
    });

    const winner = getWinnerFromPlayers(updatedPlayers);
    if (winner) {
      await updateDoc(roomRef, {
        'activeActivity.players': updatedPlayers,
        'activeActivity.lastEliminated': !isSaved ? pendingVictim : null,
        'activeActivity.lastSaved': isSaved ? pendingVictim : null,
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.phaseEndsAt': null,
        lastActivity: serverTimestamp()
      });
      return;
    }

    const endsAt = Date.now() + (activeRules.discussionTime * 60 * 1000);

    await updateDoc(roomRef, {
      'activeActivity.phase': 'day-discussion',
      'activeActivity.phaseEndsAt': endsAt,
      'activeActivity.players': updatedPlayers,
      'activeActivity.lastEliminated': !isSaved ? pendingVictim : null,
      'activeActivity.lastSaved': isSaved ? pendingVictim : null,
      'activeActivity.skipVotes': [],
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDayVotePhase = async (roomRef) => {
    const endsAt = Date.now() + (activeRules.votingTime * 60 * 1000);
    
    await updateDoc(roomRef, {
      'activeActivity.phase': 'day-vote',
      'activeActivity.phaseEndsAt': endsAt,
      'activeActivity.dayVotes': {},
      'activeActivity.skipVotes': [],
      'activeActivity.confirmedVotes': [],
      lastActivity: serverTimestamp()
    });
  };

  const processVoteAndCheckWin = async (roomRef) => {
    if (!isHost) return;

    // Count votes
    const votes = gameState.dayVotes || {};
    const voteCounts = {};
    Object.values(votes).forEach(targetUid => {
      voteCounts[targetUid] = (voteCounts[targetUid] || 0) + 1;
    });

    // Find most voted
    let maxVotes = 0;
    let candidates = [];
    Object.entries(voteCounts).forEach(([uid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        candidates = [uid];
      } else if (count === maxVotes) {
        candidates.push(uid);
      }
    });

    // Random tiebreak
    const eliminated = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    // Update player as dead
    const updatedPlayers = gameState.players.map(p => 
      p.uid === eliminated ? { ...p, isAlive: false } : p
    );

    await updateDoc(roomRef, {
      'activeActivity.players': updatedPlayers,
      'activeActivity.lastEliminated': eliminated,
      lastActivity: serverTimestamp()
    });

    // Check win condition
    const winner = getWinnerFromPlayers(updatedPlayers);

    if (winner) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.phaseEndsAt': null,
        lastActivity: serverTimestamp()
      });
    } else {
      // Continue to next round
      await updateDoc(roomRef, {
        'activeActivity.roundNumber': gameState.roundNumber + 1,
        'activeActivity.phaseEndsAt': null,
        lastActivity: serverTimestamp()
      });

      // Wait 5 seconds then start next night
      setTimeout(async () => {
        await startNightPhase();
      }, 5000);
    }
  };

  const handleToggleSkipDiscussion = async () => {
    if (!gameState || !user || gameState.phase !== 'day-discussion') return;
    if (!isCurrentUserAlive() || myRole === 'narrator') return;

    const roomRef = doc(db, 'rooms', roomId);
    const currentSkipVotes = gameState.skipVotes || [];
    const hasVoted = currentSkipVotes.includes(user.id);
    const updatedSkipVotes = hasVoted
      ? currentSkipVotes.filter((uid) => uid !== user.id)
      : [...currentSkipVotes, user.id];

    await updateDoc(roomRef, {
      'activeActivity.skipVotes': updatedSkipVotes,
      lastActivity: serverTimestamp()
    });

    if (isHost) {
      const livingUids = getLivingNonNarrators().map((player) => player.uid);
      if (livingUids.length > 0 && livingUids.every((uid) => updatedSkipVotes.includes(uid))) {
        await startDayVotePhase(roomRef);
      }
    }
  };

  const handleReturnToGameNight = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
    navigate(`/room/${roomId}`);
  };

  const handleCancelGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
    navigate(`/room/${roomId}`);
  };

  const getActivePlayers = () => {
    if (!gameState) return [];
    
    switch (gameState.phase) {
      case 'night-mafia':
        return gameState.players.filter(p => p.role === 'mafia' && p.isAlive);
      case 'night-doctor':
        const doctor = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
        return doctor ? [doctor] : [];
      case 'night-detective':
        const detective = gameState.players.find(p => p.role === 'detective' && p.isAlive);
        return detective ? [detective] : [];
      case 'day-vote':
        return gameState.players.filter(p => p.isAlive === true && p.role !== 'narrator');
      default:
        return [];
    }
  };

  const getSelectablePlayers = () => {
    if (!gameState) return [];

    switch (gameState.phase) {
      case 'night-mafia':
        return gameState.players.filter(p => p.role !== 'mafia' && p.isAlive && p.role !== 'narrator');
      case 'night-doctor':
        return gameState.players.filter(p => p.isAlive && p.role !== 'narrator');
      case 'night-detective':
        return gameState.players.filter(p => p.isAlive && p.uid !== user?.id && p.role !== 'narrator');
      case 'day-vote':
        return gameState.players.filter(p => p.isAlive === true && p.role !== 'narrator');
      default:
        return [];
    }
  };

  const isSpectator = () => {
    if (!myRole) return true;
    if (myRole === 'narrator') return true;
    const me = gameState?.players?.find(p => p.uid === user?.id);
    return me && !me.isAlive;
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'mafia':
        return '🔪';
      case 'civilian':
        return '👤';
      case 'doctor':
        return '⚕️';
      case 'detective':
        return '🔍';
      case 'narrator':
        return '🎙️';
      default:
        return '❓';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'mafia':
        return 'from-red-900 to-red-800';
      case 'civilian':
        return 'from-blue-900 to-blue-800';
      case 'doctor':
        return 'from-green-900 to-green-800';
      case 'detective':
        return 'from-yellow-900 to-yellow-800';
      case 'narrator':
        return 'from-purple-900 to-purple-800';
      default:
        return 'from-slate-900 to-slate-800';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show loading
  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Phase 1: Host Setup (no active game)
  if (!gameState && isHost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="w-full max-w-md mx-auto px-6 py-8">
          <button
            onClick={() => navigate(`/room/${roomId}`)}
            className="mb-6 flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <h1 className="text-white text-3xl font-black uppercase tracking-tight mb-2">Mafia</h1>
          <p className="text-slate-400 mb-8">Configure game rules</p>

          <div className="space-y-6">
            {/* Narrator */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-semibold">Narrator</label>
                  <p className="text-slate-400 text-sm">One player guides the game</p>
                </div>
                <button
                  onClick={() => setRules({ ...rules, narrator: !rules.narrator })}
                  className={`w-12 h-7 rounded-full transition-colors ${
                    rules.narrator ? 'bg-violet-600' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    rules.narrator ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Number of mafias */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <label className="text-white font-semibold block mb-2">Number of Mafias</label>
              <input
                type="number"
                min="1"
                max={Math.floor((room.players.length || 4) / 2)}
                value={rules.mafiaCount}
                onChange={(e) => setRules({ ...rules, mafiaCount: parseInt(e.target.value) || 1 })}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
              />
            </div>

            {/* Doctor */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-semibold">Doctor</label>
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
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white font-semibold">Detective</label>
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
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
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
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
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
    );
  }

  // Phase 2: Lobby
  if (gameState?.phase === 'lobby') {
    const hasJoined = gameState.players.some(p => p.uid === user?.id);
    const canStart = gameState.players.length >= 4;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="w-full max-w-md mx-auto px-6 py-8">
          {isHost && (
            <button
              onClick={handleCancelGame}
              className="mb-6 flex items-center justify-center w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          <h1 className="text-white text-3xl font-black uppercase tracking-tight mb-2">Mafia Lobby</h1>
          <p className="text-slate-400 mb-8">
            {hasJoined ? 'Waiting for players...' : 'Join the game!'}
          </p>

          {!hasJoined && (
            <button
              onClick={handleJoinLobby}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors mb-6"
            >
              Join Lobby
            </button>
          )}

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
            <h2 className="text-white font-semibold mb-4">
              Players ({gameState.players.length})
            </h2>
            <div className="space-y-2">
              {gameState.players.map((player) => (
                <div
                  key={player.uid}
                  className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3"
                >
                  <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {getInitials(player.displayName)}
                  </div>
                  <span className="text-white">{player.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && selectingNarrator && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <h2 className="text-white font-semibold mb-4">Select Narrator</h2>
              <div className="space-y-2 mb-4">
                {gameState.players.map((player) => (
                  <button
                    key={player.uid}
                    onClick={() => setSelectedNarrator(player.uid)}
                    className={`w-full flex items-center gap-3 rounded-lg p-3 transition-colors ${
                      selectedNarrator === player.uid
                        ? 'bg-violet-600'
                        : 'bg-slate-700/50 hover:bg-slate-700'
                    }`}
                  >
                    <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                      {getInitials(player.displayName)}
                    </div>
                    <span className="text-white">{player.displayName}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleConfirmNarrator}
                disabled={!selectedNarrator}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Confirm Narrator
              </button>
            </div>
          )}

          {isHost && !selectingNarrator && (
            <div className="space-y-3">
              <button
                onClick={handleEditRules}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Edit Rules
              </button>
              <button
                onClick={handleStartGame}
                disabled={!canStart}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {canStart ? 'Start Game' : 'Need 4+ players'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase 3: Role reveal
  if (gameState?.phase === 'roles') {
    if (!myRole) return null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {!showRole ? (
            <div className="text-center">
              <div className="text-6xl mb-6">🤫</div>
              <h1 className="text-white text-2xl font-bold mb-4">Your role is hidden</h1>
              <p className="text-slate-400 mb-8">Tap Reveal to see your role</p>
              <button
                onClick={handleRevealRole}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Reveal Role
              </button>
            </div>
          ) : (
            <div className={`bg-gradient-to-br ${getRoleColor(myRole)} border-2 border-white/20 rounded-2xl p-8 text-center`}>
              <div className="text-8xl mb-6">{getRoleIcon(myRole)}</div>
              <h1 className="text-white text-3xl font-black uppercase mb-4">{myRole}</h1>
              <p className="text-white/80 mb-8">
                {myRole === 'mafia' && 'Kill townspeople without getting caught'}
                {myRole === 'civilian' && 'Find and eliminate the mafia'}
                {myRole === 'doctor' && 'Save players from the mafia each night'}
                {myRole === 'detective' && 'Investigate players to find the mafia'}
                {myRole === 'narrator' && 'Guide the game and observe all actions'}
              </p>
              <button
                onClick={handleHideRole}
                className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Hide Role
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Night phase - Eyes closed
  if (gameState?.phase?.startsWith('night-eyes-closed')) {
    const isPostVoteClose = gameState.phase === 'night-eyes-closed-2' || gameState.phase === 'night-eyes-closed-3';
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-8xl mb-6">{isPostVoteClose ? '😴' : '🤫'}</div>
          <h1 className="text-white text-4xl font-black">{isPostVoteClose ? 'Close your eyes... 😴' : 'Close your eyes 🤫'}</h1>
          {timeLeft !== null && (
            <p className="text-slate-300 font-mono text-2xl mt-4">{formatTime(timeLeft)}</p>
          )}
        </div>
      </div>
    );
  }

  // Night phase - Mafia turn
  if (gameState?.phase === 'night-mafia') {
    const isMafia = myRole === 'mafia' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();

    if (spectator) {
      // Show spectator view
      const mafiaVotes = gameState.nightVotes || {};
      const selectablePlayers = getSelectablePlayers();

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            {myRole === 'narrator' && (
              <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">🎙️</div>
                <h2 className="text-white font-bold text-xl">NARRATOR</h2>
              </div>
            )}
            {myRole !== 'narrator' && (
              <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">💀</div>
                <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Mafia Voting</h3>
                {timeLeft !== null && (
                  <p className="text-red-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>

              <div className="space-y-2">
                {selectablePlayers.map((player) => {
                  const voteCount = Object.values(mafiaVotes).filter(v => v === player.uid).length;
                  return (
                    <div
                      key={player.uid}
                      className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                          {getInitials(player.displayName)}
                        </div>
                        <span className="text-white">{player.displayName}</span>
                      </div>
                      {voteCount > 0 && (
                        <span className="text-red-400 font-bold">{voteCount} 🔪</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isMafia) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-3xl font-black">Shhh... the mafia is awake</h1>
          </div>
        </div>
      );
    }

    // Active mafia player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-red-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-red-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Choose a player to kill</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-red-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-red-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Vote Confirmed' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Night phase - Doctor turn
  if (gameState?.phase === 'night-doctor') {
    const isDoctor = myRole === 'doctor' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();
    const doctorDead = !gameState.players.find(p => p.role === 'doctor' && p.isAlive);

    if (spectator && !doctorDead) {
      const doctorVote = gameState.nightVotes || {};
      const selectablePlayers = getSelectablePlayers();

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            {myRole === 'narrator' && (
              <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">🎙️</div>
                <h2 className="text-white font-bold text-xl">NARRATOR</h2>
              </div>
            )}
            {myRole !== 'narrator' && (
              <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">💀</div>
                <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Doctor Turn</h3>
                {timeLeft !== null && (
                  <p className="text-green-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDoctor) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-3xl font-black">Shhh...</h1>
          </div>
        </div>
      );
    }

    // Active doctor player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-green-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Choose who to save</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-green-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-green-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Saved' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Night phase - Detective turn
  if (gameState?.phase === 'night-detective') {
    const isDetective = myRole === 'detective' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();
    const detectiveDead = !gameState.players.find(p => p.role === 'detective' && p.isAlive);

    if (spectator && !detectiveDead) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            {myRole === 'narrator' && (
              <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">🎙️</div>
                <h2 className="text-white font-bold text-xl">NARRATOR</h2>
              </div>
            )}
            {myRole !== 'narrator' && (
              <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">💀</div>
                <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Detective Turn</h3>
                {timeLeft !== null && (
                  <p className="text-yellow-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDetective) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-3xl font-black">Shhh...</h1>
          </div>
        </div>
      );
    }

    // Active detective player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-yellow-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Who are you suspicious of?</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-yellow-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-yellow-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Investigating...' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Detective result
  if (gameState?.phase === 'night-detective-result') {
    const isDetective = myRole === 'detective' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    
    if (isDetective && gameState.detectiveResult) {
      const result = gameState.detectiveResult;
      return (
        <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className={`text-8xl mb-6`}>
              {result.isMafia ? '🔪' : '✅'}
            </div>
            <h1 className="text-white text-3xl font-bold mb-4">
              {result.targetName}
            </h1>
            <p className="text-white text-2xl">
              {result.isMafia ? 'IS a mafia' : 'is NOT a mafia'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-8xl mb-6">😴</div>
          <h1 className="text-white text-3xl font-black">Shhh...</h1>
        </div>
      </div>
    );
  }

  // Day phase - Discussion
  if (gameState?.phase === 'day-discussion') {
    const spectator = isSpectator();
    const victimUid = gameState.pendingVictim;
    const saved = gameState.lastSaved && gameState.lastSaved === victimUid;
    const victim = victimUid ? gameState.players.find(p => p.uid === victimUid) : null;
    const livingPlayers = gameState.players.filter((p) => p.isAlive && p.role !== 'narrator');
    const skipVotes = gameState.skipVotes || [];
    const canSkipVote = !spectator && isCurrentUserAlive() && myRole !== 'narrator';
    const mySkipVote = skipVotes.includes(user?.id);
    const skipVotePlayers = skipVotes
      .map((uid) => gameState.players.find((p) => p.uid === uid))
      .filter(Boolean);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}
          {spectator && myRole !== 'narrator' && (
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>
          )}

          <div className="text-center mb-6">
            <div className="text-6xl mb-4">👀</div>
            <h1 className="text-white text-3xl font-black mb-4">Open your eyes!</h1>
            
            {victim && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-4">
                {saved ? (
                  <>
                    <p className="text-white text-lg mb-2">
                      <span className="font-bold">{victim.displayName}</span> was attacked last night
                    </p>
                    <p className="text-green-400 text-lg font-bold">
                      But the doctor saved them! 🏥
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white text-lg">
                      <span className="font-bold">{victim.displayName}</span> was killed last night
                    </p>
                    <p className="text-red-400 text-2xl mt-2">🔪</p>
                  </>
                )}
              </div>
            )}

            <div className="bg-violet-900/50 border border-violet-700 rounded-xl p-4 mb-6">
              <h2 className="text-white text-2xl font-bold mb-2">DISCUSS 💬</h2>
              {timeLeft !== null && (
                <p className="text-violet-300 font-mono text-3xl">{formatTime(timeLeft)}</p>
              )}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Alive Players</h3>
            <div className="space-y-2">
              {livingPlayers.map((player) => (
                <div
                  key={player.uid}
                  className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3"
                >
                  <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {getInitials(player.displayName)}
                  </div>
                  <span className="text-white">{player.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mt-4">
            <button
              onClick={handleToggleSkipDiscussion}
              disabled={!canSkipVote}
              className={`w-full py-3 rounded-xl font-bold transition-colors ${
                canSkipVote
                  ? mySkipVote
                    ? 'bg-violet-700 hover:bg-violet-600 text-white'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {mySkipVote ? 'Undo Skip Vote' : 'Skip Discussion'}
            </button>
            <p className="text-slate-300 text-sm mt-3">
              Voted to skip: {skipVotes.length}/{livingPlayers.length}
            </p>
            <div className="flex items-center mt-2">
              {skipVotePlayers.length === 0 ? (
                <span className="text-slate-500 text-sm">No votes yet</span>
              ) : (
                skipVotePlayers.map((player, index) => (
                  <div
                    key={player.uid}
                    className={`w-7 h-7 ${player.avatarColor} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ${index > 0 ? '-ml-2' : ''}`}
                    title={player.displayName}
                  >
                    {getInitials(player.displayName)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Day phase - Voting
  if (gameState?.phase === 'day-vote') {
    const spectator = isSpectator();
    const canVote = !spectator && isCurrentUserAlive();
    const selectablePlayers = getSelectablePlayers();
    const dayVotes = gameState.dayVotes || {};
    const livingVoterUids = new Set(gameState.players.filter((p) => p.isAlive && p.role !== 'narrator').map((p) => p.uid));

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}
          {spectator && myRole !== 'narrator' && (
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>
          )}

          <div className="text-center mb-6">
            <h1 className="text-white text-2xl font-black mb-2">Vote to Eliminate 🗳️</h1>
            {timeLeft !== null && (
              <p className="text-violet-400 font-mono text-3xl">{formatTime(timeLeft)}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.filter((player) => player.isAlive === true).map((player) => {
              const votersForPlayer = Object.entries(dayVotes)
                .filter(([voterUid, targetUid]) => targetUid === player.uid && livingVoterUids.has(voterUid))
                .map(([voterUid]) => gameState.players.find((p) => p.uid === voterUid))
                .filter(Boolean);

              return (
              <button
                key={player.uid}
                onClick={() => canVote && handleVotePlayer(player.uid)}
                disabled={!canVote || hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid && canVote
                    ? 'bg-violet-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${(!canVote || hasConfirmed) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <div className="flex-1">
                  <span className="text-white font-semibold block">{player.displayName}</span>
                  <div className="flex items-center mt-2">
                    {votersForPlayer.map((voter, index) => (
                      <div
                        key={`${player.uid}-${voter.uid}`}
                        className={`w-7 h-7 ${voter.avatarColor} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ${index > 0 ? '-ml-2' : ''}`}
                        title={voter.displayName}
                      >
                        {getInitials(voter.displayName)}
                      </div>
                    ))}
                  </div>
                </div>
              </button>
              );
            })}
          </div>

          {canVote && (
            <button
              onClick={handleConfirmVote}
              disabled={!selectedPlayer || hasConfirmed}
              className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-slate-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
            >
              {hasConfirmed ? 'Vote Confirmed' : 'Confirm Vote'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // End game
  if (gameState?.phase === 'ended') {
    const winner = gameState.winner;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">{winner === 'mafia' ? '🔪' : '🎉'}</div>
            <h1 className="text-white text-4xl font-black mb-2">
              {winner === 'mafia' ? 'Mafia Wins!' : 'Town Wins!'}
            </h1>
            <p className="text-slate-400">Game Over</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">Final Roles</h2>
            <div className="space-y-3">
              {gameState.players.map((player) => (
                <div
                  key={player.uid}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    player.role === 'mafia' ? 'bg-red-900/30' : 'bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                      {getInitials(player.displayName)}
                    </div>
                    <span className="text-white">{player.displayName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getRoleIcon(player.role)}</span>
                    <span className={`text-sm font-semibold uppercase ${
                      player.role === 'mafia' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {player.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleReturnToGameNight}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
          >
            Return to Game Night
          </button>
        </div>
      </div>
    );
  }

  return null;
}
