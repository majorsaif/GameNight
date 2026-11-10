import React from 'react';
import LobbyCard, { Toggle } from './LobbyCard';
import AnimatedNumberStepper from './AnimatedNumberStepper';
import { dealMafiaGame, MAFIA_MIN_PLAYERS, maxMafiaFor } from '../games/mafia/logic';

const formatMinutes = (value) => `${value} min`;
const formatVotingTime = (step) => {
  if (step === 1) return '30s';
  const minutes = step / 2;
  return Number.isInteger(minutes) ? `${minutes} min` : `${Math.floor(minutes)} min 30s`;
};

export default function MafiaLobbyCard(props) {
  return (
    <LobbyCard
      {...props}
      caseName="MAFIA"
      type="mafia"
      route="mafia"
      minPlayers={MAFIA_MIN_PLAYERS}
      deal={dealMafiaGame}
      summarizeRules={(rules) => [
        `${rules.mafiaCount || 1} mafia`,
        rules.doctor ? 'doctor' : null,
        rules.detective ? 'detective' : null,
        `${rules.discussionTime || 3} min talk`
      ].filter(Boolean).join(' · ')}
      validateRules={(rules, count) => {
        const max = maxMafiaFor(count);
        if ((rules.mafiaCount || 1) > max) return `With ${count} players you can have at most ${max} mafia.`;
        return null;
      }}
      renderRulesEditor={(rules, set, count) => (
        <>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Number of Mafia</p>
            <AnimatedNumberStepper
              value={rules.mafiaCount || 1}
              min={1}
              max={maxMafiaFor(count)}
              valueWidthClass="w-16"
              onChange={(v) => set({ mafiaCount: v })}
            />
          </div>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Discussion Time</p>
            <AnimatedNumberStepper
              value={rules.discussionTime || 3}
              min={1}
              max={10}
              valueWidthClass="w-28"
              formatValue={formatMinutes}
              onChange={(v) => set({ discussionTime: v })}
            />
          </div>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Voting Time</p>
            <AnimatedNumberStepper
              value={Math.max(1, Math.min(6, Math.round((rules.votingTime || 0.5) * 2)))}
              min={1}
              max={6}
              valueWidthClass="w-28"
              formatValue={formatVotingTime}
              onChange={(v) => set({ votingTime: v / 2 })}
            />
          </div>
          <Toggle label="Doctor 🩺" description="Can save one player each night" checked={Boolean(rules.doctor)} onChange={(v) => set({ doctor: v })} />
          <Toggle label="Detective 🔍" description="Can investigate one player each night" checked={Boolean(rules.detective)} onChange={(v) => set({ detective: v })} />
        </>
      )}
    />
  );
}
