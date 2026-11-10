import { describe, expect, it } from 'vitest';
import {
  advanceMafia,
  allConfirmedJump,
  allReadyToVote,
  dealMafiaGame,
  getMafiaWinner,
  maxMafiaFor,
  resolveDayVote,
  startNightUpdates
} from '../mafia/logic';

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i}`, displayName: `P${i}` }));
const apply = (activity, updates) => ({ ...activity, ...updates });

function newGame(n = 6, rules = { mafiaCount: 1, doctor: true, detective: true, discussionTime: 1, votingTime: 0.5 }) {
  const lobby = { type: 'mafia', phase: 'lobby', phaseId: 0, rules };
  return apply(lobby, dealMafiaGame(mkPlayers(n), rules, lobby, 1000));
}

const byRole = (a, role) => a.players.filter((p) => p.role === role);

describe('mafia deal', () => {
  it('assigns exactly the configured roles', () => {
    const g = newGame(8, { mafiaCount: 2, doctor: true, detective: true });
    expect(byRole(g, 'mafia')).toHaveLength(2);
    expect(byRole(g, 'doctor')).toHaveLength(1);
    expect(byRole(g, 'detective')).toHaveLength(1);
    expect(byRole(g, 'civilian')).toHaveLength(4);
    expect(g.phase).toBe('roles');
    expect(g.phaseId).toBe(1);
  });

  it('rejects too many mafia', () => {
    expect(maxMafiaFor(7)).toBe(1);
    expect(() => newGame(7, { mafiaCount: 2 })).toThrow(/at most 1/);
  });
});

describe('mafia night flow', () => {
  it('runs a full night, kills the target, and starts the day', () => {
    let g = newGame(6);
    g = apply(g, startNightUpdates(g, 2000));
    expect(g.phase).toBe('night-eyes-closed');
    expect(g.phaseEndsAt).toBe(2000 + 12000); // first night has the volume prompt

    g = apply(g, advanceMafia(g, 3000));
    expect(g.phase).toBe('night-mafia');
    const mafia = byRole(g, 'mafia')[0];
    const victim = g.players.find((p) => p.role === 'civilian');
    g = apply(g, { nightVotes: { [mafia.uid]: victim.uid }, confirmedVotes: [mafia.uid] });
    expect(allConfirmedJump(g, 3500)).toEqual({ phaseEndsAt: 8500 });

    g = apply(g, advanceMafia(g, 4000));
    expect(g.phase).toBe('night-eyes-closed-2');
    expect(g.pendingVictim).toBe(victim.uid);

    g = apply(g, advanceMafia(g, 5000));
    expect(g.phase).toBe('night-doctor');
    g = apply(g, advanceMafia(g, 6000)); // doctor didn't save anyone
    expect(g.phase).toBe('night-eyes-closed-3');
    expect(g.doctorSave).toBeNull();

    g = apply(g, advanceMafia(g, 7000));
    expect(g.phase).toBe('night-detective');
    const detective = byRole(g, 'detective')[0];
    g = apply(g, { nightVotes: { [detective.uid]: mafia.uid } });
    g = apply(g, advanceMafia(g, 8000));
    expect(g.phase).toBe('night-detective-result');
    expect(g.detectiveResult).toMatchObject({ targetUid: mafia.uid, isMafia: true });

    g = apply(g, advanceMafia(g, 9000));
    expect(g.phase).toBe('night-eyes-closed-4');
    g = apply(g, advanceMafia(g, 10000));
    expect(g.phase).toBe('day-discussion');
    expect(g.players.find((p) => p.uid === victim.uid)).toMatchObject({ isAlive: false, eliminatedRound: 1 });
    expect(g.lastEliminated).toBe(victim.uid);
  });

  it('doctor save keeps the victim alive', () => {
    let g = newGame(6);
    g = apply(g, startNightUpdates(g));
    g = apply(g, advanceMafia(g));
    const mafia = byRole(g, 'mafia')[0];
    const doctor = byRole(g, 'doctor')[0];
    const victim = g.players.find((p) => p.role === 'civilian');
    g = apply(g, { nightVotes: { [mafia.uid]: victim.uid } });
    g = apply(g, advanceMafia(g)); // -> eyes-closed-2
    g = apply(g, advanceMafia(g)); // -> doctor
    g = apply(g, { nightVotes: { [doctor.uid]: victim.uid } });
    g = apply(g, advanceMafia(g)); // -> eyes-closed-3
    g = apply(g, advanceMafia(g)); // -> detective
    g = apply(g, advanceMafia(g)); // -> result
    g = apply(g, advanceMafia(g)); // -> eyes-closed-4
    g = apply(g, advanceMafia(g)); // -> day
    expect(g.phase).toBe('day-discussion');
    expect(g.players.every((p) => p.isAlive)).toBe(true);
    expect(g.lastSaved).toBe(victim.uid);
  });

  it('skips disabled roles', () => {
    let g = newGame(4, { mafiaCount: 1, doctor: false, detective: false, discussionTime: 1, votingTime: 1 });
    g = apply(g, startNightUpdates(g));
    g = apply(g, advanceMafia(g)); // mafia
    g = apply(g, advanceMafia(g)); // eyes-closed-2
    g = apply(g, advanceMafia(g)); // straight to day
    expect(g.phase).toBe('day-discussion');
  });

  it('dead roles still get a disguised turn', () => {
    let g = newGame(6);
    g = apply(g, { players: g.players.map((p) => (p.role === 'doctor' ? { ...p, isAlive: false } : p)) });
    g = apply(g, startNightUpdates(g, 0));
    g = apply(g, advanceMafia(g, 0));
    g = apply(g, advanceMafia(g, 0));
    g = apply(g, advanceMafia(g, 0));
    expect(g.phase).toBe('night-doctor');
    expect(g.phaseDurationMs).toBeGreaterThanOrEqual(9000);
    expect(g.phaseDurationMs).toBeLessThan(17000);
  });
});

describe('mafia day + win conditions', () => {
  it('all ready triggers voting; vote eliminates and reports', () => {
    let g = newGame(6);
    g = apply(g, { phase: 'day-discussion', readyVotes: g.players.map((p) => p.uid) });
    expect(allReadyToVote(g)).toBe(true);
    g = apply(g, advanceMafia(g)); // -> day-vote
    expect(g.phase).toBe('day-vote');
    const civ = g.players.find((p) => p.role === 'civilian');
    const votes = Object.fromEntries(g.players.filter((p) => p.uid !== civ.uid).map((p) => [p.uid, civ.uid]));
    g = apply(g, { dayVotes: votes });
    g = apply(g, resolveDayVote(g));
    expect(g.phase).toBe('day-result');
    expect(g.lastEliminated).toBe(civ.uid);
    g = apply(g, advanceMafia(g));
    expect(g.phase).toBe('night-eyes-closed');
    expect(g.roundNumber).toBe(2);
    expect(g.phaseDurationMs).toBe(5000); // no volume prompt after the first night
  });

  it('voting out the last mafia ends the game for town', () => {
    let g = newGame(5);
    const mafia = byRole(g, 'mafia')[0];
    g = apply(g, { phase: 'day-vote', dayVotes: Object.fromEntries(g.players.map((p) => [p.uid, mafia.uid])) });
    g = apply(g, resolveDayVote(g));
    expect(g.phase).toBe('ended');
    expect(g.winner).toBe('town');
  });

  it('mafia win when they equal the town', () => {
    expect(getMafiaWinner([
      { role: 'mafia', isAlive: true },
      { role: 'civilian', isAlive: true },
      { role: 'civilian', isAlive: false }
    ])).toBe('mafia');
    expect(getMafiaWinner([
      { role: 'mafia', isAlive: true },
      { role: 'civilian', isAlive: true },
      { role: 'doctor', isAlive: true }
    ])).toBeNull();
  });

  it('no votes means nobody is eliminated', () => {
    let g = newGame(6);
    g = apply(g, { phase: 'day-vote', dayVotes: {} });
    g = apply(g, resolveDayVote(g));
    expect(g.phase).toBe('day-result');
    expect(g.lastEliminated).toBeNull();
    expect(g.players.every((p) => p.isAlive)).toBe(true);
  });

  it('ignores votes from dead players', () => {
    let g = newGame(6);
    const [a, b, c] = g.players;
    g = apply(g, {
      phase: 'day-vote',
      players: g.players.map((p) => (p.uid === a.uid ? { ...p, isAlive: false } : p)),
      dayVotes: { [a.uid]: c.uid, [b.uid]: g.players[3].uid }
    });
    g = apply(g, resolveDayVote(g));
    expect(g.lastEliminated).toBe(g.players[3].uid);
  });
});
