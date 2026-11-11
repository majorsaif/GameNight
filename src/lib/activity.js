import { useEffect, useRef, useState } from 'react';
import { runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { roomRef } from '../hooks/useRoom';

function prefixActivityUpdates(updates) {
  const out = {};
  Object.entries(updates || {}).forEach(([key, value]) => {
    out[`activeActivity.${key}`] = value === undefined ? null : value;
  });
  out.lastActivity = serverTimestamp();
  return out;
}

/**
 * Plain write to fields of activeActivity (keys are relative, e.g. 'phase').
 * Use for writes that can't conflict (a player's own vote, arrayUnion, ...).
 */
export async function updateActivity(roomId, updates) {
  await updateDoc(roomRef(roomId), prefixActivityUpdates(updates));
}

/**
 * Guarded state-machine step. Reads the latest activity inside a transaction and
 * only applies `build(activity, room)` if the activity is still the expected
 * type/phase/phaseId. This makes it safe for the host *and* a fallback client
 * to try the same transition: exactly one wins, the others no-op.
 *
 * `build` returns relative updates, or null to skip.
 * Returns true when the write was applied.
 */
export async function transitionActivity(roomId, { type, phase, phaseId } = {}, build) {
  const ref = roomRef(roomId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const room = snap.data();
    const activity = room.activeActivity;
    if (!activity) return false;
    if (type && activity.type !== type) return false;
    const allowedPhases = phase == null ? null : (Array.isArray(phase) ? phase : [phase]);
    if (allowedPhases && !allowedPhases.includes(activity.phase)) return false;
    if (phaseId != null && (activity.phaseId ?? 0) !== phaseId) return false;

    const updates = build(activity, room);
    if (!updates) return false;
    tx.update(ref, prefixActivityUpdates(updates));
    return true;
  });
}

export { enterPhase } from './phase';

/** Remaining whole seconds until `endsAt` (ms), ticking every 250ms. */
export function useCountdown(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/**
 * Fires `advance` once when `due` becomes true.
 * The host fires immediately; everyone else waits `fallbackDelayMs` (staggered
 * by `fallbackRank`) so the game keeps moving if the host's phone sleeps or the
 * host leaves. `advance` must be idempotent (use transitionActivity).
 *
 * `key` identifies the specific occurrence (e.g. phaseId) so it can fire again
 * in a later phase.
 */
export function useAutoAdvance({ key, due, dueAt = null, isHost, fallbackRank = 0, advance, fallbackDelayMs = 4000 }) {
  const firedRef = useRef(null);
  const attemptsRef = useRef({ key: null, count: 0 });
  const advanceRef = useRef(advance);
  const [retryTick, setRetryTick] = useState(0);
  advanceRef.current = advance;

  useEffect(() => {
    if (key == null) return undefined;
    if (firedRef.current === key) return undefined;
    if (attemptsRef.current.key !== key) attemptsRef.current = { key, count: 0 };

    const isRetry = attemptsRef.current.count > 0;
    const delayForRole = isHost || isRetry ? 0 : fallbackDelayMs + Math.max(0, fallbackRank) * 1500;
    let timer = null;
    let retryTimer = null;

    const scheduleRetry = () => {
      // e.g. our own vote hadn't reached the server when the transaction read it
      if (attemptsRef.current.count >= 6) return;
      firedRef.current = null;
      retryTimer = setTimeout(() => setRetryTick((n) => n + 1), 1500);
    };

    const fire = () => {
      if (firedRef.current === key) return;
      firedRef.current = key;
      attemptsRef.current.count += 1;
      Promise.resolve(advanceRef.current?.())
        .then((applied) => {
          if (applied === false) scheduleRetry();
        })
        .catch((error) => {
          console.warn('Auto-advance failed:', error?.code || error);
          scheduleRetry();
        });
    };

    if (dueAt != null) {
      const wait = Math.max(0, dueAt - Date.now()) + delayForRole;
      timer = setTimeout(fire, wait);
    } else if (due) {
      timer = setTimeout(fire, delayForRole);
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [key, due, dueAt, isHost, fallbackRank, fallbackDelayMs, retryTick]);
}
