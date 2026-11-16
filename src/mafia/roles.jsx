import React from 'react';
import { Search, Skull, Stethoscope, User } from 'lucide-react';
import mafiaRoleCardImage from '../assets/mafia/mafia-card.webp';
import detectiveRoleCardImage from '../assets/mafia/detective-card.webp';
import doctorRoleCardImage from '../assets/mafia/doctor-card.webp';
import civilianRoleCardImage from '../assets/mafia/civilian-card.webp';
import cardBackImage from '../assets/mafia/card-back.webp';
import { Badge } from '../ui';
import { Stamp } from '../components/props';

export const MAFIA_ROLES = {
  mafia: { label: 'Mafia', tone: 'mafia', icon: Skull, image: mafiaRoleCardImage },
  doctor: { label: 'Doctor', tone: 'success', icon: Stethoscope, image: doctorRoleCardImage },
  detective: { label: 'Detective', tone: 'warning', icon: Search, image: detectiveRoleCardImage },
  civilian: { label: 'Civilian', tone: 'neutral', icon: User, image: civilianRoleCardImage }
};

export function roleMeta(role) {
  return MAFIA_ROLES[role] || MAFIA_ROLES.civilian;
}

export function RoleBadge({ role }) {
  const meta = roleMeta(role);
  return <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>;
}

const FACE = 'absolute inset-0 h-full w-full rounded-card border border-line-strong object-cover shadow-pop [backface-visibility:hidden]';

/** The illustrated role card. Face down until `flipped`; tap to turn it over. */
export function RoleCard({ role, flipped, onToggle }) {
  const meta = roleMeta(role);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={flipped ? `Your role is ${meta.label}. Tap to hide it.` : 'Role card, face down. Tap to reveal your role.'}
      className="mx-auto block w-56 rounded-card [perspective:900px] md:w-64"
    >
      <span
        className="relative block aspect-[432/608] w-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <img src={cardBackImage} alt="" className={FACE} />
        <img src={meta.image} alt="" className={`${FACE} [transform:rotateY(180deg)]`} />
      </span>
    </button>
  );
}

const ROLE_STAMP_TONES = { mafia: 'red', doctor: 'green', detective: 'brown', civilian: 'blue' };

/** The role as a rubber stamp, for case files. */
export function RoleStamp({ role }) {
  return <Stamp tone={ROLE_STAMP_TONES[role] || 'blue'} tilt="right">{roleMeta(role).label}</Stamp>;
}
