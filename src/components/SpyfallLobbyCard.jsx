import React from 'react';
import LobbyCard from './LobbyCard';
import { GAMES } from '../games/catalog';
import { dealSpyfall } from '../games/spyfall/logic';

export default function SpyfallLobbyCard(props) {
  return <LobbyCard {...props} game={GAMES.spyfall} deal={dealSpyfall} />;
}
