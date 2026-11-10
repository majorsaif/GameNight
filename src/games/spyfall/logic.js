import { enterPhase } from '../../lib/phase';
import { pickRandom, shuffle, tallyVotes } from '../../lib/random';
import LOCATIONS from '../../spyfall/locations';

export const SPYFALL_MIN_PLAYERS = 3;
export const QUESTIONING_INTRO_MS = 4000;

export function maxSpiesFor(playerCount) {
  return Math.max(1, Math.floor(playerCount / 4));
}

export function activeSpyfallPlayers(activity) {
  const out = new Set(activity?.eliminatedSpyIds || []);
  return (activity?.players || []).filter((p) => !out.has(p.uid));
}

export function remainingSpies(activity, eliminatedOverride = null) {
  const out = new Set(eliminatedOverride || activity?.eliminatedSpyIds || []);
  return (activity?.spyIds || []).filter((uid) => !out.has(uid));
}

/** Lobby (or Play Again) -> location-reveal */
export function dealSpyfall(players, rules, activity, now = Date.now(), locations = LOCATIONS) {
  const spyCount = Number(rules.spyCount) || 1;
  const max = maxSpiesFor(players.length);
  if (spyCount > max) {
    throw new Error(`Too many spies: with ${players.length} players you can have at most ${max}.`);
  }
  const location = pickRandom(locations);
  const spyIds = shuffle(players).slice(0, spyCount).map((p) => p.uid);
  const showRoles = rules.showRoles !== false;
  const roles = shuffle(location.roles);
  let roleIndex = 0;
  const dealt = players.map((p) => {
    const isSpy = spyIds.includes(p.uid);
    const role = !isSpy && showRoles ? roles[roleIndex++ % roles.length] : null;
    return { uid: p.uid, displayName: p.displayName, avatarColor: p.avatarColor || null, role };
  });

  return {
    players: dealt,
    rules: {
      spyCount,
      showRoles,
      discussionTime: Math.min(15, Math.max(1, Number(rules.discussionTime) || 8))
    },
    location: location.name,
    spyIds,
    eliminatedSpyIds: [],
    currentAskerId: null,
    readyVotes: [],
    votes: {},
    eliminatedUid: null,
    lastResult: null,
    spyGuessing: null,
    winner: null,
    roundNumber: (activity?.roundNumber || 0) + 1,
    ...enterPhase(activity, 'location-reveal', null, now)
  };
}

export function startQuestioningIntroUpdates(activity, now = Date.now()) {
  const asker = pickRandom(activeSpyfallPlayers(activity));
  return {
    currentAskerId: asker?.uid || null,
    readyVotes: [],
    ...enterPhase(activity, 'questioning-intro', QUESTIONING_INTRO_MS, now)
  };
}

export function questioningMs(activity) {
  return (Number(activity?.rules?.discussionTime) || 8) * 60 * 1000;
}

export function enterQuestioningUpdates(activity, now = Date.now()) {
  return {
    readyVotes: [],
    ...enterPhase(activity, 'questioning', questioningMs(activity), now)
  };
}

export function startSpyfallVotingUpdates(activity, now = Date.now()) {
  return {
    votes: {},
    readyVotes: [],
    spyGuessing: null,
    ...enterPhase(activity, 'voting', null, now)
  };
}

function endedUpdates(activity, winner, extra, now) {
  return { winner, spyGuessing: null, ...extra, ...enterPhase(activity, 'ended', null, now) };
}

function backToQuestioning(activity, eliminatedSpyIds, lastResult, now) {
  const next = { ...activity, eliminatedSpyIds };
  const asker = pickRandom(activeSpyfallPlayers(next));
  return {
    eliminatedSpyIds,
    lastResult,
    votes: {},
    readyVotes: [],
    spyGuessing: null,
    currentAskerId: asker?.uid || null,
    ...enterPhase(activity, 'questioning', questioningMs(activity), now)
  };
}

export function resolveSpyfallVote(activity, now = Date.now()) {
  const active = activeSpyfallPlayers(activity);
  const activeUids = active.map((p) => p.uid);
  const { leaders } = tallyVotes(activity.votes, activeUids);
  // Ties (including no votes at all) are broken at random, as the rules say
  const pool = leaders.length > 0 ? leaders : activeUids;
  const eliminatedUid = pickRandom(pool);
  if (!eliminatedUid) return null;
  const isSpy = (activity.spyIds || []).includes(eliminatedUid);
  const tieBroken = pool.length > 1;

  if (!isSpy) {
    return endedUpdates(activity, 'spy', {
      eliminatedUid,
      lastResult: { type: 'innocent-voted-out', uid: eliminatedUid, tieBroken }
    }, now);
  }

  const eliminatedSpyIds = [...new Set([...(activity.eliminatedSpyIds || []), eliminatedUid])];
  if (remainingSpies(activity, eliminatedSpyIds).length === 0) {
    return endedUpdates(activity, 'town', {
      eliminatedUid,
      eliminatedSpyIds,
      lastResult: { type: 'spy-caught', uid: eliminatedUid, tieBroken }
    }, now);
  }
  return backToQuestioning(activity, eliminatedSpyIds, { type: 'spy-caught', uid: eliminatedUid, tieBroken }, now);
}

export function canSpyGuess(activity, uid) {
  if (!activity || activity.spyGuessing) return false;
  if (!['questioning', 'voting'].includes(activity.phase)) return false;
  return remainingSpies(activity).includes(uid);
}

export function declareSpyGuessUpdates(activity, uid) {
  if (!canSpyGuess(activity, uid)) return null;
  return { spyGuessing: { spyUid: uid, status: 'guessing', fromPhase: activity.phase } };
}

/** Host confirms whether the spy named the right location. */
export function resolveSpyGuess(activity, correct, now = Date.now()) {
  const guesserUid = activity.spyGuessing?.spyUid;
  if (!guesserUid) return null;
  if (correct) {
    return endedUpdates(activity, 'spy', {
      lastResult: { type: 'correct-guess', uid: guesserUid }
    }, now);
  }
  const eliminatedSpyIds = [...new Set([...(activity.eliminatedSpyIds || []), guesserUid])];
  const lastResult = { type: 'wrong-guess', uid: guesserUid };
  if (remainingSpies(activity, eliminatedSpyIds).length === 0) {
    return endedUpdates(activity, 'town', { eliminatedSpyIds, eliminatedUid: guesserUid, lastResult }, now);
  }
  // Other spies remain: carry on where we were
  const updates = { eliminatedSpyIds, lastResult, spyGuessing: null };
  if (activity.phase === 'voting') {
    const votes = { ...(activity.votes || {}) };
    delete votes[guesserUid];
    updates.votes = votes;
  }
  return updates;
}

export function allSpyfallReady(activity, presentUids = null) {
  const present = presentUids ? new Set(presentUids) : null;
  const active = activeSpyfallPlayers(activity).map((p) => p.uid).filter((uid) => !present || present.has(uid));
  const ready = new Set(activity?.readyVotes || []);
  return active.length > 0 && active.every((uid) => ready.has(uid));
}
