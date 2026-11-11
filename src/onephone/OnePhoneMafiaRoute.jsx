import React from 'react';
import { useLocation } from 'react-router-dom';
import OnePhoneMafiaLobby from './modes/OnePhoneMafiaLobby';
import OnePhoneMafia from './modes/OnePhoneMafia';
import { loadPassPlayPlayers } from './passPlay';

export default function OnePhoneMafiaRoute() {
  const location = useLocation();
  const routeState = location.state || {};

  if (!routeState.started) {
    const players = Array.isArray(routeState.players) && routeState.players.length > 0
      ? routeState.players
      : loadPassPlayPlayers();
    return <OnePhoneMafiaLobby players={players} />;
  }

  const players = Array.isArray(routeState.players) ? routeState.players : [];
  const narrator = routeState.narrator || null;
  const rules = routeState.rules || { mafiaCount: 1, doctorEnabled: true, detectiveEnabled: true };
  return <OnePhoneMafia players={players} narrator={narrator} rules={rules} />;
}
