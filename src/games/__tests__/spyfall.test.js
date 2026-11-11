import { describe, expect, it } from 'vitest';
import {
  allSpyfallReady,
  canSpyGuess,
  dealSpyfall,
  declareSpyGuessUpdates,
  enterQuestioningUpdates,
  resolveSpyGuess,
  resolveSpyfallVote,
  startQuestioningIntroUpdates,
  startSpyfallVotingUpdates
} from '../spyfall/logic';

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i}`, displayName: `P${i}` }));
const apply = (a, u) => ({ ...a, ...u });

function newGame(n = 5, rules = { spyCount: 1, showRoles: true, discussionTime: 8 }) {
  const lobby = { type: 'spyfall', phase: 'lobby', phaseId: 0, rules };
  return apply(lobby, dealSpyfall(mkPlayers(n), rules, lobby, 0));
}

describe('spyfall deal', () => {
  it('spies have no role; everyone else has a distinct role', () => {
    const g = newGame(6);
    const spy = g.players.find((p) => g.spyIds.includes(p.uid));
    expect(spy.role).toBeNull();
    const roles = g.players.filter((p) => !g.spyIds.includes(p.uid)).map((p) => p.role);
    expect(roles.every(Boolean)).toBe(true);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('respects the show roles toggle and spy limit', () => {
    const g = newGame(4, { spyCount: 1, showRoles: false });
    expect(g.players.every((p) => p.role === null)).toBe(true);
    expect(() => newGame(7, { spyCount: 2 })).toThrow(/at most 1/);
  });
});

describe('spyfall flow', () => {
  it('intro -> questioning with the configured timer', () => {
    let g = newGame(5);
    g = apply(g, startQuestioningIntroUpdates(g, 0));
    expect(g.phase).toBe('questioning-intro');
    expect(g.currentAskerId).toBeTruthy();
    g = apply(g, enterQuestioningUpdates(g, 1000));
    expect(g.phaseEndsAt).toBe(1000 + 8 * 60 * 1000);
  });

  it('voting out an innocent hands the spy the win', () => {
    let g = newGame(5);
    g = apply(g, startSpyfallVotingUpdates(g));
    const innocent = g.players.find((p) => !g.spyIds.includes(p.uid)).uid;
    g = apply(g, { votes: Object.fromEntries(g.players.map((p) => [p.uid, innocent])) });
    g = apply(g, resolveSpyfallVote(g));
    expect(g).toMatchObject({ phase: 'ended', winner: 'spy', eliminatedUid: innocent });
  });

  it('catching one of two spies goes back to questioning', () => {
    let g = newGame(8, { spyCount: 2, discussionTime: 5 });
    g = apply(g, startSpyfallVotingUpdates(g));
    const [spyA] = g.spyIds;
    g = apply(g, { votes: Object.fromEntries(g.players.map((p) => [p.uid, spyA])) });
    g = apply(g, resolveSpyfallVote(g));
    expect(g.phase).toBe('questioning');
    expect(g.eliminatedSpyIds).toEqual([spyA]);
    expect(g.lastResult.type).toBe('spy-caught');
  });

  it('wrong spy guess eliminates only that spy when others remain', () => {
    let g = newGame(8, { spyCount: 2 });
    g = apply(g, enterQuestioningUpdates(g));
    const [spyA, spyB] = g.spyIds;
    expect(canSpyGuess(g, spyA)).toBe(true);
    g = apply(g, declareSpyGuessUpdates(g, spyA));
    expect(canSpyGuess(g, spyB)).toBe(false); // one guess at a time
    g = apply(g, resolveSpyGuess(g, false));
    expect(g.phase).toBe('questioning');
    expect(g.eliminatedSpyIds).toEqual([spyA]);
    expect(g.spyGuessing).toBeNull();
  });

  it('wrong guess by the only spy wins for town; correct guess wins for spy', () => {
    let g = newGame(5);
    g = apply(g, enterQuestioningUpdates(g));
    const spy = g.spyIds[0];
    g = apply(g, declareSpyGuessUpdates(g, spy));
    expect(apply(g, resolveSpyGuess(g, false))).toMatchObject({ phase: 'ended', winner: 'town' });
    expect(apply(g, resolveSpyGuess(g, true))).toMatchObject({ phase: 'ended', winner: 'spy' });
  });

  it('ready check ignores eliminated spies', () => {
    const g = { players: mkPlayers(3), eliminatedSpyIds: ['p2'], readyVotes: ['p0', 'p1'] };
    expect(allSpyfallReady(g)).toBe(true);
  });
});
