import React from 'react';
import LobbyCard, { Toggle } from './LobbyCard';
import AnimatedNumberStepper from './AnimatedNumberStepper';
import { dealSpyfall, maxSpiesFor, SPYFALL_MIN_PLAYERS } from '../games/spyfall/logic';

export default function SpyfallLobbyCard(props) {
  return (
    <LobbyCard
      {...props}
      caseName="SPYFALL"
      type="spyfall"
      route="spyfall"
      minPlayers={SPYFALL_MIN_PLAYERS}
      deal={dealSpyfall}
      accent="bg-indigo-600 hover:bg-indigo-500"
      summarizeRules={(rules) => [
        `${rules.spyCount || 1} spy${(rules.spyCount || 1) > 1 ? 's' : ''}`,
        `${rules.discussionTime || 8} min`,
        rules.showRoles !== false ? 'roles shown' : 'no roles'
      ].join(' · ')}
      validateRules={(rules, count) => {
        const max = maxSpiesFor(count);
        if ((rules.spyCount || 1) > max) return `With ${count} players you can have at most ${max} spy${max > 1 ? 's' : ''}.`;
        return null;
      }}
      renderRulesEditor={(rules, set, count) => (
        <>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Number of Spies</p>
            <AnimatedNumberStepper
              value={rules.spyCount || 1}
              min={1}
              max={maxSpiesFor(count)}
              valueWidthClass="w-16"
              onChange={(v) => set({ spyCount: v })}
            />
          </div>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Round Time</p>
            <AnimatedNumberStepper
              value={rules.discussionTime || 8}
              min={1}
              max={15}
              valueWidthClass="w-28"
              formatValue={(v) => `${v} min`}
              onChange={(v) => set({ discussionTime: v })}
            />
          </div>
          <Toggle
            label="Show Roles"
            description="Non-spy players see their role at the location"
            checked={rules.showRoles !== false}
            onChange={(v) => set({ showRoles: v })}
            onClass="bg-indigo-600"
          />
        </>
      )}
    />
  );
}
