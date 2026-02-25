// Fixed color palette for player avatars
const AVATAR_COLORS = [
  'bg-purple-600',
  'bg-pink-600',
  'bg-blue-600',
  'bg-orange-600',
  'bg-green-600',
  'bg-red-600',
  'bg-teal-600',
];

/**
 * Get initials from a name
 */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate avatar color deterministically from UID
 */
function generateAvatarColorFromUid(uid) {
  if (!uid) return AVATAR_COLORS[0];
  
  // Simple hash function to get consistent color for same UID
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash) + uid.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Get avatar color for a player - returns existing or generates and saves new one
 * This is the single source of truth for avatar colors
 */
export function getAvatarColor(player, roomId = null) {
  // If player already has a color, return it
  if (player.avatarColor) {
    return player.avatarColor;
  }
  
  // Generate color from UID
  const color = generateAvatarColorFromUid(player.id || player.uid);
  
  // If we have a roomId, save the color back to localStorage
  if (roomId) {
    const rooms = JSON.parse(localStorage.getItem('gamenight_rooms') || '{}');
    if (rooms[roomId]) {
      const playerIndex = rooms[roomId].players.findIndex(p => p.id === player.id || p.uid === player.uid);
      if (playerIndex !== -1) {
        rooms[roomId].players[playerIndex].avatarColor = color;
        localStorage.setItem('gamenight_rooms', JSON.stringify(rooms));
        
        // Trigger storage event for cross-tab sync
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'gamenight_rooms',
          newValue: JSON.stringify(rooms),
          url: window.location.href,
          storageArea: localStorage
        }));
      }
    }
  }
  
  return color;
}

/**
 * Backfill avatar colors for existing players in a room
 */
export function backfillAvatarColors(roomId) {
  const rooms = JSON.parse(localStorage.getItem('gamenight_rooms') || '{}');
  if (!rooms[roomId]) return;
  
  let updated = false;
  rooms[roomId].players = rooms[roomId].players.map(player => {
    if (!player.avatarColor) {
      updated = true;
      return {
        ...player,
        avatarColor: generateAvatarColorFromUid(player.id || player.uid)
      };
    }
    return player;
  });
  
  if (updated) {
    localStorage.setItem('gamenight_rooms', JSON.stringify(rooms));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'gamenight_rooms',
      newValue: JSON.stringify(rooms),
      url: window.location.href,
      storageArea: localStorage
    }));
  }
}
