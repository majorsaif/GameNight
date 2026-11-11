import { enterPhase } from '../../lib/phase';
import { pickRandom, randomInt, shuffle, tallyVotes } from '../../lib/random';
import { KILL_CAUSES, KILL_NOTE, SAVE_CAUSES, SAVE_NOTE } from '../../mafia/causes';

export const MAFIA_MIN_PLAYERS = 4;

export function maxMafiaFor(playerCount) {
  return Math.max(1, Math.floor(playerCount / 4));
}

const EYES_CLOSED_MS = 2500;
const NIGHT_ACTION_MS = 30000;
const DETECTIVE_RESULT_MS = 5000;
const DAY_RESULT_MS = 7000;

// When a role is dead we still run a short "fake" turn so nobody can tell from
// the timing. Randomised so it doesn't have a recognisable length.
function fakeTurnMs() {
  return 9000 + randomInt(8000);
}

export function nightOpeningMs(roundNumber) {
  // First night: 7s "turn up your volume" + 5s eyes closed
  return (roundNumber ?? 1) === 1 ? 12000 : 5000;
}

export function getMafiaWinner(players) {
  const living = (players || []).filter((p) => p.isAlive);
  const livingMafia = living.filter((p) => p.role === 'mafia').length;
  const livingTown = living.length - livingMafia;
  if (livingMafia === 0) return 'town';
  if (livingMafia >= livingTown) return 'mafia';
  return null;
}

export function dealMafiaRoles(players, rules) {
  const mafiaCount = Math.min(rules.mafiaCount || 1, maxMafiaFor(players.length));
  const shuffled = shuffle(players);
  return shuffled.map((player, index) => {
    let role = 'civilian';
    if (index < mafiaCount) role = 'mafia';
    else if (rules.doctor && index === mafiaCount) role = 'doctor';
    else if (rules.detective && index === mafiaCount + (rules.doctor ? 1 : 0)) role = 'detective';
    return {
      uid: player.uid,
      displayName: player.displayName,
      avatarColor: player.avatarColor || null,
      isAlive: true,
      eliminatedRound: null,
      role
    };
  });
}

function findAliveRole(activity, role) {
  return (activity.players || []).find((p) => p.role === role && p.isAlive) || null;
}

/** Who is expected to act in the current phase. */
export function activeActorUids(activity) {
  const players = activity?.players || [];
  switch (activity?.phase) {
    case 'night-mafia':
      return players.filter((p) => p.role === 'mafia' && p.isAlive).map((p) => p.uid);
    case 'night-doctor': {
      const doctor = findAliveRole(activity, 'doctor');
      return doctor ? [doctor.uid] : [];
    }
    case 'night-detective': {
      const detective = findAliveRole(activity, 'detective');
      return detective ? [detective.uid] : [];
    }
    case 'day-discussion':
    case 'day-vote':
      return players.filter((p) => p.isAlive).map((p) => p.uid);
    default:
      return [];
  }
}

export function selectableTargets(activity, myUid) {
  const players = activity?.players || [];
  switch (activity?.phase) {
    case 'night-mafia':
      return players.filter((p) => p.isAlive && p.role !== 'mafia');
    case 'night-doctor':
      return players.filter((p) => p.isAlive);
    case 'night-detective':
      return players.filter((p) => p.isAlive && p.uid !== myUid);
    case 'day-vote':
      return players.filter((p) => p.isAlive);
    default:
      return [];
  }
}

function resetNight() {
  return {
    nightVotes: {},
    mafiaSelections: {},
    confirmedVotes: [],
    readyVotes: [],
    dayVotes: {},
    pendingVictim: null,
    doctorSave: null,
    detectiveResult: null
  };
}

/** roles -> first night, or day-result -> next night. */
export function startNightUpdates(activity, now = Date.now()) {
  const roundNumber = activity.phase === 'day-result'
    ? (activity.roundNumber || 1) + 1
    : (activity.roundNumber || 1);
  return {
    ...resetNight(),
    roundNumber,
    lastEliminated: null,
    lastSaved: null,
    ...enterPhase(activity, 'night-eyes-closed', nightOpeningMs(roundNumber), now)
  };
}

