import { Radar, VenetianMask, WholeWord } from 'lucide-react';
import mafiaArt from '../assets/mafia-button.webp';
import wordImposterArt from '../assets/word-imposter-button.webp';
import spyfallArt from '../assets/spyfall-button.webp';
import mafiaRules from '../rules/mafia';
import wordImposterRules from '../rules/wordImposter';
import spyfallRules from '../rules/spyfall';
import { MAFIA_MIN_PLAYERS } from './mafia/logic';
import { WORD_IMPOSTER_MIN_PLAYERS } from './wordImposter/logic';
import { SPYFALL_MIN_PLAYERS } from './spyfall/logic';

/** Everything the UI needs to know about each game, in one place. */
export const GAMES = {
  mafia: {
    type: 'mafia',
    name: 'Mafia',
    route: 'mafia',
    accent: 'mafia',
    icon: VenetianMask,
    art: mafiaArt,
    minPlayers: MAFIA_MIN_PLAYERS,
    tagline: 'Hidden roles. The Mafia strike at night and the town votes by day.',
    rules: mafiaRules
  },
  wordImposter: {
    type: 'wordImposter',
    name: 'Word Imposter',
    route: 'word-imposter',
    accent: 'imposter',
    icon: WholeWord,
    art: wordImposterArt,
    minPlayers: WORD_IMPOSTER_MIN_PLAYERS,
    tagline: 'Everyone shares a secret word, except the imposter.',
    rules: wordImposterRules
  },
  spyfall: {
    type: 'spyfall',
    name: 'Spyfall',
    route: 'spyfall',
    accent: 'spyfall',
    icon: Radar,
    art: spyfallArt,
    minPlayers: SPYFALL_MIN_PLAYERS,
    tagline: 'Everyone knows the location, except the spy.',
    rules: spyfallRules
  }
};

export const GAME_LIST = [GAMES.mafia, GAMES.wordImposter, GAMES.spyfall];

// Full class names so Tailwind keeps them
export const ACCENT_TEXT = {
  mafia: 'text-mafia',
  imposter: 'text-imposter',
  spyfall: 'text-spyfall'
};

export const ACCENT_TINT = {
  mafia: 'bg-mafia/15 text-mafia',
  imposter: 'bg-imposter/15 text-imposter',
  spyfall: 'bg-spyfall/15 text-spyfall'
};
