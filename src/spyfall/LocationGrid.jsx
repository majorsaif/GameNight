import React from 'react';
import { MapPin } from 'lucide-react';
import LOCATIONS from './locations';
import { SectionHeading, cn } from '../ui';

const allLocations = LOCATIONS.map((l) => l.name);

/** Tap-to-cross-out list of every possible location. Marks are private to this phone. */
export function LocationGrid({ crossedOut, onToggle, ownLocation = null }) {
  return (
    <section>
      <SectionHeading action={<span className="text-sm text-ink-faint">Tap to cross out</span>}>Possible locations</SectionHeading>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {allLocations.map((loc) => {
          const isMine = loc === ownLocation;
          const isCrossed = crossedOut.has(loc);
          return (
            <li key={loc}>
              <button
                type="button"
                aria-pressed={isCrossed}
                onClick={() => onToggle(loc)}
                className={cn(
                  'flex min-h-tap w-full items-center gap-2 rounded-control border px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
                  isMine ? 'border-spyfall/60 bg-spyfall/10 text-spyfall' : 'border-line bg-surface text-ink hover:border-line-strong',
                  isCrossed && 'text-ink-faint line-through opacity-50'
                )}
              >
                {isMine && <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 break-words">{loc}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
