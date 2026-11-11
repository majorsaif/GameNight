import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { findRoomByCode, joinRoom } from '../hooks/useRoom';
import { GameLoading } from './GameShell';

/** Short invite links: itsgamesnight.com/join/ABC234 */
export default function JoinByCode() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const room = await findRoomByCode(code);
        if (!room) {
          setError('No active room with that code. It may have ended or expired.');
          return;
        }
        await joinRoom(room.id, user);
        navigate(`/room/${room.id}`, { replace: true });
      } catch (err) {
        setError(err?.message || 'Could not join this room.');
      }
    })();
  }, [loading, user, code, navigate]);

  if (!loading && !user) {
    return <Navigate to="/onboarding" replace state={{ redirectTo: `/join/${code}` }} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center text-center gap-6 px-6">
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t join room {String(code || '').toUpperCase()}</h1>
        <p className="text-slate-400 max-w-sm">{error}</p>
        <Link to="/" className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl">
          Go home
        </Link>
      </div>
    );
  }

  return <GameLoading label="Joining room..." />;
}
