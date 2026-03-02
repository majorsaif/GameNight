import { useCallback } from 'react';

function createAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  return AudioCtx ? new AudioCtx() : null;
}

async function closeContextLater(ctx, delayMs) {
  window.setTimeout(async () => {
    try {
      if (ctx.state !== 'closed') {
        await ctx.close();
      }
    } catch {
      // no-op
    }
  }, delayMs);
}

export function useMafiaSound() {
  const playShh = useCallback(async () => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 2.0;
    const frameCount = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(0.7, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration);

    await closeContextLater(ctx, 2300);
  }, []);

  const playMurder = useCallback(async () => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.42);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.46);

    await closeContextLater(ctx, 700);
  }, []);

  const playAngelic = useCallback(async () => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(659.25, now + 0.25);
    osc.frequency.linearRampToValueAtTime(880, now + 0.5);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.95);

    await closeContextLater(ctx, 1200);
  }, []);

  const playDetective = useCallback(async () => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const frequencies = [349.23, 415.3, 523.25];

    frequencies.forEach((frequency, idx) => {
      const start = now + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.09);
    });

    await closeContextLater(ctx, 500);
  }, []);

  const playWaking = useCallback(async () => {
    const ctx = createAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.7);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.78);

    await closeContextLater(ctx, 1000);
  }, []);

  return {
    playShh,
    playMurder,
    playAngelic,
    playDetective,
    playWaking
  };
}