function nightTurnUpdates(activity, phase, now) {
  const role = phase === 'night-doctor' ? 'doctor' : 'detective';
  const alive = Boolean(findAliveRole(activity, role));
  return {
    nightVotes: {},
    confirmedVotes: [],
    ...enterPhase(activity, phase, alive ? NIGHT_ACTION_MS : fakeTurnMs(), now)
  };
}

function afterMafiaTurnPhase(rules) {
  if (rules?.doctor) return 'night-doctor';
  if (rules?.detective) return 'night-detective';
  return null; // straight to day
}

export function resolveNightToDay(activity, now = Date.now()) {
  const rules = activity.rules || {};
  const players = activity.players || [];
  const victimUid = activity.pendingVictim || null;
  const victim = victimUid ? players.find((p) => p.uid === victimUid) : null;
  const saved = Boolean(rules.doctor && victim && activity.doctorSave === victimUid);

  let nightReportCause = null;
  let nightReportNote = null;
  if (victim) {
    if (saved) {
      nightReportCause = pickRandom(SAVE_CAUSES);
      nightReportNote = SAVE_NOTE.replace('[Name]', victim.displayName);
    } else {
      nightReportCause = pickRandom(KILL_CAUSES);
      nightReportNote = KILL_NOTE;
    }
  }

  const roundNumber = activity.roundNumber || 1;
  const updatedPlayers = players.map((p) => (
    victim && !saved && p.uid === victimUid
      ? { ...p, isAlive: false, eliminatedRound: roundNumber }
      : p
  ));

  const base = {
    players: updatedPlayers,
    lastEliminated: victim && !saved ? victimUid : null,
    lastSaved: saved ? victimUid : null,
    nightReportCause,
    nightReportNote,
    nightVotes: {},
    confirmedVotes: [],
    readyVotes: []
  };

  const winner = getMafiaWinner(updatedPlayers);
  if (winner) {
    return { ...base, winner, ...enterPhase(activity, 'ended', null, now) };
  }
  const discussionMs = Math.max(1, Number(rules.discussionTime) || 3) * 60 * 1000;
  return { ...base, ...enterPhase(activity, 'day-discussion', discussionMs, now) };
}

export function startDayVoteUpdates(activity, now = Date.now()) {
  const votingMs = Math.max(0.5, Number(activity.rules?.votingTime) || 1) * 60 * 1000;
  return {
    dayVotes: {},
    readyVotes: [],
    confirmedVotes: [],
    ...enterPhase(activity, 'day-vote', votingMs, now)
  };
}

export function resolveDayVote(activity, now = Date.now()) {
  const players = activity.players || [];
  const livingUids = players.filter((p) => p.isAlive).map((p) => p.uid);
  const { leaders } = tallyVotes(activity.dayVotes, livingUids);
  const eliminated = leaders.length > 0 ? pickRandom(leaders) : null;
  const roundNumber = activity.roundNumber || 1;
  const updatedPlayers = players.map((p) => (
    p.uid === eliminated ? { ...p, isAlive: false, eliminatedRound: roundNumber } : p
  ));
  const base = {
    players: updatedPlayers,
    lastEliminated: eliminated,
    dayVoteTie: leaders.length > 1,
    confirmedVotes: []
  };
  const winner = getMafiaWinner(updatedPlayers);
  if (winner) return { ...base, winner, ...enterPhase(activity, 'ended', null, now) };
  return { ...base, ...enterPhase(activity, 'day-result', DAY_RESULT_MS, now) };
}

/**
 * Updates for when the current timed phase runs out. Returns null for phases
 * that only advance on a host action (roles, ended).
 */
