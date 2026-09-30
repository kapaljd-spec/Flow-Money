import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js';

const firebaseConfig = window.__FLOWMONEY_FIREBASE_CONFIG__ || {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || 'flow-moneys.firebaseapp.com',
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'flow-moneys',
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || 'flow-moneys.firebasestorage.app',
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || 'REPLACE_WITH_FIREBASE_MESSAGING_SENDER_ID',
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || 'REPLACE_WITH_FIREBASE_APP_ID',
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || ''
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const analytics = isSupported().then((supported) => (
  supported ? getAnalytics(app) : null
));

export const firebaseConfigSummary = {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  hasClientConfig: Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_WITH_FIREBASE_API_KEY')
};
