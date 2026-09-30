import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuickEntry } from '../functions/telegram.js';
import {
  aggregateDailyExpenses,
  aggregateMonthlyExpenses,
  aggregateExpensesByCategory,
  calculateActivityStreak,
  calculateAssetPerformance,
  calculateGoalProgress,
  calculateWalletBalance,
  getBudgetStatus
} from '../src/services/dashboardFinance.js';
import { createDashboardDemoData } from '../src/services/dashboardDemoData.js';
import { LocalDashboardRepository } from '../src/repositories/localDashboardRepository.js';
import { ApiDashboardRepository } from '../src/repositories/apiDashboardRepository.js';
import { createFirebaseAuthClient } from '../src/firebase.js';
import { renderDashboardView } from '../dashboard/dashboard-view.js';
import { createAssetPriceProvider } from '../src/services/assetPriceProvider.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };
}

test('quick entry parser handles requested Indonesian amount formats', () => {
  assert.deepEqual(parseQuickEntry('makan 45rb'), {
    amount: 45_000, type: 'expense', category: 'Makan', note: 'makan'
  });
  assert.deepEqual(parseQuickEntry('kopi 25.000'), {
    amount: 25_000, type: 'expense', category: 'Makan', note: 'kopi'
  });
  assert.deepEqual(parseQuickEntry('gaji 5jt'), {
    amount: 5_000_000, type: 'income', category: 'Gaji', note: 'gaji'
  });
  assert.deepEqual(parseQuickEntry('bonus 1jt'), {
    amount: 1_000_000, type: 'income', category: 'Bonus', note: 'bonus'
  });
  assert.deepEqual(parseQuickEntry('beli buku 1,5jt'), {
    amount: 1_500_000, type: 'expense', category: 'Belanja', note: 'beli buku'
  });
  assert.equal(parseQuickEntry('beli laptop 1.000.000').amount, 1_000_000);
  assert.equal(parseQuickEntry('nasi 30rb').category, 'Makan');
  assert.equal(parseQuickEntry('ojek 25rb').category, 'Transport');
  assert.equal(parseQuickEntry('kos 1jt').category, 'Tagihan');
  assert.equal(parseQuickEntry('makan siang'), null);
});

test('wallet balance and expense category aggregates use integer rupiah', () => {
  const wallet = { id: 'wallet-a', openingBalance: 100_000 };
  const transactions = [
    { walletId: 'wallet-a', type: 'income', amount: 500_000, category: 'Pemasukan', date: '2026-09-01' },
    { walletId: 'wallet-a', type: 'expense', amount: 45_000, category: 'Makan', date: '2026-09-02' },
    { walletId: 'wallet-a', type: 'expense', amount: 25_000, category: 'Makan', date: '2026-09-03' },
    { walletId: 'wallet-a', type: 'expense', amount: 12_000, category: 'Transport', date: '2026-08-30' }
  ];
  assert.equal(calculateWalletBalance(wallet, transactions), 518_000);
  assert.deepEqual(aggregateExpensesByCategory(transactions, '2026-09'), { Makan: 70_000 });
});

test('six-month aggregation and demo data match the reference totals', () => {
  const demo = createDashboardDemoData(new Date(2026, 8, 29));
  const monthlyExpenses = aggregateMonthlyExpenses(demo.tx, 6, new Date(2026, 8, 29));
  const currentMonth = monthlyExpenses.at(-1).month;
  const currentTx = demo.tx.filter(transaction => transaction.date.startsWith(`${currentMonth}-`));
  const income = currentTx.reduce((sum, transaction) => sum + (transaction.type === 'in' ? transaction.amount : 0), 0);
  const expense = currentTx.reduce((sum, transaction) => sum + (transaction.type === 'out' ? transaction.amount : 0), 0);
  const wallet = demo.wallets[0];

  assert.equal(monthlyExpenses.length, 6);
  assert.equal(monthlyExpenses.at(-1).amount, 2_350_000);
  assert.equal(income, 7_000_000);
  assert.equal(expense, 2_350_000);
  assert.equal(calculateWalletBalance(wallet, demo.tx), 12_500_000);
  assert.equal(demo.goals.length, 2);
  assert.equal(demo.assets.length, 3);
  assert.equal(demo.assets.reduce((sum, asset) => sum + calculateAssetPerformance(asset).value, 0), 22_980_000);
});

