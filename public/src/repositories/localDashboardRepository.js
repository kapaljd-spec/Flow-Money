import { calculateWalletBalance, isPositiveRupiah } from '../services/dashboardFinance.js';

export const DASHBOARD_STORAGE_KEY = 'flowmoney.dashboard.v1';

function createEmptyData() {
  return {
    version: 3,
    name: '',
    wallets: [
      { id: 'wallet-cash', name: 'Tunai', open: 0 },
      { id: 'wallet-bank', name: 'Bank', open: 0 }
    ],
    tx: [],
    budgets: {},
    goals: [],
    assets: [],
    importedAccounts: []
  };
}

function copy(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeRupiah(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function hasUniqueWallets(wallets, balanceKey) {
  if (!Array.isArray(wallets) || wallets.length === 0) return false;
  const walletIds = new Set();
  for (const wallet of wallets) {
    if (!isRecord(wallet) || !isNonEmptyString(wallet.id) || !isNonEmptyString(wallet.name)) return false;
    if (!isNonNegativeRupiah(wallet[balanceKey]) || walletIds.has(wallet.id)) return false;
    walletIds.add(wallet.id);
  }
  return true;
}

function isValidBudgets(budgets) {
  if (!isRecord(budgets)) return false;
  return Object.entries(budgets).every(([key, value]) => {
    if (isMonth(key)) {
      return isRecord(value)
        && Object.entries(value).every(([category, limit]) => isNonEmptyString(category) && isPositiveRupiah(limit));
    }
    return isNonEmptyString(key) && isPositiveRupiah(value);
  });
}

function isValidGoals(goals) {
  if (!Array.isArray(goals)) return false;
  const ids = new Set();
  for (const goal of goals) {
    if (!isRecord(goal) || !isNonEmptyString(goal.id) || !isNonEmptyString(goal.name)) return false;
    if (!isPositiveRupiah(goal.target) || !isNonNegativeRupiah(goal.saved) || ids.has(goal.id)) return false;
    ids.add(goal.id);
  }
  return true;
}

function isValidCanonicalData(data) {
  if (!isRecord(data) || data.version !== 3 || typeof data.name !== 'string' || !hasUniqueWallets(data.wallets, 'open')) return false;
  if (!Array.isArray(data.tx) || !isValidBudgets(data.budgets) || !isValidGoals(data.goals)) return false;
  if (!Array.isArray(data.assets)) return false;
  if (!Array.isArray(data.importedAccounts) || !data.importedAccounts.every(isNonEmptyString)) return false;

  const walletIds = new Set(data.wallets.map(wallet => wallet.id));
  const transactionIds = new Set();
  for (const transaction of data.tx) {
    if (!isRecord(transaction) || !isNonEmptyString(transaction.id)) return false;
    if (!['in', 'out'].includes(transaction.type) || !isPositiveRupiah(transaction.amount)) return false;
    if (!walletIds.has(transaction.wallet) || !isNonEmptyString(transaction.cat)) return false;
    if (typeof transaction.note !== 'string' || !isIsoDate(transaction.date)) return false;
    if (transaction.createdAt !== undefined && typeof transaction.createdAt !== 'string') return false;
    if (transactionIds.has(transaction.id)) return false;
    transactionIds.add(transaction.id);
  }
  const assetIds = new Set();
  for (const asset of data.assets) {
    if (!isRecord(asset) || !isNonEmptyString(asset.id) || !isNonEmptyString(asset.name)) return false;
    if (!['aset', 'crypto', 'saham'].includes(asset.kind) || !Number.isFinite(asset.qty) || asset.qty <= 0) return false;
    if (!isPositiveRupiah(asset.buy) || !isPositiveRupiah(asset.price) || assetIds.has(asset.id)) return false;
    assetIds.add(asset.id);
  }
  return true;
}

function migrateLegacyData(data) {
  if (!isRecord(data) || !hasUniqueWallets(data.wallets, 'openingBalance')) return null;
  if (!Array.isArray(data.transactions) || !isValidBudgets(data.budgets || {})) return null;
  if (!Array.isArray(data.importedAccounts ?? []) || !(data.importedAccounts ?? []).every(isNonEmptyString)) return null;

  const version2 = {
    version: 2,
    name: typeof data.name === 'string' ? data.name : '',
    wallets: data.wallets.map(wallet => ({ id: wallet.id, name: wallet.name, open: wallet.open ?? wallet.openingBalance })),
    tx: data.transactions.map(transaction => ({
      id: transaction.id,
      date: transaction.date,
      type: transaction.type === 'income' ? 'in' : transaction.type === 'expense' ? 'out' : transaction.type,
      wallet: transaction.wallet ?? transaction.walletId,
      cat: transaction.cat ?? transaction.category,
      amount: transaction.amount,
      note: transaction.note || '',
      ...(transaction.createdAt === undefined ? {} : { createdAt: transaction.createdAt })
    })),
    budgets: data.budgets || {},
    goals: Array.isArray(data.goals) ? data.goals : [],
    assets: Array.isArray(data.assets) ? data.assets : [],
    importedAccounts: data.importedAccounts || []
  };

  if (version2.wallets.some(wallet => !isNonNegativeRupiah(wallet.open)) || !isValidGoals(version2.goals)) return null;
  if (!Array.isArray(version2.assets)) return null;
  const upgraded = { ...version2, version: 3 };
  return isValidCanonicalData(upgraded) ? upgraded : null;
}

function upgradeVersion2(data) {
  if (!isRecord(data) || data.version !== 2 || !hasUniqueWallets(data.wallets, 'open')) return null;
  if (!Array.isArray(data.tx) || !isValidBudgets(data.budgets || {}) || !isValidGoals(data.goals || [])) return null;
  const upgraded = {
    version: 3,
    name: typeof data.name === 'string' ? data.name : '',
    wallets: data.wallets.map(wallet => ({ id: wallet.id, name: wallet.name, open: wallet.open })),
    tx: data.tx,
    budgets: data.budgets || {},
    goals: data.goals || [],
    assets: Array.isArray(data.assets) ? data.assets : [],
    importedAccounts: Array.isArray(data.importedAccounts) ? data.importedAccounts : []
  };
  return isValidCanonicalData(upgraded) ? upgraded : null;
}

export function normalizeDashboardData(data) {
  if (isValidCanonicalData(data)) return copy(data);
  if (isRecord(data) && data.version === 2) return upgradeVersion2(data);
  return migrateLegacyData(data);
}

export function validateDashboardData(data) {
  return normalizeDashboardData(data) !== null;
}

function getBrowserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function createId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseImport(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error('File JSON tidak valid.');
    }
  }
  if (!validateDashboardData(data)) throw new Error('Struktur data JSON tidak sesuai format FlowMoney Dashboard.');
  return copy(data);
}

