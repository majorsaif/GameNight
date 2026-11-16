import React from 'react';
import { Stepper, Toggle } from '../ui';
import { maxMafiaFor } from '../games/mafia/logic';
import { maxImpostersFor } from '../games/wordImposter/logic';
import { maxSpiesFor } from '../games/spyfall/logic';

const formatMinutes = (value) => `${value} min`;
// Voting time is stored in minutes and stepped in half minutes
const formatVotingStep = (step) => {
  if (step === 1) return '30 sec';
  const minutes = step / 2;
  return Number.isInteger(minutes) ? `${minutes} min` : `${Math.floor(minutes)}m 30s`;
};

export const DEFAULT_RULES = {
  mafia: { mafiaCount: 1, doctor: true, detective: true, discussionTime: 3, votingTime: 1 },
  wordImposter: { imposterCount: 1, showCategory: true, imposterNoWord: false },
  spyfall: { spyCount: 1, showRoles: true, discussionTime: 8 }
};

/** Short rule summaries shown as chips in a lobby. */
export function summarizeRules(type, rules = {}) {
  if (type === 'mafia') {
    return [
      `${rules.mafiaCount || 1} Mafia`,
      rules.doctor ? 'Doctor' : null,
      rules.detective ? 'Detective' : null,
      `${rules.discussionTime || 3} min talk`
    ].filter(Boolean);
  }
  if (type === 'wordImposter') {
    const count = rules.imposterCount || 1;
    return [
      `${count} imposter${count > 1 ? 's' : ''}`,
      rules.imposterNoWord ? 'No word for imposters' : 'Decoy word',
      rules.showCategory !== false ? 'Category shown' : null
    ].filter(Boolean);
  }
  if (type === 'spyfall') {
    const count = rules.spyCount || 1;
    return [
      `${count} sp${count > 1 ? 'ies' : 'y'}`,
      `${rules.discussionTime || 8} min round`,
      rules.showRoles !== false ? 'Roles shown' : 'No roles'
    ];
  }
  return [];
}

/** Returns an error message if the rules don't fit the player count, else null. */
export function validateRules(type, rules, playerCount) {
  if (type === 'mafia') {
    const max = maxMafiaFor(playerCount);
    if ((rules.mafiaCount || 1) > max) return `With ${playerCount} players you can have at most ${max} Mafia.`;
  }
  if (type === 'wordImposter') {
    const max = maxImpostersFor(playerCount);
    if ((rules.imposterCount || 1) > max) return `With ${playerCount} players you can have at most ${max} imposter${max > 1 ? 's' : ''}.`;
  }
  if (type === 'spyfall') {
    const max = maxSpiesFor(playerCount);
    if ((rules.spyCount || 1) > max) return `With ${playerCount} players you can have at most ${max} sp${max > 1 ? 'ies' : 'y'}.`;
  }
  return null;
}

/**
 * The settings form for a game. `onChange` receives a patch.
 * `timed` hides the timers for Pass & Play, which has no clocks to set.
 */
export default function GameSettings({ type, rules, onChange, playerCount, timed = true }) {
  if (type === 'mafia') {
    return (
      <div className="divide-y divide-line">
        <Stepper label="Mafia" value={rules.mafiaCount || 1} min={1} max={maxMafiaFor(playerCount)} onChange={(v) => onChange({ mafiaCount: v })} />
        {timed && (
          <>
            <Stepper label="Discussion" value={rules.discussionTime || 3} min={1} max={10} format={formatMinutes} onChange={(v) => onChange({ discussionTime: v })} />
            <Stepper
              label="Voting"
              value={Math.max(1, Math.min(6, Math.round((rules.votingTime || 0.5) * 2)))}
              min={1}
              max={6}
              format={formatVotingStep}
              onChange={(v) => onChange({ votingTime: v / 2 })}
            />
          </>
        )}
        <Toggle label="Doctor" description="Protects one player each night" checked={Boolean(rules.doctor)} onChange={(v) => onChange({ doctor: v })} />
        <Toggle label="Detective" description="Checks one player each night" checked={Boolean(rules.detective)} onChange={(v) => onChange({ detective: v })} />
      </div>
    );
  }
  if (type === 'wordImposter') {
    return (
      <div className="divide-y divide-line">
        <Stepper label="Imposters" value={rules.imposterCount || 1} min={1} max={maxImpostersFor(playerCount)} onChange={(v) => onChange({ imposterCount: v })} />
        <Toggle label="Show category" description="Everyone sees the word's category as a hint" checked={rules.showCategory !== false} onChange={(v) => onChange({ showCategory: v })} />
        <Toggle label="Imposter gets no word" description="When off, imposters get a similar decoy word" checked={Boolean(rules.imposterNoWord)} onChange={(v) => onChange({ imposterNoWord: v })} />
      </div>
    );
  }
  if (type === 'spyfall') {
    return (
      <div className="divide-y divide-line">
        <Stepper label="Spies" value={rules.spyCount || 1} min={1} max={maxSpiesFor(playerCount)} onChange={(v) => onChange({ spyCount: v })} />
        <Stepper label="Round time" value={rules.discussionTime || 8} min={1} max={15} format={formatMinutes} onChange={(v) => onChange({ discussionTime: v })} />
        <Toggle label="Show roles" description="Everyone but the spy gets a role at the location" checked={rules.showRoles !== false} onChange={(v) => onChange({ showRoles: v })} />
      </div>
    );
  }
  return null;
}
