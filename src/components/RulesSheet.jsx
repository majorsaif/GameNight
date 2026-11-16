import React from 'react';
import { Sheet } from '../ui';

/** "How to play" for a game, as a sheet: short sections instead of a wall of text. */
export default function RulesSheet({ open, onClose, rules }) {
  if (!rules) return null;
  return (
    <Sheet open={open} onClose={onClose} title={`How to play ${rules.title}`} description={rules.summary}>
      <div className="space-y-5 pt-2">
        {rules.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="text-base font-semibold text-ink">{section.heading}</h3>
            {section.text && <p className="mt-1 text-sm text-ink-muted">{section.text}</p>}
            {section.items && (
              <dl className="mt-2 space-y-2">
                {section.items.map((item) => (
                  <div key={item.role} className="flex gap-3 text-sm">
                    <dt className="w-20 shrink-0 font-semibold text-ink">{item.role}</dt>
                    <dd className="min-w-0 flex-1 text-ink-muted">{item.text}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
      </div>
    </Sheet>
  );
}
