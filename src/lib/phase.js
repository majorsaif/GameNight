/** Standard fields for entering a new phase (pure, no Firebase imports). */
export function enterPhase(activity, phase, durationMs = null, now = Date.now()) {
  return {
    phase,
    phaseId: (activity?.phaseId ?? 0) + 1,
    phaseStartedAt: now,
    phaseDurationMs: durationMs,
    phaseEndsAt: durationMs != null ? now + durationMs : null
  };
}