export class LocalDashboardRepository {
  constructor({ storage = getBrowserStorage() } = {}) {
    this.storage = storage;
    this.storageAvailable = Boolean(storage);
    this.data = createEmptyData();
    this.load();
  }

  load() {
    if (!this.storage) return;
    try {
      const stored = this.storage.getItem(DASHBOARD_STORAGE_KEY);
      if (stored === null) return;
      const parsed = JSON.parse(stored);
      const normalized = normalizeDashboardData(parsed);
      if (!normalized) throw new Error('Stored dashboard data is invalid.');
      this.data = normalized;
      if (parsed.version !== 3) this.persist();
    } catch {
      this.storageAvailable = false;
      this.data = createEmptyData();
    }
  }

  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      this.storageAvailable = false;
    }
  }

  getSnapshot() {
    return copy(this.data);
  }

  getStorageAvailable() {
    return this.storageAvailable;
  }

  getWallets() {
    return this.data.wallets.map(wallet => ({
      id: wallet.id,
      name: wallet.name,
      openingBalance: wallet.open,
      balance: calculateWalletBalance(wallet, this.data.tx)
    }));
  }

  getTransactions(month) {
    return this.data.tx
      .filter(transaction => !month || transaction.date.startsWith(`${month}-`))
      .map((transaction, index) => ({ transaction, index }))
      .sort((left, right) => (
        right.transaction.date.localeCompare(left.transaction.date)
        || String(right.transaction.createdAt || '').localeCompare(String(left.transaction.createdAt || ''))
        || right.index - left.index
      ))
      .map(({ transaction }) => ({
        id: transaction.id,
        date: transaction.date,
        type: transaction.type === 'in' ? 'income' : 'expense',
        walletId: transaction.wallet,
        category: transaction.cat,
        amount: transaction.amount,
        note: transaction.note,
        ...(transaction.createdAt === undefined ? {} : { createdAt: transaction.createdAt })
      }));
  }

  addTransaction(input) {
    if (!isRecord(input) || !['income', 'expense', 'in', 'out'].includes(input.type) || !isPositiveRupiah(input.amount)) {
      throw new Error('Nominal harus berupa rupiah bulat lebih dari nol.');
    }
    const walletId = input.walletId ?? input.wallet;
    const category = input.category ?? input.cat;
    if (!this.data.wallets.some(wallet => wallet.id === walletId)) throw new Error('Pilih dompet yang tersedia.');
    if (!isNonEmptyString(category) || !isIsoDate(input.date)) {
      throw new Error('Kategori dan tanggal transaksi wajib diisi.');
    }
    const transaction = {
      id: createId('transaction'),
      type: input.type === 'income' || input.type === 'in' ? 'in' : 'out',
      amount: input.amount,
      wallet: walletId,
      cat: category.trim(),
      date: input.date,
      note: String(input.note || '').trim(),
      createdAt: new Date().toISOString()
    };
    this.data.tx.push(transaction);
    this.persist();
    return {
      id: transaction.id,
      type: transaction.type === 'in' ? 'income' : 'expense',
      amount: transaction.amount,
      walletId: transaction.wallet,
      category: transaction.cat,
      date: transaction.date,
      note: transaction.note,
      createdAt: transaction.createdAt
    };
  }

  deleteTransaction(id) {
    const previousLength = this.data.tx.length;
    this.data.tx = this.data.tx.filter(transaction => transaction.id !== id);
    if (this.data.tx.length !== previousLength) this.persist();
    return this.data.tx.length !== previousLength;
  }

  addWallet(input) {
    const { name } = input;
    const openingBalance = input.openingBalance ?? input.open ?? 0;
    if (!isNonEmptyString(name) || !isNonNegativeRupiah(openingBalance)) {
      throw new Error('Nama dompet wajib diisi dan saldo awal tidak boleh negatif.');
    }
    const wallet = { id: createId('wallet'), name: name.trim(), open: openingBalance };
    this.data.wallets.push(wallet);
    this.persist();
    return { id: wallet.id, name: wallet.name, openingBalance: wallet.open, balance: wallet.open };
  }

  deleteWallet(id) {
    if (this.data.wallets.length <= 1) throw new Error('Dompet terakhir tidak dapat dihapus.');
    if (this.data.tx.some(transaction => transaction.wallet === id)) {
      throw new Error('Dompet yang masih memiliki transaksi tidak dapat dihapus.');
    }
    const previousLength = this.data.wallets.length;
    this.data.wallets = this.data.wallets.filter(wallet => wallet.id !== id);
    if (this.data.wallets.length !== previousLength) this.persist();
    return this.data.wallets.length !== previousLength;
  }

  getBudget(month) {
    if (isRecord(this.data.budgets[month])) return copy(this.data.budgets[month]);
    const hasMonthScopedBudgets = Object.keys(this.data.budgets).some(isMonth);
    if (hasMonthScopedBudgets) return {};
    return copy(this.data.budgets);
  }

  setBudget(month, category, limit) {
    if (!isMonth(month) || !isNonEmptyString(category) || !isPositiveRupiah(limit)) {
      throw new Error('Bulan, kategori, dan batas anggaran yang valid wajib diisi.');
    }
    const hasMonthScopedBudgets = Object.keys(this.data.budgets).some(isMonth);
    const budgets = hasMonthScopedBudgets ? (this.data.budgets[month] ||= {}) : this.data.budgets;
    budgets[category.trim()] = limit;
    this.persist();
    return limit;
  }

  deleteBudget(month, category) {
    const hasMonthScopedBudgets = Object.keys(this.data.budgets).some(isMonth);
    const budgets = hasMonthScopedBudgets ? this.data.budgets[month] : this.data.budgets;
    if (!budgets || !(category in budgets)) return false;
    delete budgets[category];
    if (hasMonthScopedBudgets && Object.keys(budgets).length === 0) delete this.data.budgets[month];
    this.persist();
    return true;
  }

  getGoals() {
    return copy(this.data.goals);
  }

  getProfile() {
    return { name: this.data.name };
  }

  updateProfile({ name }) {
    if (typeof name !== 'string' || name.length > 30) throw new Error('Nama panggilan maksimal 30 karakter.');
    this.data.name = name.trim();
    this.persist();
    return this.getProfile();
  }

  getAssets(kind) {
    return copy(kind ? this.data.assets.filter(asset => asset.kind === kind) : this.data.assets);
  }

  addAsset(input) {
    const { name, kind, qty = 1, buy, price } = input;
    if (!isNonEmptyString(name) || !['aset', 'crypto', 'saham'].includes(kind)) throw new Error('Nama dan jenis aset wajib diisi.');
    if (!Number.isFinite(qty) || qty <= 0 || !isPositiveRupiah(buy) || !isPositiveRupiah(price)) {
      throw new Error('Jumlah harus positif dan harga harus berupa rupiah integer lebih dari nol.');
    }
    const asset = { id: createId('asset'), kind, name: name.trim(), qty, buy, price };
    this.data.assets.push(asset);
    this.persist();
    return copy(asset);
  }

  updateAssetPrice(id, price) {
    if (!isPositiveRupiah(price)) throw new Error('Harga harus berupa rupiah integer lebih dari nol.');
    const asset = this.data.assets.find(item => item.id === id);
    if (!asset) throw new Error('Aset tidak ditemukan.');
    asset.price = price;
    this.persist();
    return copy(asset);
  }

  deleteAsset(id) {
    const previousLength = this.data.assets.length;
    this.data.assets = this.data.assets.filter(asset => asset.id !== id);
    if (this.data.assets.length !== previousLength) this.persist();
    return this.data.assets.length !== previousLength;
  }

  addGoal({ name, target }) {
    if (!isNonEmptyString(name) || !isPositiveRupiah(target)) throw new Error('Nama dan nominal target wajib valid.');
    const goal = { id: createId('goal'), name: name.trim(), target, saved: 0 };
    this.data.goals.push(goal);
    this.persist();
    return copy(goal);
  }

  contributeToGoal(id, amount) {
    if (!isPositiveRupiah(amount)) throw new Error('Nominal tabungan harus lebih dari nol.');
    const goal = this.data.goals.find(item => item.id === id);
    if (!goal) throw new Error('Target tidak ditemukan.');
    const nextSaved = goal.saved + amount;
    if (!Number.isSafeInteger(nextSaved)) throw new Error('Nominal tabungan melebihi batas yang didukung.');
    goal.saved = nextSaved;
    this.persist();
    return copy(goal);
  }

  deleteGoal(id) {
    const previousLength = this.data.goals.length;
    this.data.goals = this.data.goals.filter(goal => goal.id !== id);
    if (this.data.goals.length !== previousLength) this.persist();
    return this.data.goals.length !== previousLength;
  }

  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  importData(input) {
    const parsed = parseImport(input);
    const normalized = normalizeDashboardData(parsed);
    if (!normalized) throw new Error('Struktur data JSON tidak sesuai format FlowMoney Dashboard.');
    this.data = normalized;
    this.persist();
    return this.getSnapshot();
  }

  resetData() {
    this.data = createEmptyData();
    this.persist();
    return this.getSnapshot();
  }

  hasImportedAccount(userId) {
    return this.data.importedAccounts.includes(userId);
  }

  markImportedAccount(userId) {
    if (!isNonEmptyString(userId)) throw new Error('Akun tujuan tidak valid.');
    if (this.data.importedAccounts.includes(userId)) return false;
    this.data.importedAccounts.push(userId);
    this.persist();
    return true;
  }
}