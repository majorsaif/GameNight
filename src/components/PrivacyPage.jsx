import React from 'react';
import { Link } from 'react-router-dom';
import GameNightLogo from './GameNightLogo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-10">
      <div className="max-w-2xl mx-auto text-slate-300 space-y-6">
        <Link to="/" aria-label="Its Games Night home"><GameNightLogo /></Link>
        <h1 className="text-3xl font-bold text-white">Privacy</h1>
        <p className="text-sm text-slate-500">Last updated: November 2026</p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">The short version</h2>
          <p>
            Its Games Night doesn&apos;t have accounts, doesn&apos;t ask for your email and doesn&apos;t run ads or
            trackers. To play, you choose a nickname and, if you want, a profile photo.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">What we store</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your nickname and optional photo, saved on your device so you don&apos;t have to re-enter them.</li>
            <li>
              While you&apos;re in a room: your nickname, a random anonymous ID and the game state, stored in Google
              Firebase so the other players can see it. Your photo is stored alongside your anonymous ID so other
              players can see it.
            </li>
            <li>Rooms are deleted automatically after 12 hours without activity.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Who can see it</h2>
          <p>
            Anyone who has your room code or link can join the room and see the players in it. Only share codes with
            people you want to play with.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Removing your data</h2>
          <p>
            Open your profile on the home screen and choose <strong>Log out</strong> to wipe your nickname and photo from
            this device and remove your photo from our servers. Leaving a room removes you from it straight away.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Services we use</h2>
          <p>
            The site is hosted on Vercel, and rooms run on Google Firebase (anonymous authentication and Cloud
            Firestore). These providers process data on our behalf to run the service.
          </p>
        </section>

        <Link to="/" className="inline-block px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl">
          Back to games
        </Link>
      </div>
    </div>
  );
}