export function advanceMafia(activity, now = Date.now()) {
  const rules = activity.rules || {};
  const players = activity.players || [];

  switch (activity.phase) {
    case 'night-eyes-closed':
      return {
        nightVotes: {},
        mafiaSelections: {},
        confirmedVotes: [],
        ...enterPhase(activity, 'night-mafia', NIGHT_ACTION_MS, now)
      };

    case 'night-mafia': {
      const mafiaUids = players.filter((p) => p.role === 'mafia' && p.isAlive).map((p) => p.uid);
      const targets = players.filter((p) => p.isAlive && p.role !== 'mafia').map((p) => p.uid);
      const votes = {};
      Object.entries(activity.nightVotes || {}).forEach(([voter, target]) => {
        if (mafiaUids.includes(voter) && targets.includes(target)) votes[voter] = target;
      });
      const { leaders } = tallyVotes(votes);
      return {
        pendingVictim: leaders.length > 0 ? pickRandom(leaders) : null,
        nightVotes: {},
        mafiaSelections: {},
        confirmedVotes: [],
        ...enterPhase(activity, 'night-eyes-closed-2', EYES_CLOSED_MS, now)
      };
    }

    case 'night-eyes-closed-2': {
      const next = afterMafiaTurnPhase(rules);
      if (!next) return resolveNightToDay(activity, now);
      return nightTurnUpdates(activity, next, now);
    }

    case 'night-doctor': {
      const doctor = findAliveRole(activity, 'doctor');
      const save = doctor ? (activity.nightVotes?.[doctor.uid] ?? null) : null;
      return {
        doctorSave: save,
        nightVotes: {},
        confirmedVotes: [],
        ...enterPhase(activity, 'night-eyes-closed-3', EYES_CLOSED_MS, now)
      };
    }

    case 'night-eyes-closed-3':
      if (rules.detective) return nightTurnUpdates(activity, 'night-detective', now);
      return resolveNightToDay(activity, now);

    case 'night-detective': {
      const detective = findAliveRole(activity, 'detective');
      const targetUid = detective ? activity.nightVotes?.[detective.uid] : null;
      const target = targetUid ? players.find((p) => p.uid === targetUid) : null;
      return {
        detectiveResult: target
          ? { targetUid: target.uid, targetName: target.displayName, isMafia: target.role === 'mafia' }
          : null,
        nightVotes: {},
        confirmedVotes: [],
        ...enterPhase(activity, 'night-detective-result', DETECTIVE_RESULT_MS, now)
      };
    }

    case 'night-detective-result':
      return enterPhase(activity, 'night-eyes-closed-4', 3000, now);

    case 'night-eyes-closed-4':
      return resolveNightToDay(activity, now);

    case 'day-discussion':
      return startDayVoteUpdates(activity, now);

    case 'day-vote':
      return resolveDayVote(activity, now);

    case 'day-result':
      return startNightUpdates(activity, now);

    default:
      return null;
  }
}

/** Shorten the timer to 5s once every actor has confirmed (keeps everyone in sync). */
export function allConfirmedJump(activity, now = Date.now()) {
  const actors = activeActorUids(activity);
  if (actors.length === 0) return null;
  const confirmed = new Set(activity.confirmedVotes || []);
  if (!actors.every((uid) => confirmed.has(uid))) return null;
  if (!activity.phaseEndsAt || activity.phaseEndsAt <= now + 5000) return null;
  return { phaseEndsAt: now + 5000 };
}

export function allReadyToVote(activity) {
  if (activity?.phase !== 'day-discussion') return false;
  const living = activeActorUids(activity);
  const ready = new Set(activity.readyVotes || []);
  return living.length > 0 && living.every((uid) => ready.has(uid));
}

/** Lobby -> roles. */
export function dealMafiaGame(players, rules, activity, now = Date.now()) {
  const mafiaCount = Number(rules.mafiaCount) || 1;
  const max = maxMafiaFor(players.length);
  if (mafiaCount > max) {
    throw new Error(`Too many mafia: with ${players.length} players you can have at most ${max}.`);
  }
  return {
    players: dealMafiaRoles(players, { ...rules, mafiaCount }),
    roundNumber: 1,
    winner: null,
    lastEliminated: null,
    lastSaved: null,
    nightReportCause: null,
    nightReportNote: null,
    ...resetNight(),
    ...enterPhase(activity, 'roles', null, now)
  };
}
