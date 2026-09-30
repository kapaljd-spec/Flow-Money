import { auth, firebaseConfigSummary } from '../../firebase.js';

export { auth };

export function isFirebaseConfigured() {
  return firebaseConfigSummary.hasClientConfig;
}