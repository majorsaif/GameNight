import React from 'react';
import LobbyCard, { Toggle } from './LobbyCard';
import AnimatedNumberStepper from './AnimatedNumberStepper';
import { dealWordImposter, maxImpostersFor, WORD_IMPOSTER_MIN_PLAYERS } from '../games/wordImposter/logic';

export default function WordImposterLobbyCard(props) {
  return (
    <LobbyCard
      {...props}
      caseName="WORD IMPOSTER"
      type="wordImposter"
      route="word-imposter"
      minPlayers={WORD_IMPOSTER_MIN_PLAYERS}
      deal={dealWordImposter}
      accent="bg-teal-600 hover:bg-teal-500"
      summarizeRules={(rules) => [
        `${rules.imposterCount || 1} imposter${(rules.imposterCount || 1) > 1 ? 's' : ''}`,
        rules.imposterNoWord ? 'imposter has no word' : 'imposter gets a decoy word',
        rules.showCategory !== false ? 'category shown' : null
      ].filter(Boolean).join(' · ')}
      validateRules={(rules, count) => {
        const max = maxImpostersFor(count);
        if ((rules.imposterCount || 1) > max) return `With ${count} players you can have at most ${max} imposter${max > 1 ? 's' : ''}.`;
        return null;
      }}
      renderRulesEditor={(rules, set, count) => (
        <>
          <div>
            <p className="text-white font-semibold block mb-2 text-sm text-center">Number of Imposters</p>
            <AnimatedNumberStepper
              value={rules.imposterCount || 1}
              min={1}
              max={maxImpostersFor(count)}
              valueWidthClass="w-16"
              onChange={(v) => set({ imposterCount: v })}
            />
          </div>
          <Toggle
            label="Show Category"
            description="Everyone sees the word's category as a hint"
            checked={rules.showCategory !== false}
            onChange={(v) => set({ showCategory: v })}
            onClass="bg-teal-600"
          />
          <Toggle
            label="Imposter gets no word"
            description="Off: imposters get a different, similar word instead"
            checked={Boolean(rules.imposterNoWord)}
            onChange={(v) => set({ imposterNoWord: v })}
            onClass="bg-teal-600"
          />
        </>
      )}
    />
  );
}
