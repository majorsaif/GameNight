import { enterPhase } from '../../lib/phase';
import { pickRandom, shuffle, tallyVotes } from '../../lib/random';
import WORD_LIST from '../../wordImposter/words';

export const WORD_IMPOSTER_MIN_PLAYERS = 3;

export function maxImpostersFor(playerCount) {
  return Math.max(1, Math.floor(playerCount / 3));
}

function randomDirection() {
  return pickRandom(['clockwise', 'anticlockwise']);
}

export function activePlayersOf(activity) {
  const eliminated = new Set(activity?.eliminatedPlayers || []);
  return (activity?.players || []).filter((p) => !eliminated.has(p.uid));
}

/** Gives each imposter a different decoy word from the same category when possible. */
export function buildImposterWords(entry, imposterIds, wordList = WORD_LIST) {
  if (imposterIds.length === 1) return { [imposterIds[0]]: entry.related };
  const sameCategory = shuffle(
    [...new Set(wordList.filter((e) => e.category === entry.category).map((e) => e.word))]
      .filter((w) => w !== entry.word)
  );
  const others = shuffle(
    [...new Set(wordList.map((e) => e.word))].filter((w) => w !== entry.word && !sameCategory.includes(w))
  );
  const pool = [...sameCategory, ...others];
  return imposterIds.reduce((acc, uid, i) => {
    acc[uid] = pool[i] || entry.related;
    return acc;
  }, {});
}

export function wordImposterWinner(activity, eliminatedOverride = null) {
  const eliminated = new Set(eliminatedOverride || activity?.eliminatedPlayers || []);
  const imposterIds = activity?.imposterIds || [];
  const remaining = (activity?.players || []).filter((p) => !eliminated.has(p.uid));
  const remainingImposters = remaining.filter((p) => imposterIds.includes(p.uid)).length;
  const remainingTown = remaining.length - remainingImposters;
  if (remainingImposters === 0) return 'town';
  // Imposters can no longer be out-voted once they match the town's numbers
  if (remainingImposters >= remainingTown) return 'imposter';
  return null;
}

function roundStart(players) {
  const start = pickRandom(players);
  return { startingPlayerId: start?.uid || null, direction: randomDirection() };
}

/** Lobby (or Play Again) -> word-reveal */
export function dealWordImposter(players, rules, activity, now = Date.now(), wordList = WORD_LIST) {
  const imposterCount = Number(rules.imposterCount) || 1;
  const max = maxImpostersFor(players.length);
  if (imposterCount > max) {
    throw new Error(`Too many imposters: with ${players.length} players you can have at most ${max}.`);
  }
  const imposterIds = shuffle(players).slice(0, imposterCount).map((p) => p.uid);
  const entry = pickRandom(wordList);
  const noWord = Boolean(rules.imposterNoWord);
  const imposterWordsByUid = noWord ? null : buildImposterWords(entry, imposterIds, wordList);

  return {
    players: players.map((p) => ({ uid: p.uid, displayName: p.displayName, avatarColor: p.avatarColor || null })),
    rules: {
      imposterCount,
      showCategory: rules.showCategory !== false,
      imposterNoWord: noWord
    },
    word: entry.word,
    category: entry.category,
    imposterIds,
    imposterWordsByUid,
    imposterWord: imposterWordsByUid ? [...new Set(Object.values(imposterWordsByUid))].join(', ') : null,
    ...roundStart(players),
    eliminatedPlayers: [],
    eliminatedRounds: {},
    eliminatedUid: null,
    lastResult: null,
    readyVotes: [],
    votes: {},
    winner: null,
    winningAgent: null,
    declaringGuess: null,
    pausedFromPhase: null,
    roundNumber: 1,
    ...enterPhase(activity, 'word-reveal', null, now)
  };
}

export function startDescribingUpdates(activity, now = Date.now()) {
  return {
    ...roundStart(activePlayersOf(activity)),
    readyVotes: [],
    votes: {},
    ...enterPhase(activity, 'describing', null, now)
  };
}

