import { parseQuickEntry } from '../functions/telegram.js';
import { aggregateExpensesByCategory, aggregateMonthlyExpenses } from '../src/services/dashboardFinance.js';
import { createDashboardDemoData } from '../src/services/dashboardDemoData.js';
import { ApiDashboardRepository } from '../src/repositories/apiDashboardRepository.js';
import { LocalDashboardRepository, validateDashboardData } from '../src/repositories/localDashboardRepository.js';
import { escapeHTML, formatMoney, renderDashboardView } from './dashboard-view.js';

const runtimeConfig = window.FLOWMONEY_RUNTIME_CONFIG || {};
let useApi = runtimeConfig.USE_API === true && typeof runtimeConfig.API_BASE_URL === 'string' && runtimeConfig.API_BASE_URL.trim() !== '';
const localRepository = new LocalDashboardRepository();
let repository = localRepository;
let auth = null;
let authHelpers = null;
let currentUser = null;
let apiReady = false;
let fallbackMessage = '';
let selectedTab = 'overview';
let snapshot = { wallets: [], transactions: [], budgets: {}, goals: [] };
let refreshSequence = 0;
let toastTimer;

const monthInput = document.querySelector('#selected-month');
const content = document.querySelector('#workspace-content');
const accountArea = document.querySelector('#account-area');
const navItems = [...document.querySelectorAll('.nav-item')];
const now = new Date();
let selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthLabel(month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`));
}

function typeOf(transaction) {
  return transaction.type === 'income' || transaction.type === 'in' ? 'income' : 'expense';
}

function transactionWallet(transaction) {
  return transaction.walletId ?? transaction.wallet;
}

function announce(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function parseIntegerRupiah(value, allowZero = false) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || (allowZero ? amount < 0 : amount <= 0)) return null;
  return amount;
}

function setTab(tab) {
  selectedTab = tab;
  for (const item of navItems) {
    const isActive = item.dataset.tab === tab;
    item.classList.toggle('active', isActive);
    if (isActive) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  render();
}

function buildModel() {
  const monthTransactions = snapshot.transactions.filter(transaction => transaction.date.startsWith(`${selectedMonth}-`));
  const income = monthTransactions.reduce((sum, transaction) => sum + (typeOf(transaction) === 'income' ? transaction.amount : 0), 0);
  const expense = monthTransactions.reduce((sum, transaction) => sum + (typeOf(transaction) === 'expense' ? transaction.amount : 0), 0);
  const balance = snapshot.wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  const monthlyExpenses = aggregateMonthlyExpenses(
    snapshot.transactions,
    6,
    new Date(`${selectedMonth}-01T12:00:00`)
  ).map(item => {
    const date = new Date(`${item.month}-01T12:00:00`);
    return {
      ...item,
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date),
      shortLabel: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date)
    };
  });

  return {
    month: selectedMonth,
    monthLabel: monthLabel(selectedMonth),
    wallets: snapshot.wallets,
    transactions: snapshot.transactions,
    allTransactions: snapshot.transactions,
    budgets: snapshot.budgets,
    goals: snapshot.goals,
    balance,
    income,
    expense,
    delta: income - expense,
    monthlyExpenses,
    categoryTotals: aggregateExpensesByCategory(snapshot.transactions, selectedMonth),
    canLoadDemo: !useApi
      && snapshot.transactions.length === 0
      && snapshot.wallets.length === 1
      && snapshot.wallets[0].openingBalance === 0
      && Object.keys(snapshot.budgets).length === 0
      && snapshot.goals.length === 0
  };
}

function renderQuickWallets() {
  const select = document.querySelector('#quick-wallet');
  const previous = select.value;
  select.innerHTML = snapshot.wallets.map(wallet => (
    `<option value="${escapeHTML(wallet.id)}">${escapeHTML(wallet.name)}</option>`
  )).join('');
  if (snapshot.wallets.some(wallet => wallet.id === previous)) select.value = previous;
  select.disabled = snapshot.wallets.length === 0;
  document.querySelector('#quick-entry-form button').disabled = snapshot.wallets.length === 0;
}

function render() {
  if (useApi && !currentUser) {
    renderSignedOut();
    return;
  }
  const model = buildModel();
  content.innerHTML = renderDashboardView(selectedTab, model);
  renderQuickWallets();
}

function renderLogin(message = '') {
  accountArea.hidden = false;
  if (!currentUser) {
    accountArea.innerHTML = `
      <section class="auth-panel" aria-labelledby="account-title">
        <span class="eyebrow">ACCOUNT SYNC</span><h2 id="account-title">Sign in to FlowMoney</h2>
        <p>Data will sync to your account through the configured API.</p>
        <form id="api-login-form">
          <label class="visually-hidden" for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="username" placeholder="Email" required />
          <label class="visually-hidden" for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Password" minlength="6" required />
          <button class="action-button" type="submit" data-auth-action="signin">Sign in</button><button class="action-button" type="submit" data-auth-action="signup">Create account</button>
        </form><p role="status">${escapeHTML(message)}</p>
      </section>`;
    return;
  }

  const alreadyImported = localRepository.hasImportedAccount(currentUser.uid);
  accountArea.innerHTML = `
    <div class="account-bar">Signed in as <strong>${escapeHTML(currentUser.email || 'FlowMoney user')}</strong>
      <span class="account-actions">${alreadyImported ? 'Local data imported' : '<button class="action-button" type="button" data-account-action="import-local">Impor data lokal ke akun</button>'}<button class="action-button" type="button" data-account-action="signout">Sign out</button></span>
    </div>`;
}

function renderSignedOut() {
  snapshot = { wallets: [], transactions: [], budgets: {}, goals: [] };
  content.innerHTML = '<div class="empty-state"><strong>Sign in to open your dashboard.</strong><p>Data akun hanya dimuat setelah autentikasi berhasil.</p></div>';
  document.querySelector('#quick-entry-form button').disabled = true;
}

async function refresh() {
  const sequence = ++refreshSequence;
  if (useApi && !currentUser) {
    renderSignedOut();
    return;
  }
  try {
    const [wallets, transactions, budgets, goals] = await Promise.all([
      repository.getWallets(),
      repository.getTransactions(),
      repository.getBudget(selectedMonth),
      repository.getGoals()
    ]);
    if (sequence !== refreshSequence) return;
    snapshot = { wallets, transactions, budgets, goals };
    monthInput.value = selectedMonth;
    const warning = document.querySelector('#storage-warning');
    warning.hidden = !fallbackMessage && repository.getStorageAvailable();
    warning.textContent = fallbackMessage || 'Browser membatasi penyimpanan lokal; data hanya bertahan selama halaman ini terbuka.';
    if (useApi) apiReady = true;
    render();
  } catch (error) {
    if (useApi && !apiReady) {
      useApi = false;
      currentUser = null;
      repository = localRepository;
      fallbackMessage = `API belum siap (${error?.message || 'tidak dapat dihubungi'}). Local mode aktif.`;
      accountArea.hidden = true;
      void refresh();
      return;
    }
    announce(error?.message || 'Data dashboard tidak dapat dimuat.', true);
  }
}

async function initializeApiAuth() {
  try {
    const [firebaseModule, authModule] = await Promise.all([
      import('../src/firebase.js'),
      import('../src/services/dashboardFirebaseAuth.js')
    ]);
    auth = firebaseModule.auth;
    await firebaseModule.authReady;
    authHelpers = authModule;
    repository = new ApiDashboardRepository({
      apiBaseUrl: runtimeConfig.API_BASE_URL,
      getIdToken: () => auth.currentUser?.getIdToken(),
      getUserId: () => auth.currentUser?.uid
    });
    renderLogin();
    authHelpers.subscribeToAuth(user => {
      currentUser = user;
      if (!user) snapshot = { wallets: [], transactions: [], budgets: {}, goals: [] };
      renderLogin();
      void refresh();
    });
  } catch (error) {
    useApi = false;
    repository = localRepository;
    fallbackMessage = `API mode belum siap (${error?.message || 'konfigurasi Firebase tidak tersedia'}). Local mode aktif.`;
    accountArea.hidden = true;
    void refresh();
  }
}

async function handleQuickEntry(event) {
  event.preventDefault();
  const input = document.querySelector('#quick-entry-input');
  const parsed = parseQuickEntry(input.value);
  if (!parsed) {
    announce('Nominal tidak terbaca. Contoh: makan 45rb atau gaji 5jt.', true);
    input.focus();
    return;
  }
  const walletId = document.querySelector('#quick-wallet').value;
  if (!walletId) {
    announce('Tambahkan dompet sebelum mencatat transaksi.', true);
    setTab('wallet');
    return;
  }
  try {
    await repository.addTransaction({
      type: parsed.type,
      amount: parsed.amount,
      walletId,
      category: parsed.category,
      date: todayLocal(),
      note: parsed.note
    });
    selectedMonth = todayLocal().slice(0, 7);
    input.value = '';
    await refresh();
    announce('Transaksi berhasil dicatat.');
  } catch (error) {
    announce(error?.message || 'Transaksi tidak dapat disimpan.', true);
  }
}

async function handleContentSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const formData = new FormData(form);
  try {
    if (form.id === 'wallet-form') {
      const openingBalance = parseIntegerRupiah(formData.get('openingBalance'), true);
      if (openingBalance === null) throw new Error('Saldo awal harus berupa rupiah integer nol atau lebih.');
      await repository.addWallet({ name: formData.get('name'), openingBalance });
      await refresh();
      announce('Dompet ditambahkan.');
    } else if (form.id === 'budget-form') {
      const limit = parseIntegerRupiah(formData.get('limit'));
      if (limit === null) throw new Error('Batas harus berupa rupiah integer lebih dari nol.');
      await repository.setBudget(selectedMonth, formData.get('category'), limit);
      await refresh();
      announce('Anggaran disimpan.');
    }
  } catch (error) {
    announce(error?.message || 'Data tidak dapat disimpan.', true);
  }
}

async function exportData() {
  try {
    const data = await repository.exportData();
    const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `flowmoney-${selectedMonth}.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
    announce('File JSON berhasil diekspor.');
  } catch (error) {
    announce(error?.message || 'Data tidak dapat diekspor.', true);
  }
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!validateDashboardData(data)) throw new Error('Struktur file JSON tidak sesuai data FlowMoney.');
    if (!confirm('Impor akan mengganti data dashboard saat ini. Lanjutkan?')) return;
    await repository.importData(data);
    await refresh();
    announce('Data berhasil diimpor.');
  } catch (error) {
    announce(error?.message || 'File JSON tidak valid.', true);
  } finally {
    document.querySelector('#import-file').value = '';
  }
}

