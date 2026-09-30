import { auth } from '../firebase.js';

export function signInWithEmail(email, password) {
  return auth.signInWithEmail(email, password);
}

export function signUpWithEmail(email, password) {
  return auth.signUpWithEmail(email, password);
}

export function signOutUser() {
  return auth.signOut();
}

export function subscribeToAuth(callback) {
  return auth.onAuthStateChanged(callback);
}