import { describe, expect, it } from 'vitest';
import {
  allActiveReady,
  buildImposterWords,
  canDeclareGuess,
  dealWordImposter,
  maxImpostersFor,
  resolveImposterGuess,
  resolveWordImposterVote,
  startDescribingUpdates,
  startVotingUpdates,
  wordImposterWinner
} from '../wordImposter/logic';
import WORD_LIST from '../../wordImposter/words';

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i}`, displayName: `P${i}` }));
const apply = (a, u) => ({ ...a, ...u });

function newGame(n = 5, rules = { imposterCount: 1, showCategory: true, imposterNoWord: false }) {
  const lobby = { type: 'wordImposter', phase: 'lobby', phaseId: 0, rules };
  return apply(lobby, dealWordImposter(mkPlayers(n), rules, lobby));
}

describe('word imposter deal', () => {
  it('gives the single imposter the related word', () => {
    const g = newGame(5);
    expect(g.imposterIds).toHaveLength(1);
    const entry = WORD_LIST.find((e) => e.word === g.word);
    expect(g.imposterWordsByUid[g.imposterIds[0]]).toBe(entry.related);
    expect(g.phase).toBe('word-reveal');
  });

  it('gives multiple imposters unique words that differ from the town word', () => {
    const g = newGame(9, { imposterCount: 3 });
    const words = Object.values(g.imposterWordsByUid);
    expect(new Set(words).size).toBe(3);
    expect(words).not.toContain(g.word);
  });

  it('no-word mode gives imposters nothing', () => {
    const g = newGame(4, { imposterCount: 1, imposterNoWord: true });
    expect(g.imposterWordsByUid).toBeNull();
    expect(g.imposterWord).toBeNull();
  });

  it('limits imposters to a third of players', () => {
    expect(maxImpostersFor(5)).toBe(1);
    expect(maxImpostersFor(6)).toBe(2);
    expect(() => newGame(5, { imposterCount: 2 })).toThrow(/at most 1/);
  });

  it('buildImposterWords falls back to other categories when needed', () => {
    const tiny = [
      { word: 'A', related: 'B', category: 'X' },
      { word: 'B', related: 'A', category: 'X' },
      { word: 'C', related: 'A', category: 'Y' }
    ];
    const words = buildImposterWords(tiny[0], ['u1', 'u2'], tiny);
    expect(new Set(Object.values(words)).size).toBe(2);
    expect(Object.values(words)).not.toContain('A');
  });
});

describe('word imposter rounds', () => {
  it('tie starts a new round without eliminating anyone', () => {
    let g = newGame(4);
    g = apply(g, startDescribingUpdates(g));
    g = apply(g, startVotingUpdates(g));
    const [a, b, c, d] = g.players.map((p) => p.uid);
    g = apply(g, { votes: { [a]: b, [b]: a, [c]: b, [d]: a } });
    g = apply(g, resolveWordImposterVote(g));
    expect(g.phase).toBe('describing');
    expect(g.eliminatedPlayers).toEqual([]);
    expect(g.lastResult.type).toBe('tie');
    expect(g.roundNumber).toBe(2);
  });

  it('voting out the imposter wins for town', () => {
    let g = newGame(4);
    g = apply(g, startVotingUpdates(g));
    const imp = g.imposterIds[0];
    g = apply(g, { votes: Object.fromEntries(g.players.filter((p) => p.uid !== imp).map((p) => [p.uid, imp])) });
    g = apply(g, resolveWordImposterVote(g));
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('town');
  });

  it('imposter wins when only two remain', () => {
    let g = newGame(3);
    g = apply(g, startVotingUpdates(g));
    const imp = g.imposterIds[0];
    const town = g.players.filter((p) => p.uid !== imp).map((p) => p.uid);
    g = apply(g, { votes: { [imp]: town[0], [town[1]]: town[0] } });
    g = apply(g, resolveWordImposterVote(g));
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('imposter');
  });

  it('multiple imposters win once they match the town (no endless ties)', () => {
    const g = { players: mkPlayers(4), imposterIds: ['p0', 'p1'], eliminatedPlayers: [] };
    expect(wordImposterWinner(g)).toBe('imposter');
    expect(wordImposterWinner({ ...g, players: mkPlayers(5) })).toBeNull();
  });

  it('eliminated players votes are ignored', () => {
    let g = newGame(6);
    g = apply(g, startVotingUpdates(g));
    const ids = g.players.map((p) => p.uid);
    g = apply(g, { eliminatedPlayers: [ids[0]], votes: { [ids[0]]: ids[2], [ids[1]]: ids[3] } });
    g = apply(g, resolveWordImposterVote(g));
    expect(g.eliminatedPlayers).toContain(ids[3]);
  });

  it('ready check only counts present, active players', () => {
    const g = { players: mkPlayers(3), eliminatedPlayers: ['p2'], readyVotes: ['p0'] };
    expect(allActiveReady(g)).toBe(false);
    expect(allActiveReady(g, ['p0'])).toBe(true);
  });
});

describe('word imposter guesses', () => {
  it('only active imposters in no-word mode can guess', () => {
    let g = newGame(4, { imposterCount: 1, imposterNoWord: true });
    g = apply(g, startDescribingUpdates(g));
    const imp = g.imposterIds[0];
    const town = g.players.find((p) => p.uid !== imp).uid;
    expect(canDeclareGuess(g, imp)).toBe(true);
    expect(canDeclareGuess(g, town)).toBe(false);
    expect(canDeclareGuess(newGame(4), imp)).toBe(false);
  });

  it('correct guess wins for the imposter; wrong guess eliminates them', () => {
    let g = newGame(4, { imposterCount: 1, imposterNoWord: true });
    g = apply(g, startDescribingUpdates(g));
    const imp = g.imposterIds[0];
    const declared = apply(g, { declaringGuess: { uid: imp, displayName: 'Imp' }, pausedFromPhase: 'describing' });
    const won = apply(declared, resolveImposterGuess(declared, true));
    expect(won).toMatchObject({ phase: 'ended', winner: 'imposter', winningAgent: 'Imp' });
    const lost = apply(declared, resolveImposterGuess(declared, false));
    expect(lost).toMatchObject({ phase: 'ended', winner: 'town' });
  });

  it('wrong guess continues the game when imposters remain', () => {
    let g = newGame(9, { imposterCount: 3, imposterNoWord: true });
    g = apply(g, startDescribingUpdates(g));
    const imp = g.imposterIds[0];
    g = apply(g, { declaringGuess: { uid: imp, displayName: 'Imp' } });
    g = apply(g, resolveImposterGuess(g, false));
    expect(g.phase).toBe('describing');
    expect(g.eliminatedPlayers).toContain(imp);
    expect(g.declaringGuess).toBeNull();
  });
});
