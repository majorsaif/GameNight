import React from 'react';
import { Users } from 'lucide-react';
import { Badge, Card } from '../ui';

/** One game in a list: artwork, name, one-line pitch and player count. */
export default function GameCard({ game, playerCount = null, disabled = false, onSelect }) {
  const short = playerCount != null && playerCount < game.minPlayers;
  return (
    <Card
      as="button"
      type="button"
      padding="none"
      disabled={disabled}
      onClick={onSelect}
      className="group flex w-full flex-col overflow-hidden text-left transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed"
    >
      <span className="block w-full overflow-hidden border-b border-line">
        <img src={game.art} alt="" className="aspect-[16/8] w-full scale-110 object-cover" />
      </span>
      <span className="flex w-full flex-1 flex-col gap-2 p-4">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:flex-col md:items-start">
          <span className="text-xl font-semibold text-ink">{game.name}</span>
          <Badge tone={short ? 'warning' : 'neutral'} icon={Users}>{game.minPlayers}+ players</Badge>
        </span>
        <span className="text-sm text-ink-muted">{game.tagline}</span>
      </span>
    </Card>
  );
}
