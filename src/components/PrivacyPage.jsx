import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen, ScreenHeader } from '../ui';

const SECTIONS = [
  {
    heading: 'The short version',
    body: (
      <p>
        Its Games Night has no accounts, never asks for your email and runs no ads or trackers. To play, you choose a
        nickname and, if you like, a profile photo.
      </p>
    )
  },
  {
    heading: 'What we store',
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Your nickname and optional photo, saved on your device so you don&apos;t have to re-enter them.</li>
        <li>
          While you&apos;re in a room: your nickname, a random anonymous ID and the game state, stored in Google Firebase
          so the other players can see it. Your photo is stored alongside your anonymous ID.
        </li>
        <li>Rooms are deleted automatically after 12 hours without activity.</li>
      </ul>
    )
  },
  {
    heading: 'Who can see it',
    body: (
      <p>
        Anyone with your room code or link can join the room and see the players in it. Only share codes with people
        you want to play with.
      </p>
    )
  },
  {
    heading: 'Removing your data',
    body: (
      <p>
        Open your profile on the home screen and choose <strong className="font-semibold text-ink">Log out</strong> to
        wipe your nickname and photo from this device and remove your photo from our servers. Leaving a room removes
        you from it straight away.
      </p>
    )
  },
  {
    heading: 'Services we use',
    body: (
      <p>
        The site is hosted on Vercel, and rooms run on Google Firebase (anonymous authentication and Cloud Firestore).
        These providers process data on our behalf to run the service.
      </p>
    )
  }
];

export default function PrivacyPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Privacy | Its Games Night';
  }, []);

  return (
    <Screen header={<ScreenHeader title="Privacy" onBack={() => navigate('/')} backLabel="Back to home" />} className="md:max-w-2xl">
      <p className="pt-2 text-sm text-ink-faint">Last updated November 2026</p>
      <div className="mt-section space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold text-ink">{section.heading}</h2>
            <div className="mt-2 text-base text-ink-muted">{section.body}</div>
          </section>
        ))}
      </div>
    </Screen>
  );
}