export function startVotingUpdates(activity, now = Date.now()) {
  return {
    votes: {},
    readyVotes: [],
    ...enterPhase(activity, 'voting', null, now)
  };
}

function eliminationRounds(activity, uid) {
  return { ...(activity.eliminatedRounds || {}), [uid]: activity.roundNumber || 1 };
}

function nextRoundUpdates(activity, eliminatedPlayers, lastResult, now) {
  const next = { ...activity, eliminatedPlayers };
  return {
    eliminatedPlayers,
    ...(lastResult?.uid && lastResult.type !== 'correct-guess'
      ? { eliminatedRounds: eliminationRounds(activity, lastResult.uid) }
      : {}),
    eliminatedUid: lastResult?.uid || null,
    lastResult,
    roundNumber: (activity.roundNumber || 1) + 1,
    declaringGuess: null,
    pausedFromPhase: null,
    ...startDescribingUpdates(next, now)
  };
}

function endedUpdates(activity, winner, extra, now) {
  return {
    winner,
    wordRevealed: true,
    declaringGuess: null,
    pausedFromPhase: null,
    ...extra,
    ...enterPhase(activity, 'ended', null, now)
  };
}

export function resolveWordImposterVote(activity, now = Date.now()) {
  const activeUids = activePlayersOf(activity).map((p) => p.uid);
  const { leaders } = tallyVotes(activity.votes, activeUids);

  if (leaders.length !== 1) {
    return nextRoundUpdates(activity, activity.eliminatedPlayers || [], {
      type: leaders.length === 0 ? 'no-votes' : 'tie'
    }, now);
  }

  const eliminatedUid = leaders[0];
  const eliminatedPlayers = [...new Set([...(activity.eliminatedPlayers || []), eliminatedUid])];
  const wasImposter = (activity.imposterIds || []).includes(eliminatedUid);
  const winner = wordImposterWinner(activity, eliminatedPlayers);
  if (winner) {
    return endedUpdates(activity, winner, {
      eliminatedPlayers,
      eliminatedRounds: eliminationRounds(activity, eliminatedUid),
      eliminatedUid,
      lastResult: { type: 'eliminated', uid: eliminatedUid, wasImposter }
    }, now);
  }
  return nextRoundUpdates(activity, eliminatedPlayers, { type: 'eliminated', uid: eliminatedUid, wasImposter }, now);
}

export function canDeclareGuess(activity, uid) {
  if (!activity?.rules?.imposterNoWord) return false;
  if (!['describing', 'voting'].includes(activity.phase)) return false;
  if (activity.declaringGuess) return false;
  if (!(activity.imposterIds || []).includes(uid)) return false;
  return !(activity.eliminatedPlayers || []).includes(uid);
}

export function resolveImposterGuess(activity, correct, now = Date.now()) {
  const guess = activity.declaringGuess;
  if (!guess) return null;
  if (correct) {
    return endedUpdates(activity, 'imposter', {
      winningAgent: guess.displayName || null,
      lastResult: { type: 'correct-guess', uid: guess.uid }
    }, now);
  }
  const eliminatedPlayers = [...new Set([...(activity.eliminatedPlayers || []), guess.uid])];
  const winner = wordImposterWinner(activity, eliminatedPlayers);
  const lastResult = { type: 'wrong-guess', uid: guess.uid, wasImposter: true };
  if (winner) {
    return endedUpdates(activity, winner, {
      eliminatedPlayers,
      eliminatedRounds: eliminationRounds(activity, guess.uid),
      eliminatedUid: guess.uid,
      lastResult
    }, now);
  }
  return nextRoundUpdates(activity, eliminatedPlayers, lastResult, now);
}

export function allActiveReady(activity, presentUids = null) {
  const present = presentUids ? new Set(presentUids) : null;
  const active = activePlayersOf(activity).map((p) => p.uid).filter((uid) => !present || present.has(uid));
  const ready = new Set(activity?.readyVotes || []);
  return active.length > 0 && active.every((uid) => ready.has(uid));
}
