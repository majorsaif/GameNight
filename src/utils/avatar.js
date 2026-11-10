// Fixed palette for player avatars. Classes are listed in full so Tailwind keeps them.
const AVATAR_COLORS = [
  'bg-purple-600',
  'bg-pink-600',
  'bg-blue-600',
  'bg-orange-600',
  'bg-green-600',
  'bg-red-600',
  'bg-teal-600',
];

export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function colorForUid(uid) {
  if (!uid) return AVATAR_COLORS[0];
  return AVATAR_COLORS[hashString(String(uid)) % AVATAR_COLORS.length];
}

/**
 * Avatar colour for a player object ({ id } or { uid }). Deterministic per user,
 * so it never needs to be written back to Firestore.
 */
export function getAvatarColor(player) {
  if (!player) return AVATAR_COLORS[0];
  if (player.avatarColor) return player.avatarColor;
  return colorForUid(player.id || player.uid);
}
