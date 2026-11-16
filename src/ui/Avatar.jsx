import React from 'react';
import { cn } from './cn';
import { getAvatarColor, getInitials } from '../utils/avatar';

// Players carry a Tailwind class name as their colour (it's part of the room
// data). Map each one to a shade that keeps white initials readable.
const AVATAR_BACKGROUNDS = {
  'bg-purple-600': '#7c3aed',
  'bg-pink-600': '#c8206f',
  'bg-blue-600': '#2563eb',
  'bg-orange-600': '#c2410c',
  'bg-green-600': '#15803d',
  'bg-red-600': '#c81e1e',
  'bg-teal-600': '#0f766e'
};
const FALLBACK_BACKGROUND = '#40477a';

const SIZES = {
  xs: 'h-7 w-7 text-xs',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
  '2xl': 'h-24 w-24 text-3xl'
};

export function playerName(player) {
  return player?.displayNameForGame || player?.displayName || 'Player';
}

/**
 * A player's photo, or their initials on their colour.
 * Pass a `player` ({ displayName, photo, avatarColor, id|uid }) or `name`/`photo`/`color`.
 */
export function Avatar({ player = null, name, photo, color, size = 'md', dimmed = false, className }) {
  const label = name ?? playerName(player);
  const src = photo ?? player?.photo ?? null;
  const colorClass = color ?? (player ? getAvatarColor(player) : null);
  const shared = cn('shrink-0 rounded-full', SIZES[size], dimmed && 'opacity-40 grayscale', className);

  if (src) {
    return <img src={src} alt="" title={label} className={cn(shared, 'object-cover')} />;
  }
  return (
    <span
      title={label}
      aria-hidden="true"
      style={{ backgroundColor: AVATAR_BACKGROUNDS[colorClass] || FALLBACK_BACKGROUND }}
      className={cn(shared, 'inline-flex select-none items-center justify-center font-bold text-white')}
    >
      {getInitials(label)}
    </span>
  );
}

/** Overlapping row of avatars, collapsing extras into "+N". */
export function AvatarStack({ players = [], max = 6, size = 'sm', isDimmed = null, ringClass = 'ring-bg', className }) {
  const visible = players.slice(0, max);
  const extra = players.length - visible.length;
  return (
    <span className={cn('flex items-center', className)}>
      {visible.map((player, index) => (
        <Avatar
          key={player.id || player.uid}
          player={player}
          size={size}
          dimmed={isDimmed ? isDimmed(player) : false}
          className={cn('ring-2', ringClass, index > 0 && '-ml-2')}
        />
      ))}
      {extra > 0 && (
        <span className={cn('-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-semibold text-ink-muted ring-2', ringClass, SIZES[size])}>
          +{extra}
        </span>
      )}
    </span>
  );
}
