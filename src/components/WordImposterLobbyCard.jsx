import React from 'react';
import LobbyCard from './LobbyCard';
import { GAMES } from '../games/catalog';
import { dealWordImposter } from '../games/wordImposter/logic';

export default function WordImposterLobbyCard(props) {
  return <LobbyCard {...props} game={GAMES.wordImposter} deal={dealWordImposter} />;
}
