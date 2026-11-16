import React from 'react';
import LobbyCard from './LobbyCard';
import { GAMES } from '../games/catalog';
import { dealMafiaGame } from '../games/mafia/logic';

export default function MafiaLobbyCard(props) {
  return <LobbyCard {...props} game={GAMES.mafia} deal={dealMafiaGame} />;
}
