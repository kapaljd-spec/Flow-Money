import { normalizeDashboardData } from './localDashboardRepository.js';

function unwrap(payload) {
  if (payload?.success === false) {
    throw new Error(payload.error?.message || 'Permintaan API gagal.');
  }
  return payload?.data ?? payload;
}

function asArray(payload, key) {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  throw new Error(`Respons API tidak memuat daftar ${key}.`);
}

export class ApiDashboardRepository {
  constructor({ apiBaseUrl, getIdToken, getUserId, fetchImpl = fetch }) {
    if (!apiBaseUrl) throw new Error('API_BASE_URL belum dikonfigurasi.');
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.getIdToken = getIdToken;
    this.getUserId = getUserId;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = 'GET', body, headers = {} } = {}) {
    const token = await this.getIdToken?.();
    if (!token) throw new Error('Sesi login tidak tersedia. Silakan masuk kembali.');
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || `API mengembalikan status ${response.status}.`);
    }
    return unwrap(payload);
  }

  async getWallets() {
    const wallets = asArray(await this.request('/api/v1/wallets'), 'wallets');
    return wallets.map(wallet => ({
      ...wallet,
      openingBalance: wallet.openingBalance ?? wallet.opening_balance ?? 0,
      balance: wallet.balance ?? wallet.currentBalance ?? wallet.current_balance ?? 0
    }));
  }

  async getTransactions(month) {
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    return asArray(await this.request(`/api/v1/transactions${query}`), 'transactions');
  }

  addTransaction(transaction) {
    return this.request('/api/v1/transactions', { method: 'POST', body: transaction });
  }

  deleteTransaction(id) {
    return this.request(`/api/v1/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  addWallet(wallet) {
    return this.request('/api/v1/wallets', { method: 'POST', body: wallet });
  }

  deleteWallet(id) {
    return this.request(`/api/v1/wallets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  getProfile() {
    return this.request('/api/v1/profile');
  }

  updateProfile(profile) {
    return this.request('/api/v1/profile', { method: 'PUT', body: profile });
  }

  async getAssets(kind) {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    return asArray(await this.request(`/api/v1/assets${query}`), 'assets');
  }

  addAsset(asset) {
    return this.request('/api/v1/assets', { method: 'POST', body: asset });
  }

  updateAssetPrice(id, price) {
    return this.request(`/api/v1/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: { price } });
  }

  deleteAsset(id) {
    return this.request(`/api/v1/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async getBudget(month) {
    const data = unwrap(await this.request(`/api/v1/budgets?month=${encodeURIComponent(month)}`));
    if (!Array.isArray(data)) return data || {};
    return data.reduce((budgets, item) => {
      budgets[item.category] = item.limit ?? item.amount;
      return budgets;
    }, {});
  }

  setBudget(month, category, limit) {
    return this.request(`/api/v1/budgets?month=${encodeURIComponent(month)}`, {
      method: 'PUT', body: { category, limit }
    });
  }

  deleteBudget(month, category) {
    return this.request(`/api/v1/budgets?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`, {
      method: 'DELETE'
    });
  }

  async getGoals() {
    const goals = asArray(await this.request('/api/v1/goals'), 'goals');
    return goals.map(goal => ({ ...goal, saved: goal.saved ?? goal.contributedAmount ?? goal.contributed_amount ?? 0 }));
  }

  addGoal(goal) {
    return this.request('/api/v1/goals', { method: 'POST', body: goal });
  }

  contributeToGoal(id, amount) {
    return this.request(`/api/v1/goals/${encodeURIComponent(id)}/contributions`, {
      method: 'POST', body: { amount }
    });
  }

  deleteGoal(id) {
    return this.request(`/api/v1/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async exportData() {
    const data = await this.request('/api/v1/dashboard/export');
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  importData(data) {
    const normalized = normalizeDashboardData(data);
    if (!normalized) throw new Error('Struktur data JSON tidak sesuai format FlowMoney Dashboard.');
    return this.request('/api/v1/dashboard/import', { method: 'POST', body: normalized });
  }

  importLocalData(snapshot) {
    const normalized = normalizeDashboardData(snapshot);
    if (!normalized) throw new Error('Data lokal tidak valid dan tidak dapat diimpor.');
    const userId = this.getUserId?.();
    if (!userId) throw new Error('Akun tujuan tidak tersedia. Silakan masuk kembali.');
    return this.request('/api/v1/dashboard/import-local', {
      method: 'POST',
      headers: { 'Idempotency-Key': `flowmoney-dashboard-import-${userId}` },
      body: normalized
    });
  }

  resetData() {
    return this.request('/api/v1/dashboard', { method: 'DELETE' });
  }

  getStorageAvailable() {
    return true;
  }
}