async function resetData() {
  if (!confirm('Hapus semua dompet, transaksi, anggaran, dan target? Tindakan ini tidak dapat dibatalkan.')) return;
  try {
    await repository.resetData();
    setTab('overview');
    await refresh();
    announce('Dashboard berhasil direset.');
  } catch (error) {
    announce(error?.message || 'Data tidak dapat direset.', true);
  }
}

async function handleAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id, category } = button.dataset;
  try {
    if (action === 'delete-transaction') {
      if (!confirm('Hapus transaksi ini?')) return;
      await repository.deleteTransaction(id);
      await refresh();
      announce('Transaksi dihapus.');
    } else if (action === 'delete-wallet') {
      if (!confirm('Hapus dompet ini? Dompet terakhir atau yang masih memiliki transaksi tidak bisa dihapus.')) return;
      await repository.deleteWallet(id);
      await refresh();
      announce('Dompet dihapus.');
    } else if (action === 'delete-budget') {
      if (!confirm(`Hapus anggaran ${category}?`)) return;
      await repository.deleteBudget(selectedMonth, category);
      await refresh();
      announce('Anggaran dihapus.');
    } else if (action === 'export') {
      await exportData();
    } else if (action === 'import') {
      document.querySelector('#import-file').click();
    } else if (action === 'reset') {
      await resetData();
    } else if (action === 'load-demo') {
      localRepository.importData(createDashboardDemoData(new Date()));
      await refresh();
      announce('Sample data siap dilihat.');
    }
  } catch (error) {
    announce(error?.message || 'Aksi tidak dapat diselesaikan.', true);
  }
}

