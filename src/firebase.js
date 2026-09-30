const AUTH_STORAGE_KEY = 'flowmoney.dashboard.auth.v1';

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function authError(message) {
  const code = message.split(' : ')[0];
  const messages = {
    EMAIL_EXISTS: 'Email ini sudah terdaftar.',
    INVALID_LOGIN_CREDENTIALS: 'Email atau kata sandi salah.',
    EMAIL_NOT_FOUND: 'Email tidak ditemukan.',
    INVALID_PASSWORD: 'Kata sandi salah.',
    WEAK_PASSWORD: 'Kata sandi harus terdiri dari minimal 6 karakter.',
    OPERATION_NOT_ALLOWED: 'Email/Password belum diaktifkan di Firebase Authentication.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Terlalu banyak percobaan. Coba lagi nanti.'
  };
  return messages[code] || 'Autentikasi Firebase gagal. Periksa konfigurasi dan coba lagi.';
}

export function createFirebaseAuthClient({ apiKey, storage = getStorage(), fetchImpl = fetch }) {
  const subscribers = new Set();
  let session = null;
  let currentUser = null;
  let refreshRequest = null;

  function notify() {
    for (const subscriber of subscribers) subscriber(currentUser);
  }

  function saveSession() {
    if (!storage) return;
    try {
      if (session) storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      else storage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Authentication remains available in memory when browser storage is blocked.
    }
  }

  function exposeUser() {
    currentUser = session ? {
      uid: session.uid,
      email: session.email,
      getIdToken: forceRefresh => getIdToken(forceRefresh)
    } : null;
    notify();
  }

  async function parseResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(authError(payload.error?.message || 'AUTH_ERROR'));
    return payload;
  }

  async function updateSession(payload) {
    session = {
      uid: payload.localId || payload.user_id || session?.uid,
      email: payload.email || session?.email,
      idToken: payload.idToken || payload.id_token,
      refreshToken: payload.refreshToken || payload.refresh_token,
      expiresAt: Date.now() + Number(payload.expiresIn || payload.expires_in || 3600) * 1000
    };
    saveSession();
    exposeUser();
    return currentUser;
  }

  async function refreshIdToken() {
    if (!session?.refreshToken) throw new Error('Sesi Firebase berakhir. Silakan masuk kembali.');
    if (!apiKey) throw new Error('API key Firebase belum dikonfigurasi.');
    if (refreshRequest) return refreshRequest;
    refreshRequest = (async () => {
      const response = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
      });
      const payload = await parseResponse(response);
      await updateSession(payload);
      return session.idToken;
    })().finally(() => {
      refreshRequest = null;
    });
    return refreshRequest;
  }

  async function getIdToken(forceRefresh = false) {
    if (!session) throw new Error('Belum masuk ke akun Firebase.');
    if (forceRefresh || session.expiresAt <= Date.now() + 60_000) return refreshIdToken();
    return session.idToken;
  }

  async function accountRequest(action, email, password) {
    if (!apiKey) throw new Error('API key Firebase belum dikonfigurasi.');
    const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    return updateSession(await parseResponse(response));
  }

  return {
    get currentUser() {
      return currentUser;
    },
    async initialize() {
      if (storage) {
        try {
          const stored = storage.getItem(AUTH_STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.uid && parsed?.refreshToken && parsed?.idToken) session = parsed;
          }
        } catch {
          session = null;
        }
      }
      exposeUser();
      if (session && session.expiresAt <= Date.now() + 60_000) {
        try {
          await refreshIdToken();
        } catch {
          session = null;
          currentUser = null;
          saveSession();
          notify();
        }
      }
      return currentUser;
    },
    signInWithEmail(email, password) {
      return accountRequest('signInWithPassword', email, password);
    },
    signUpWithEmail(email, password) {
      return accountRequest('signUp', email, password);
    },
    async signOut() {
      session = null;
      currentUser = null;
      saveSession();
      notify();
    },
    onAuthStateChanged(callback) {
      subscribers.add(callback);
      callback(currentUser);
      return () => subscribers.delete(callback);
    },
    getIdToken
  };
}

const firebaseConfig = globalThis.__FLOWMONEY_FIREBASE_CONFIG__ || {};

export const auth = createFirebaseAuthClient({ apiKey: firebaseConfig.apiKey });
export const authReady = auth.initialize();