test('dashboard view renders reference sections and escapes transaction text', () => {
  const model = {
    month: '2026-09',
    monthLabel: 'September 2026',
    wallets: [{ id: 'wallet-1', name: 'Main', openingBalance: 100_000, balance: 100_000 }],
    transactions: Array.from({ length: 5 }, (_, index) => ({
      id: `tx-${index}`, type: 'expense', amount: 10_000, walletId: 'wallet-1',
      category: 'Makan', date: `2026-09-0${index + 1}`, note: index === 0 ? '<script>alert(1)</script>' : 'Lunch'
    })),
    allTransactions: [],
    budgets: { Makan: 10_000 },
    goals: [],
    balance: 100_000,
    income: 0,
    expense: 50_000,
    delta: -50_000,
    monthlyExpenses: Array.from({ length: 6 }, (_, index) => ({
      month: `2026-0${index + 4}`, amount: (index + 1) * 10_000,
      label: `Month ${index}`, shortLabel: `M${index}`
    })),
    categoryTotals: { Makan: 50_000 },
    canLoadDemo: false
  };

  const overview = renderDashboardView('overview', model);
  assert.match(overview, /TOTAL BALANCE/);
  assert.match(overview, /RECENT TRANSACTIONS/);
  assert.equal((overview.match(/class="chart-column/g) || []).length, 6);
  assert.equal((overview.match(/data-action="delete-transaction"/g) || []).length, 5);
  assert.match(overview, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(overview, /<script>alert\(1\)<\/script>/);
  assert.match(renderDashboardView('wallet', model), /All wallets/);
  assert.match(renderDashboardView('analytics', model), /Limit exceeded/);
});

test('budget status changes at 80 percent and above the limit', () => {
  assert.equal(getBudgetStatus(7_999, 10_000), 'normal');
  assert.equal(getBudgetStatus(8_000, 10_000), 'warning');
  assert.equal(getBudgetStatus(10_001, 10_000), 'exceeded');
});

test('daily totals, activity streak, asset performance, and goal progress use correct rules', () => {
  const daily = aggregateDailyExpenses([
    { type: 'out', date: '2026-09-01', amount: 20_000 },
    { type: 'in', date: '2026-09-01', amount: 900_000 },
    { type: 'expense', date: '2026-09-03', amount: 5_000 }
  ], '2026-09');
  assert.equal(daily.length, 30);
  assert.equal(daily[0].amount, 20_000);
  assert.equal(daily[1].amount, 0);
  assert.equal(daily[2].amount, 5_000);

  const transactions = ['2026-09-26', '2026-09-27', '2026-09-28'].map(date => ({ date }));
  assert.equal(calculateActivityStreak(transactions, new Date(2026, 8, 29, 12)), 3);
  transactions.push({ date: '2026-09-29' });
  assert.equal(calculateActivityStreak(transactions, new Date(2026, 8, 29, 12)), 4);

  assert.deepEqual(calculateAssetPerformance({ kind: 'crypto', qty: 0.015, buy: 1_000, price: 2_000 }), {
    value: 30, cost: 15, profit: 15, percent: 100
  });
  assert.equal(calculateAssetPerformance({ kind: 'aset', qty: 1, buy: 900_000, price: 1_100_000 }).profit, 200_000);
  assert.equal(calculateGoalProgress({ saved: 120_000, target: 100_000 }), 100);
});

test('local repository persists records and safely exports/imports validated snapshots', () => {
  const storage = createMemoryStorage();
  const repository = new LocalDashboardRepository({ storage });
  const wallet = repository.addWallet({ name: 'Tunai', openingBalance: 200_000 });
  const transaction = repository.addTransaction({
    type: 'expense', amount: 45_000, walletId: wallet.id,
    category: 'Makan', date: '2026-09-10', note: 'makan siang'
  });
  assert.equal(repository.getWallets().find(item => item.id === wallet.id).balance, 155_000);
  assert.equal(repository.deleteTransaction(transaction.id), true);
  assert.equal(repository.getTransactions().length, 0);
  repository.addTransaction({
    type: 'expense', amount: 10_000, walletId: wallet.id,
    category: 'Makan', date: '2026-09-10', note: 'sarapan'
  });
  repository.addTransaction({
    type: 'expense', amount: 20_000, walletId: wallet.id,
    category: 'Makan', date: '2026-09-10', note: 'makan siang'
  });
  assert.equal(repository.getTransactions('2026-09')[0].note, 'makan siang');
  repository.addTransaction({
    type: 'in', amount: 1, wallet: wallet.id, cat: 'Gaji', date: '2026-09-11', note: 'contoh schema'
  });
  assert.equal(repository.getSnapshot().tx.at(-1).type, 'in');

  const goal = repository.addGoal({ name: 'Dana darurat', target: 1_000_000 });
  repository.contributeToGoal(goal.id, 100_000);
  repository.setBudget('2026-09', 'Makan', 300_000);
  const exported = repository.exportData();
  const restored = new LocalDashboardRepository({ storage: createMemoryStorage() });
  restored.importData(exported);
  assert.deepEqual(restored.getSnapshot(), repository.getSnapshot());

  assert.throws(() => restored.importData('{bad json'), /JSON tidak valid/);
  assert.throws(() => restored.importData({ version: 1, wallets: [], transactions: [], budgets: {}, goals: [] }), /Struktur data/);
  const invalidDate = repository.getSnapshot();
  invalidDate.tx.push({
    id: 'bad-date', type: 'out', amount: 1, wallet: wallet.id,
    cat: 'Makan', date: '2026-02-30', note: '', createdAt: '2026-02-30T00:00:00.000Z'
  });
  assert.throws(() => restored.importData(invalidDate), /Struktur data/);
  assert.deepEqual(restored.getSnapshot(), repository.getSnapshot());
  assert.equal(restored.resetData().wallets.length, 2);
  assert.equal(restored.getGoals().length, 0);
});

test('local repository falls back to memory when storage operations fail', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  const repository = new LocalDashboardRepository({ storage });
  repository.addWallet({ name: 'Bank', openingBalance: 10_000 });
  assert.equal(repository.getStorageAvailable(), false);
  assert.equal(repository.getWallets().length, 3);
});

test('local repository migrates saved version 1 snapshots without losing records', () => {
  const storage = createMemoryStorage();
  storage.setItem('flowmoney.dashboard.v1', JSON.stringify({
    version: 1,
    wallets: [{ id: 'old-wallet', name: 'Legacy wallet', openingBalance: 50_000 }],
    transactions: [{
      id: 'old-transaction', type: 'income', amount: 25_000, walletId: 'old-wallet',
      category: 'Gaji', date: '2026-09-01', note: 'salary'
    }],
    budgets: {},
    goals: [],
    importedAccounts: []
  }));

  const repository = new LocalDashboardRepository({ storage });
  assert.deepEqual(repository.getSnapshot().tx[0], {
    id: 'old-transaction', type: 'in', amount: 25_000, wallet: 'old-wallet',
    cat: 'Gaji', date: '2026-09-01', note: 'salary'
  });
  assert.equal(repository.getWallets()[0].balance, 75_000);
  assert.equal(JSON.parse(storage.getItem('flowmoney.dashboard.v1')).version, 3);
});

test('API repository sends Firebase bearer token and idempotent import key', async () => {
  const requests = [];
  const repository = new ApiDashboardRepository({
    apiBaseUrl: 'https://flowmoney-api.example',
    getIdToken: async () => 'firebase-id-token',
    getUserId: () => 'user-123',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const data = url.endsWith('/wallets') || url.includes('/assets') ? [] : { imported: true };
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  const local = new LocalDashboardRepository({ storage: createMemoryStorage() });

  await repository.getWallets();
  await repository.importLocalData(local.getSnapshot());
  await repository.importData({
    version: 1,
    wallets: [{ id: 'legacy-wallet', name: 'Legacy', openingBalance: 5_000 }],
    transactions: [], budgets: {}, goals: [], importedAccounts: []
  });
  await repository.getAssets('crypto');
  await repository.addAsset({ kind: 'crypto', name: 'BTC', qty: 0.01, buy: 100, price: 120 });
  await repository.updateAssetPrice('asset-1', 125);
  await repository.deleteAsset('asset-1');
  await repository.getProfile();
  await repository.updateProfile({ name: 'Ayu' });

  assert.equal(requests[0].options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(requests[1].options.headers['Idempotency-Key'], 'flowmoney-dashboard-import-user-123');
  assert.equal(requests[1].url, 'https://flowmoney-api.example/api/v1/dashboard/import-local');
  assert.equal(JSON.parse(requests[2].options.body).version, 3);
  assert.equal(requests[3].url, 'https://flowmoney-api.example/api/v1/assets?kind=crypto');
  assert.equal(requests[4].options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(requests[5].options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(requests[6].options.headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(requests[7].url, 'https://flowmoney-api.example/api/v1/profile');
  assert.equal(requests[8].options.headers.Authorization, 'Bearer firebase-id-token');
});

test('local repository upgrades version 2 budget snapshots and adds profile/assets defaults', () => {
  const storage = createMemoryStorage();
  storage.setItem('flowmoney.dashboard.v1', JSON.stringify({
    version: 2,
    wallets: [{ id: 'v2-wallet', name: 'V2 wallet', open: 80_000 }],
    tx: [],
    budgets: { '2026-09': { Makan: 40_000 } },
    goals: [],
    importedAccounts: []
  }));
  const repository = new LocalDashboardRepository({ storage });
  assert.equal(repository.getSnapshot().version, 3);
  assert.equal(repository.getSnapshot().name, '');
  assert.deepEqual(repository.getAssets(), []);
  assert.equal(repository.getBudget('2026-09').Makan, 40_000);
  assert.equal(JSON.parse(storage.getItem('flowmoney.dashboard.v1')).version, 3);
});

test('local repository stores profile and asset holdings with integer money fields', () => {
  const repository = new LocalDashboardRepository({ storage: createMemoryStorage() });
  repository.updateProfile({ name: 'Ayu' });
  const asset = repository.addAsset({ name: 'BTC', kind: 'crypto', qty: 0.015, buy: 1_000_000, price: 1_200_000 });
  assert.equal(repository.getProfile().name, 'Ayu');
  assert.equal(repository.getAssets()[0].qty, 0.015);
  assert.throws(() => repository.addAsset({ name: 'Invalid', kind: 'aset', qty: 1, buy: 1.5, price: 2 }), /rupiah integer/);
  assert.equal(repository.updateAssetPrice(asset.id, 1_500_000).price, 1_500_000);
  assert.equal(repository.deleteAsset(asset.id), true);
  assert.equal(repository.getAssets().length, 0);
});

test('manual asset price provider validates updates without a network request', async () => {
  const provider = createAssetPriceProvider();
  assert.deepEqual(await provider.acceptManualPrice({ id: 'asset-1', price: 100 }, 120), {
    id: 'asset-1', price: 120, source: 'manual'
  });
  await assert.rejects(provider.acceptManualPrice({ id: 'asset-1', price: 100 }, 1.25), /rupiah integer/);
});

test('legacy snapshots missing optional data fields migrate with defaults', () => {
  const storage = createMemoryStorage();
  storage.setItem('flowmoney.dashboard.v1', JSON.stringify({
    version: 1,
    name: 'Rani',
    wallets: [{ id: 'legacy', name: 'Tunai', openingBalance: 75_000 }],
    transactions: []
  }));
  const repository = new LocalDashboardRepository({ storage });
  assert.equal(repository.getProfile().name, 'Rani');
  assert.deepEqual(repository.getSnapshot().budgets, {});
  assert.deepEqual(repository.getGoals(), []);
  assert.deepEqual(repository.getAssets(), []);
});

test('dashboard Firebase auth signs in, refreshes ID tokens, and clears session on sign out', async () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const requests = [];
  const auth = createFirebaseAuthClient({
    apiKey: 'public-web-key',
    storage,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const isRefresh = url.includes('securetoken.googleapis.com');
      return new Response(JSON.stringify(isRefresh ? {
        user_id: 'firebase-user', email: 'demo@example.com', id_token: 'refreshed-id-token',
        refresh_token: 'next-refresh-token', expires_in: '3600'
      } : {
        localId: 'firebase-user', email: 'demo@example.com', idToken: 'initial-id-token',
        refreshToken: 'refresh-token', expiresIn: '1'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });

  const user = await auth.signInWithEmail('demo@example.com', 'secret-pass');
  assert.equal(user.uid, 'firebase-user');
  assert.equal(await auth.getIdToken(), 'refreshed-id-token');
  assert.equal(requests[0].url, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=public-web-key');
  assert.equal(requests[1].url, 'https://securetoken.googleapis.com/v1/token?key=public-web-key');
  assert.ok(values.size > 0);

  await auth.signOut();
  assert.equal(auth.currentUser, null);
  assert.equal(values.size, 0);
});