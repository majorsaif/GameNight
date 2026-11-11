import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';

// Vercel preview deployments (pull requests / branches) always talk to the
// staging project so testing never touches live rooms. Firebase web config is
// public by design; access is controlled by firestore.rules.
const STAGING_CONFIG = {
  apiKey: 'AIzaSyBO-0D04UfIuvVmqfUcdImxJbRmevXsKqQ',
  authDomain: 'gamenight-ca21d.firebaseapp.com',
  projectId: 'gamenight-ca21d',
  storageBucket: 'gamenight-ca21d.firebasestorage.app',
  messagingSenderId: '376498895476',
  appId: '1:376498895476:web:4b6c056ff29e0161b22f21'
};

export const isStagingBuild = typeof __VERCEL_ENV__ !== 'undefined' && __VERCEL_ENV__ === 'preview';

const firebaseConfig = isStagingBuild ? STAGING_CONFIG : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!isFirebaseConfigured) {
  console.error('[firebase] Missing VITE_FIREBASE_* environment variables. See README.md.');
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Anonymous sign-in only: skipping the popup/redirect resolver avoids loading
// Google's iframe scripts on every page.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});
