import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WheelSpin from '../../components/ForfeitWheel';
import WheelSetupModal from '../../components/WheelSetupModal';
import { loadPassPlayPlayers } from '../passPlay';

/** Spin the Wheel on a single device - same wheel as rooms, state kept locally. */
export default function OnePhoneWheel() {
  const navigate = useNavigate();
  const players = useMemo(() => loadPassPlayPlayers(), []);
  const fakeRoom = useMemo(() => ({ id: 'local', players }), [players]);
  const [activity, setActivity] = useState(null);
  const [showSetup, setShowSetup] = useState(true);

  const spin = () => {
    if (!activity || activity.options.length < 2) return;
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    const result = activity.options[values[0] % activity.options.length];
    setActivity({
      ...activity,
      state: 'spinning',
      resultId: result.id,
      spinStartTime: Date.now(),
      spinDuration: 4000 + (values[1] % 3000),
      spinCount: (activity.spinCount || 0) + 1
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/one-phone')}
            aria-label="Back to Pass and Play"
            className="w-11 h-11 bg-slate-800 border border-slate-700 rounded-full text-slate-300 hover:text-white flex items-center justify-center"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white text-lg font-black uppercase tracking-tight">Spin the Wheel</h1>
          <div className="w-11" />
        </div>

        {activity ? (
          <WheelSpin
            activity={activity}
            room={fakeRoom}
            isHost
            onSpin={spin}
            onEndActivity={() => {
              setActivity(null);
              setShowSetup(true);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold"
          >
            Set up a wheel
          </button>
        )}
      </div>

      {showSetup && (
        <WheelSetupModal
          room={fakeRoom}
          onClose={() => setShowSetup(false)}
          onLaunch={(wheelData) => {
            setShowSetup(false);
            setActivity({ ...wheelData, state: 'idle', resultId: null, spinStartTime: null, spinDuration: null, spinCount: 0 });
          }}
        />
      )}
    </div>
  );
}