monthInput.addEventListener('change', () => {
  if (!monthInput.value) return;
  selectedMonth = monthInput.value;
  void refresh();
});

document.querySelector('.sidebar-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (button) setTab(button.dataset.tab);
});

document.querySelector('#quick-entry-form').addEventListener('submit', event => void handleQuickEntry(event));
document.querySelector('#import-file').addEventListener('change', event => {
  if (event.target.files?.[0]) void importData(event.target.files[0]);
});
content.addEventListener('submit', event => void handleContentSubmit(event));
content.addEventListener('click', event => void handleAction(event));
document.querySelector('#quick-wallet').addEventListener('change', () => {});
content.addEventListener('change', event => {
  if (event.target.name === 'category' && event.target.closest('#budget-form')) {
    const limitInput = content.querySelector('#budget-form input[name="limit"]');
    limitInput.value = snapshot.budgets[event.target.value] || '';
  }
});

accountArea.addEventListener('submit', async event => {
  if (event.target.id !== 'api-login-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const action = event.submitter?.dataset.authAction || 'signin';
  try {
    if (action === 'signup') await authHelpers.signUpWithEmail(form.get('email'), form.get('password'));
    else await authHelpers.signInWithEmail(form.get('email'), form.get('password'));
  } catch (error) {
    renderLogin(error?.message || 'Autentikasi gagal.');
  }
});

accountArea.addEventListener('click', async event => {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  try {
    if (button.dataset.accountAction === 'signout') await authHelpers.signOutUser();
    if (button.dataset.accountAction === 'import-local') {
      if (!confirm('Impor seluruh data lokal ke akun ini?')) return;
      await repository.importLocalData(localRepository.getSnapshot());
      localRepository.markImportedAccount(currentUser.uid);
      renderLogin();
      announce('Data lokal diimpor ke akun.');
    }
  } catch (error) {
    announce(error?.message || 'Aksi akun gagal.', true);
  }
});

if (useApi && window.__FLOWMONEY_FIREBASE_CONFIG__) {
  void initializeApiAuth();
} else {
  if (useApi) {
    useApi = false;
    fallbackMessage = 'Konfigurasi Firebase belum tersedia; local mode aktif.';
  }
  accountArea.hidden = true;
  void refresh();
}

function requireApiSession() {
  if (useApi && !currentUser) {
    content.innerHTML = '<div class="empty-state"><strong>Sign in to open your dashboard.</strong><p>Data akun hanya dimuat setelah autentikasi berhasil.</p></div>';
    document.querySelector('#quick-entry-form button').disabled = true;
    return false;
  }
  return true;
}