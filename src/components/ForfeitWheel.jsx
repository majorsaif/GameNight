import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { getAvatarColor, getInitials } from '../utils/avatar';

export default function WheelSpin({ activity, room, isHost, onEndActivity, onSpin }) {
  const canvasRef = useRef(null);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastTickSegmentRef = useRef(-1);
  const [showWinnerModal, setShowWinnerModal] = useState(false);

  const options = activity.options || [];
  const segmentAngle = options.length > 0 ? (2 * Math.PI) / options.length : 0;

  useEffect(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!audioContextRef.current && Ctx) {
      try {
        audioContextRef.current = new Ctx();
      } catch {
        audioContextRef.current = null;
      }
    }
    return () => {
      audioContextRef.current?.close?.().catch(() => {});
      audioContextRef.current = null;
    };
  }, []);

  const playTick = () => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.05);
    
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + 0.05);
  };

  // Draw the wheel
  const drawWheel = (rotation) => {
    const canvas = canvasRef.current;
    if (!canvas || options.length === 0) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw segments
    options.forEach((option, index) => {
      const startAngle = rotation + index * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      // Draw segment
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = option.color;
      ctx.fill();

      // Draw border
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + segmentAngle / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      
      // Truncate text if too long
      let label = option.label;
      const maxWidth = radius * 0.6;
      const metrics = ctx.measureText(label);
      if (metrics.width > maxWidth) {
        while (ctx.measureText(label + '...').width > maxWidth && label.length > 0) {
          label = label.slice(0, -1);
        }
        label += '...';
      }
      
      ctx.fillText(label, radius * 0.65, 0);
      ctx.restore();
    });

    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw pointer at top (pointing down into wheel)
    ctx.beginPath();
    ctx.moveTo(centerX, 35);
    ctx.lineTo(centerX - 15, 5);
    ctx.lineTo(centerX + 15, 5);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  // Rotation that puts the middle of segment `index` under the pointer at the top
  const landingRotation = (index, spins = 5) => {
    const jitter = (((activity.spinCount || 1) * 7919) % 100) / 100 - 0.5; // stable per spin, within the slice
    return (2 * Math.PI * spins) + (2 * Math.PI - (index + 0.5 + jitter * 0.6) * segmentAngle);
  };

  const spinEndsAt = activity.spinStartTime && activity.spinDuration
    ? activity.spinStartTime + activity.spinDuration
    : null;
  const [now, setNow] = useState(() => Date.now());
  const isFinished = activity.state === 'result' || (activity.state === 'spinning' && spinEndsAt && now >= spinEndsAt);

  // Animate spin (every client animates locally to the shared result)
  useEffect(() => {
    if (options.length === 0) return undefined;
    const resultIndex = Math.max(0, options.findIndex((opt) => opt.id === activity.resultId));
    const finalRotation = landingRotation(resultIndex);

    if (activity.state === 'spinning' && spinEndsAt && Date.now() < spinEndsAt) {
      setIsAnimating(true);
      setShowWinnerModal(false);
      lastTickSegmentRef.current = -1;
      const startTime = activity.spinStartTime;
      const duration = activity.spinDuration;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(Math.max(elapsed / duration, 0), 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const rotation = finalRotation * easeProgress;

        setCurrentRotation(rotation);
        drawWheel(rotation);

        const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const currentSegment = Math.floor(normalizedRotation / segmentAngle) % options.length;
        if (currentSegment !== lastTickSegmentRef.current && progress < 0.95) {
          playTick();
          lastTickSegmentRef.current = currentSegment;
        }

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          setNow(Date.now());
          setShowWinnerModal(true);
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });
        }
      };

      animationRef.current = requestAnimationFrame(animate);
      return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }

    if (activity.state === 'spinning' || activity.state === 'result') {
      // Joined after the spin finished: just show where it landed
      setCurrentRotation(finalRotation);
      drawWheel(finalRotation);
      setNow(Date.now());
    } else {
      drawWheel(currentRotation);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.state, activity.spinStartTime, activity.spinDuration, activity.resultId, activity.spinCount, options.length]);

  // Redraw on resize
  useEffect(() => {
    drawWheel(currentRotation);
    const handleResize = () => drawWheel(currentRotation);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRotation, options]);

  const canSpin = isHost && !isAnimating && (activity.state === 'idle' || isFinished);
  const handleSpin = () => {
    if (canSpin) onSpin(activity);
  };

  const winnerOption = options.find((opt) => opt.id === activity.resultId);
  const winnerPlayer = activity.type === 'playerWheel' && winnerOption
    ? room.players.find((p) => p.id === winnerOption.playerId)
    : null;

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-bold text-slate-300">{activity.type === 'playerWheel' ? 'Player Wheel' : 'Wheel Spin'}</h3>
        {isHost && (
          <button
            onClick={() => onEndActivity()}
            className="px-3 py-1 bg-red-600/20 border border-red-500/50 hover:bg-red-600/30 text-red-400 text-xs font-bold rounded-full transition-colors whitespace-nowrap"
          >
            Remove
          </button>
        )}
      </div>

      {/* Canvas */}
      <div className="flex flex-col items-center gap-4">
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          className="max-w-full"
        />

        {/* Spin Button */}
        {canSpin && (
          <button
            onClick={handleSpin}
            disabled={isAnimating}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full transition-all"
          >
            {activity.state === 'idle' ? 'Spin the Wheel!' : 'Spin Again'}
          </button>
        )}

        {/* Winner Banner - Always show below wheel when result is available */}
        {!isHost && activity.state === 'idle' && (
          <p className="text-slate-400 text-sm">Waiting for the host to spin...</p>
        )}

        {isFinished && !isAnimating && winnerOption && (
          <div className="w-full bg-gradient-to-r from-violet-600/20 to-purple-600/20 border-2 border-violet-500 rounded-xl p-4 text-center">
            <div className="flex flex-col items-center gap-3">
              {winnerPlayer && (
                <div
                  className={`w-16 h-16 rounded-full ${getAvatarColor(winnerPlayer, room.id)} flex items-center justify-center text-white text-xl font-bold border-4 border-violet-400`}
                >
                  {getInitials(winnerPlayer.displayNameForGame || winnerPlayer.displayName)}
                </div>
              )}
              <div>
                <p className="text-violet-300 text-sm font-medium mb-1">Winner!</p>
                <p className="text-white text-2xl font-bold">{winnerOption.label}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Winner Modal - Shows immediately after spin completes */}
      {showWinnerModal && winnerOption && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-4 border-violet-500 rounded-3xl p-12 max-w-md mx-4 text-center shadow-2xl">
            <div className="text-7xl mb-6">🎉</div>
            {winnerPlayer && (
              <div
                className={`w-24 h-24 rounded-full ${getAvatarColor(winnerPlayer, room.id)} flex items-center justify-center text-white text-3xl font-bold border-4 border-violet-400 mx-auto mb-4`}
              >
                {getInitials(winnerPlayer.displayNameForGame || winnerPlayer.displayName)}
              </div>
            )}
            <h2 className="text-3xl font-black text-white mb-3">
              {winnerOption.label}
            </h2>
            <p className="text-2xl text-violet-400 font-bold mb-8">
              {activity.type === 'playerWheel' ? 'is selected!' : 'wins!'}
            </p>
            <button
              onClick={() => setShowWinnerModal(false)}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
