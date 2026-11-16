import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { findRoomByCode, joinRoom } from '../hooks/useRoom';
import { Button, LoadingScreen, StatusScreen } from '../ui';

/** Short invite links: itsgamesnight.com/join/ABC234 */
export default function JoinByCode() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading, authError } = useAuth();
  const [error, setError] = useState(null);
  const startedRef = useRef(false);
  const shownCode = String(code || '').toUpperCase();

  useEffect(() => {
    document.title = `Join room ${shownCode} | Its Games Night`;
  }, [shownCode]);

  useEffect(() => {
    if (loading || !user || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const room = await findRoomByCode(code);
        if (!room) {
          setError('There is no active room with that code. It may have ended, or the code may be mistyped.');
          return;
        }
        await joinRoom(room.id, user);
        navigate(`/room/${room.id}`, { replace: true });
      } catch (err) {
        setError(err?.message || "Couldn't join this room. Check your connection and try again.");
      }
    })();
  }, [loading, user, code, navigate]);

  if (!loading && !user && !authError) {
    return <Navigate to="/onboarding" replace state={{ redirectTo: `/join/${code}` }} />;
  }

  if (error || authError) {
    return (
      <StatusScreen
        icon={DoorOpen}
        tone="danger"
        title={`Couldn't join room ${shownCode}`}
        message={error || "Couldn't connect to the game server. Check your internet connection and reload."}
      >
        <Button as={Link} to="/" block>Go to home</Button>
      </StatusScreen>
    );
  }

  return <LoadingScreen label={`Joining room ${shownCode}`} />;
}
