import { parseQuickEntry } from '../functions/telegram.js';
import {
  aggregateDailyExpenses,
  aggregateExpensesByCategory,
  calculateActivityStreak,
  calculateAssetPerformance,
  calculateGoalProgress,
  getBudgetStatus
} from '../src/services/dashboardFinance.js';
import { createDashboardDemoData } from '../src/services/dashboardDemoData.js';
import { createAssetPriceProvider } from '../src/services/assetPriceProvider.js';
import { ApiDashboardRepository } from '../src/repositories/apiDashboardRepository.js';
import { LocalDashboardRepository, validateDashboardData } from '../src/repositories/localDashboardRepository.js';

const CATEGORY = {
  Makan: { label: 'Makanan', emoji: '🍔', color: '#f87171' },
  Makanan: { label: 'Makanan', emoji: '🍔', color: '#f87171' },
  Transport: { label: 'Transport', emoji: '🚙', color: '#fbbf24' },
  Transportasi: { label: 'Transport', emoji: '🚙', color: '#fbbf24' },
  Belanja: { label: 'Belanja', emoji: '🛍️', color: '#60a5fa' },
  Tagihan: { label: 'Tagihan', emoji: '🧾', color: '#a78bfa' },
  Hiburan: { label: 'Hiburan', emoji: '🎬', color: '#f472b6' },
  Kesehatan: { label: 'Kesehatan', emoji: '💊', color: '#10b981' },
  Lainnya: { label: 'Lainnya', emoji: '📦', color: '#94a3b8' },
  Gaji: { label: 'Gaji', emoji: '💰', color: '#10b981' },
  Bonus: { label: 'Bonus', emoji: '🎁', color: '#34d399' }
};

const EXPENSE_CATEGORIES = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Lainnya'];
const INCOME_CATEGORIES = ['Gaji', 'Bonus', 'Lainnya'];
const ASSET_KIND = { Aset: 'aset', Crypto: 'crypto', Saham: 'saham' };
const MENU = ['Dashboard', 'Transaksi', 'Aset', 'Crypto', 'Saham', 'Target', 'Pengaturan', 'Bantuan'];
const ICON = { Dashboard: '▦', Transaksi: '☰', Aset: '↗', Crypto: '◎', Saham: '▮', Target: '◉', Pengaturan: '⚙', Bantuan: '?' };

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const localRepository = new LocalDashboardRepository();
const runtime = window.FLOWMONEY_RUNTIME_CONFIG || {};
let useApi = runtime.USE_API === true && typeof runtime.API_BASE_URL === 'string' && runtime.API_BASE_URL.trim() !== '';
let repository = localRepository;
let auth = null;
let authHelpers = null;
let currentUser = null;
let storageWarning = '';
let view = 'Dashboard';
let month = localMonth();
let query = '';
let snapshot = { name: '', wallets: [], transactions: [], budgets: {}, goals: [], assets: [] };
let loadSequence = 0;
let modalResolve = null;
let toastTimeout;
const priceProvider = createAssetPriceProvider();

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localMonth() {
  return localDate().slice(0, 7);
}

function monthLabel(value) {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T12:00:00`));
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 }).format(value);
}

function parseRupiah(value, allowZero = false) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && (allowZero ? amount >= 0 : amount > 0) ? amount : null;
}

function toast(message, error = false) {
  const element = $('t');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.add('on');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.remove('on'), 2400);
}

function dialog({ title, description = '', fields = [], confirmLabel = 'Simpan', destructive = false }) {
  const element = $('dlg');
  const fieldMarkup = fields.map(field => {
    const fieldId = `dialog-${field.name}`;
    if (field.type === 'select') {
      return `<label class="field" for="${fieldId}">${esc(field.label)}<select id="${fieldId}" name="${esc(field.name)}" ${field.required ? 'required' : ''}>${field.options.map(option => `<option value="${esc(option.value)}"${option.value === field.value ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="field" for="${fieldId}">${esc(field.label)}<input id="${fieldId}" name="${esc(field.name)}" type="${field.type || 'text'}" value="${esc(field.value ?? '')}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''} ${field.maxLength ? `maxlength="${field.maxLength}"` : ''} inputmode="${field.inputmode || 'text'}" /></label>`;
  }).join('');
  element.innerHTML = `
    <form class="dialog-form" id="dialog-form" novalidate>
      <div class="dialog-head"><div><span class="lbl">FLOWMONEY</span><h2>${esc(title)}</h2></div><button class="dialog-close" type="button" data-dialog-cancel aria-label="Tutup dialog">×</button></div>
      ${description ? `<p class="dialog-description">${esc(description)}</p>` : ''}
      <div class="dialog-fields">${fieldMarkup}</div>
      <p class="dialog-error" id="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="btn" type="button" data-dialog-cancel>Batal</button><button class="btn ${destructive ? 'danger' : 'primary'}" type="submit">${esc(confirmLabel)}</button></div>
    </form>`;
  element.showModal();
  const form = $('dialog-form');
  const firstInput = form.querySelector('input,select,textarea');
  if (firstInput) firstInput.focus();
  return new Promise(resolve => {
    modalResolve = resolve;
  });
}

function closeDialog(result) {
  if (!$('dlg').open) return;
  $('dlg').close();
  const resolve = modalResolve;
  modalResolve = null;
  resolve?.(result);
}

$('dlg').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  closeDialog(Object.fromEntries(new FormData(form)));
});
$('dlg').addEventListener('click', event => {
  if (event.target.closest('[data-dialog-cancel]')) closeDialog(null);
});
$('dlg').addEventListener('cancel', event => {
  event.preventDefault();
  closeDialog(null);
});

async function confirmAction(title, description, label = 'Hapus') {
  const result = await dialog({ title, description, confirmLabel: label, destructive: true });
  return result !== null;
}

function typeIsIncome(transaction) {
  return transaction.type === 'income' || transaction.type === 'in';
}

function categoryInfo(category) {
  return CATEGORY[category] || CATEGORY.Lainnya;
}

function currentTransactions() {
  return snapshot.transactions.filter(transaction => transaction.date.startsWith(month));
}

function populateNavigation() {
  const nav = $('nav');
  nav.innerHTML = `<small>Menu utama</small>${MENU.map(item => `<button type="button" data-view="${item}" ${view === item ? 'aria-current="page"' : ''}>${ICON[item]} <span>${item}</span></button>`).join('')}<a class="nav-home" href="/">← Kembali ke FlowMoney</a><span class="nav-spacer"></span><button type="button" data-action="logout">↪ <span>Keluar</span></button>`;
}

function renderNotice() {
  const warning = $('storage-warning');
  warning.hidden = !storageWarning && repository.getStorageAvailable();
  warning.textContent = storageWarning || 'Penyimpanan browser terbatas; data hanya tersedia selama halaman ini terbuka.';
}

function transactionRow(transaction) {
  const info = categoryInfo(transaction.category);
  const income = typeIsIncome(transaction);
  return `<div class="tx"><span class="ic ${income ? 'in' : ''}" aria-hidden="true">${info.emoji}</span><span class="m"><b>${esc(info.label)}</b><span>${esc(transaction.note || info.label)} · ${esc(transaction.date.slice(5))}</span></span><strong class="${income ? 'i' : 'o'}">${income ? '+' : '−'}${money(transaction.amount)}</strong><button class="quiet" type="button" data-action="delete-transaction" data-id="${esc(transaction.id)}" aria-label="Hapus transaksi ${esc(transaction.note || info.label)}">×</button></div>`;
}

function walletSelect(selectedId, id = 'wallet-select') {
  return `<select id="${id}" aria-label="Pilih dompet">${snapshot.wallets.map(wallet => `<option value="${esc(wallet.id)}"${wallet.id === selectedId ? ' selected' : ''}>${esc(wallet.name)}</option>`).join('')}</select>`;
}

function populateQuickWallet() {
  const select = $('quick-wallet');
  const selected = select.value;
  select.innerHTML = snapshot.wallets.map(wallet => `<option value="${esc(wallet.id)}">${esc(wallet.name)}</option>`).join('');
  if (snapshot.wallets.some(wallet => wallet.id === selected)) select.value = selected;
  select.disabled = snapshot.wallets.length === 0;
  $('quick-form').querySelector('button[type="submit"]').disabled = snapshot.wallets.length === 0;
}

function getDailySummary(transactions) {
  const daily = aggregateDailyExpenses(transactions, month);
  const maximum = Math.max(1, ...daily.map(item => item.amount));
  return { daily, maximum };
}

function renderDashboard() {
  const transactions = currentTransactions();
  const income = transactions.reduce((sum, item) => sum + (typeIsIncome(item) ? item.amount : 0), 0);
  const expense = transactions.reduce((sum, item) => sum + (typeIsIncome(item) ? 0 : item.amount), 0);
  const walletBalance = snapshot.wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  const assetValue = snapshot.assets.reduce((sum, asset) => sum + calculateAssetPerformance(asset).value, 0);
  const netWorth = walletBalance + assetValue;
  const saved = snapshot.goals.reduce((sum, goal) => sum + goal.saved, 0);
  const categories = aggregateExpensesByCategory(snapshot.transactions, month);
  const topCategory = Object.entries(categories).sort((left, right) => right[1] - left[1])[0];
  const streak = calculateActivityStreak(snapshot.transactions);
  const date = new Date();
  const hour = date.getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  const currentMonthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
  const { daily, maximum } = getDailySummary(transactions);
  let accumulated = 0;
  const donutStops = Object.entries(categories).map(([category, amount]) => {
    const start = expense ? accumulated / expense * 100 : 0;
    accumulated += amount;
    const end = expense ? accumulated / expense * 100 : 0;
    return `${categoryInfo(category).color} ${start}% ${end}%`;
  }).join(',');
  const recent = [...snapshot.transactions].sort((left, right) => right.date.localeCompare(left.date) || String(right.createdAt || '').localeCompare(String(left.createdAt || ''))).slice(0, 5);
  const topInsight = topCategory
    ? `Pengeluaran terbesar bulan ini adalah ${categoryInfo(topCategory[0]).label}: ${money(topCategory[1])} dari total ${money(expense)} (${expense ? Math.round(topCategory[1] / expense * 100) : 0}%).`
    : 'Belum ada pengeluaran bulan ini. Coba catat cepat, misalnya makan 45rb.';
  const goals = snapshot.goals.slice(0, 3).map(goal => {
    const progress = calculateGoalProgress(goal);
    return `<div class="goal-preview"><div class="budget-head"><b>${esc(goal.name)}</b><span>${progress}%</span></div><div class="track"><i class="${progress === 100 ? 'good' : ''}" style="width:${progress}%"></i></div><div class="lbl">${money(goal.saved)} dari ${money(goal.target)}</div></div>`;
  }).join('');
  const assetPreview = snapshot.assets.slice(0, 4).map(asset => {
    const performance = calculateAssetPerformance(asset);
    return `<div class="tx"><span class="ic" aria-hidden="true">${asset.kind === 'crypto' ? '◎' : asset.kind === 'saham' ? '▮' : '◆'}</span><span class="m"><b>${esc(asset.name)}</b><span>${asset.kind === 'crypto' ? 'Crypto' : asset.kind === 'saham' ? 'Saham' : 'Aset'}</span></span><strong>${money(performance.value)}</strong></div>`;
  }).join('');
  const visibleSampleAction = snapshot.transactions.length === 0 && snapshot.wallets.length === 2 && snapshot.assets.length === 0;

  $('v').innerHTML = `
    <div class="top"><div class="top-copy"><h1>${greeting}${snapshot.name ? `, ${esc(snapshot.name)}` : ''}.</h1><div class="lbl">${date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Ringkasan keuanganmu hari ini.</div></div><span class="badge">${streak ? `🔥 ${streak} hari beruntun mencatat` : 'Belum mencatat hari ini'}</span></div>
    <section class="card hero" aria-label="Aset bersih"><div class="lbl">Aset bersih · ${esc(currentMonthName)}</div><div class="big">${money(netWorth)}</div><div class="chips"><span class="chip">${money(income)} Pemasukan</span><span class="chip">${money(expense)} Pengeluaran</span><span class="chip">${money(saved)} Tabungan</span><span class="chip"><b>${transactions.length}</b> transaksi</span></div></section>
    <section class="card insight" aria-label="Insight bulanan"><span aria-hidden="true">✦</span><span>${esc(topInsight)}</span></section>
    <section class="card"><div class="hd"><h2>Saldo bersih (semua dompet)</h2><button class="quiet" type="button" data-view="Transaksi">+ Tambah</button></div><div class="big compact-big">${money(walletBalance)}</div></section>
    <section class="card"><div class="hd"><h2>Pengeluaran harian</h2><span class="lbl">Total ${money(expense)}</span></div><div class="chart" role="img" aria-label="Grafik pengeluaran harian untuk ${esc(currentMonthName)}">${daily.map(item => `<div title="${item.date}: ${money(item.amount)}" aria-label="${item.date}: ${money(item.amount)}" data-m="${item.day % 5 === 0 || item.day === daily.length ? item.day : ''}" style="height:${item.amount ? Math.max(3, item.amount / maximum * 100) : 0}%"></div>`).join('')}</div></section>
    <section class="card"><div class="hd"><h2>Per kategori</h2><span class="lbl">${money(expense)}</span></div>${Object.keys(categories).length ? `<div class="donut-wrap"><div class="donut" role="img" aria-label="Komposisi pengeluaran per kategori: ${Object.entries(categories).map(([category, amount]) => `${esc(categoryInfo(category).label)} ${money(amount)}`).join(', ')}" style="background:conic-gradient(${donutStops})"><span class="donut-hole">Pengeluaran</span></div><div class="legend">${Object.entries(categories).sort((left, right) => right[1] - left[1]).map(([category, amount]) => `<div class="legend-row"><span class="legend-label"><i class="legend-dot" style="background:${categoryInfo(category).color}"></i>${esc(categoryInfo(category).label)}</span><b>${money(amount)}</b></div>`).join('')}</div></div>` : '<div class="ep">Belum ada pengeluaran untuk dibagi per kategori.</div>'}</section>
    <div class="two"><section class="card"><div class="hd"><h2>Transaksi terbaru</h2><button class="quiet" type="button" data-view="Transaksi">Lihat semua</button></div>${recent.length ? recent.map(renderTransaction).join('') : `<div class="ep">Belum ada transaksi.${visibleSampleAction ? '<br><button class="btn" type="button" data-action="sample">Muat data contoh</button>' : ''}</div>`}</section><section class="card"><div class="hd"><h2>Aset kamu</h2><button class="quiet" type="button" data-view="Aset">Kelola</button></div>${assetPreview || '<div class="ep">Belum ada aset yang dicatat.</div>'}</section></div>
    <section class="card"><div class="hd"><h2>Progres target</h2><button class="quiet" type="button" data-view="Target">Atur target</button></div>${goals || '<div class="ep">Belum ada target. Buat target pertamamu di menu Target.</div>'}</section>`;
}

function renderTransaction(transaction) {
  const category = categoryInfo(transaction.category ?? transaction.cat);
  const income = typeIsIncome(transaction);
  return `<div class="tx"><span class="ic ${income ? 'in' : ''}" aria-hidden="true">${category.emoji}</span><span class="m"><b>${esc(category.label)}</b><span>${esc(transaction.note || '')} · ${esc(transaction.date.slice(5))}</span></span><strong class="${income ? 'i' : 'o'}">${income ? '+' : '−'}${money(transaction.amount)}</strong><button class="quiet" type="button" data-action="delete-transaction" data-id="${esc(transaction.id)}" aria-label="Hapus transaksi ${esc(transaction.note || category.label)}">×</button></div>`;
}

function renderTransactionList(queryText = query) {
  const list = $('transaction-list');
  if (!list) return;
  const filtered = currentTransactions().filter(transaction => `${transaction.note} ${categoryInfo(transaction.category).label}`.toLocaleLowerCase('id-ID').includes(queryText.toLocaleLowerCase('id-ID'))).sort((left, right) => right.date.localeCompare(left.date) || String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  list.innerHTML = filtered.length ? filtered.map(renderTransaction).join('') : '<div class="ep">Tidak ada transaksi di bulan ini.</div>';
}

function renderTransactions() {
  const current = currentTransactions();
  $('v').innerHTML = `<div class="top"><div><h1>Transaksi</h1><div class="lbl">Catatan pemasukan dan pengeluaran dalam rupiah.</div></div><label class="field">Bulan<input id="transaction-month" type="month" value="${month}" aria-label="Pilih bulan transaksi"></label></div>
    <section class="card"><div class="hd"><h2>Tambah transaksi</h2></div><form id="transaction-form" class="form"><label class="field">Jenis<select id="transaction-type" name="type"><option value="out">Pengeluaran</option><option value="in">Pemasukan</option></select></label><label class="field">Nominal (Rp)<input name="amount" type="number" min="1" step="1" inputmode="numeric" required></label><label class="field">Dompet${walletSelect(snapshot.wallets[0]?.id, 'transaction-wallet')}</label><label class="field">Kategori<select id="transaction-category" name="category">${categoryOptions('out')}</select></label><label class="field">Tanggal<input name="date" type="date" value="${localDate()}" required></label><label class="field">Catatan<input name="note" maxlength="160" placeholder="Catatan (opsional)"></label><button class="btn p" type="submit">Simpan</button></form></section>
    <section class="card"><div class="hd"><h2>Riwayat bulan ini</h2><span class="lbl">${current.length} transaksi</span></div><label class="field search">Cari transaksi<input id="transaction-search" type="search" value="${esc(query)}" placeholder="Kategori atau catatan"></label><div id="transaction-list"></div></section>`;
  renderTransactionList();
}

function categoryOptions(type) {
  const categories = type === 'in' ? ['Gaji', 'Bonus', 'Lainnya'] : ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Lainnya'];
  return categories.map(category => `<option value="${category}">${categoryInfo(category).label}</option>`).join('');
}

function renderAssetPage(kind) {
  const assets = snapshot.assets.filter(asset => asset.kind === kind);
  const totalValue = assets.reduce((sum, asset) => sum + calculateAssetPerformance(asset).value, 0);
  const totalCost = assets.reduce((sum, asset) => sum + calculateAssetPerformance(asset).cost, 0);
  const profit = totalValue - totalCost;
  const label = kind === 'aset' ? 'Aset' : kind === 'crypto' ? 'Crypto' : 'Saham';
  $('v').innerHTML = `<div class="top"><div><h1>${label}</h1><div class="lbl">Harga diperbarui manual; provider harga dapat diganti tanpa mengubah model data.</div></div><button class="btn p" type="button" data-action="add-asset" data-kind="${kind}">Tambah ${label.toLowerCase()}</button></div><section class="card hero"><div class="lbl">Total nilai</div><div class="big">${money(totalValue)}</div>${kind !== 'aset' ? `<div class="asset-pnl ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? '+' : '−'}${money(Math.abs(profit))} (${totalCost ? (profit / totalCost * 100).toFixed(1) : '0.0'}%)</div>` : ''}</section>${assets.length ? assets.map(asset => renderAsset(asset)).join('') : `<section class="card ep">Belum ada ${label.toLowerCase()} yang dicatat.</section>`}`;
}

function renderAsset(asset) {
  const performance = calculateAssetPerformance(asset);
  const kindLabel = asset.kind === 'aset' ? 'Aset' : asset.kind === 'crypto' ? 'Crypto' : 'Saham';
  const detail = asset.kind === 'aset' ? 'Nilai tercatat' : `${formatQuantity(asset.qty)} unit · beli ${money(asset.buy)} · kini ${money(asset.price)}`;
  return `<section class="card row between"><span class="m"><b>${esc(asset.name)}</b><span>${kindLabel} · ${esc(detail)}</span></span><span class="asset-value"><b>${money(performance.value)}</b>${asset.kind !== 'aset' ? `<small class="asset-pnl ${performance.profit >= 0 ? 'positive' : 'negative'}">${performance.profit >= 0 ? '+' : '−'}${money(Math.abs(performance.profit))}</small>` : ''}</span><button class="btn" type="button" data-action="update-asset" data-id="${esc(asset.id)}">Update harga</button><button class="quiet danger-text" type="button" data-action="delete-asset" data-id="${esc(asset.id)}" aria-label="Hapus ${esc(asset.name)}">Hapus</button></section>`;
}

function formatQuantity(value) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 8 }).format(value);
}

function renderGoalsAndBudgets() {
  const monthGoals = snapshot.goals.map(goal => {
    const progress = calculateGoalProgress(goal);
    return `<section class="card"><div class="hd"><span class="m"><b>${esc(goal.name)}</b><span>${money(goal.saved)} dari ${money(goal.target)} · ${progress}%</span></span><button class="quiet danger-text" type="button" data-action="delete-goal" data-id="${esc(goal.id)}">Hapus</button></div><div class="track"><i class="${progress >= 100 ? 'good' : ''}" style="width:${progress}%"></i></div><button class="btn" type="button" data-action="contribute-goal" data-id="${esc(goal.id)}">Isi tabungan</button></section>`;
  }).join('');
  const expenses = aggregateExpensesByCategory(snapshot.transactions, month);
  const budgets = Object.entries(repository.getBudget(month));
  const budgetRows = budgets.map(([category, limit]) => {
    const spent = expenses[category] || 0;
    const status = getBudgetStatus(spent, limit);
    const percent = Math.round(spent / limit * 100);
    return `<section class="card"><div class="budget-head"><b>${esc(categoryInfo(category).label)}</b><span>${money(spent)} / ${money(limit)}</span><button class="quiet" type="button" data-action="edit-budget" data-category="${esc(category)}">Ubah</button><button class="quiet danger-text" type="button" data-action="delete-budget" data-category="${esc(category)}">Hapus</button></div><div class="track ${status}"><i style="width:${Math.min(100, percent)}%"></i></div><small class="lbl">${percent}% terpakai</small></section>`;
  }).join('');
  $('v').innerHTML = `<div class="top"><div><h1>Target</h1><div class="lbl">Tujuan tabungan dan batas pengeluaran bulan ini.</div></div><button class="btn p" type="button" data-action="add-goal">Tambah target</button></div><section class="two"><div><div class="hd"><h2>Target tabungan</h2></div>${monthGoals || '<div class="card ep">Belum ada target tabungan.</div>'}</div><div><div class="hd"><h2>Anggaran · ${esc(monthLabel(month))}</h2><button class="btn" type="button" data-action="add-budget">Atur batas</button></div>${budgetRows || '<div class="card ep">Belum ada batas anggaran.</div>'}</div></section>`;
}

function renderSettings() {
  const wallets = snapshot.wallets.map(wallet => `<div class="tx"><span class="m"><b>${esc(wallet.name)}</b><span>Saldo awal ${money(wallet.openingBalance)}</span></span><strong>${money(wallet.balance)}</strong><button class="quiet danger-text" type="button" data-action="delete-wallet" data-id="${esc(wallet.id)}" ${snapshot.wallets.length <= 1 || snapshot.transactions.some(transaction => transaction.walletId === wallet.id) ? 'disabled' : ''}>Hapus</button></div>`).join('');
  $('v').innerHTML = `<div class="top"><div><h1>Pengaturan</h1><div class="lbl">Profil, dompet, dan salinan data.</div></div></div><section class="card"><div class="hd"><h2>Profil</h2><button class="btn" type="button" data-action="edit-name">Ubah nama</button></div><p class="lbl">Nama panggilan: <b>${esc(snapshot.name || 'Belum diisi')}</b></p></section><section class="card"><div class="hd"><h2>Dompet</h2><button class="btn" type="button" data-action="add-wallet">Tambah dompet</button></div>${wallets}</section><section class="card"><div class="hd"><h2>Data</h2></div><div class="row"><button class="btn" type="button" data-action="export">Ekspor JSON</button><button class="btn" type="button" data-action="import">Impor JSON</button><button class="btn danger" type="button" data-action="reset">Reset data</button></div><p class="lbl">Data lokal tersimpan di browser ini. Ekspor JSON secara berkala sebagai cadangan.</p></section>`;
}

function renderHelp() {
  $('v').innerHTML = `<div class="top"><div><h1>Bantuan</h1><div class="lbl">Panduan singkat FlowMoney.</div></div></div><section class="card"><h2>Catat cepat</h2><p class="lbl">Ketik contoh seperti makan 45rb, kopi 25.000, atau gaji 5jt lalu tekan Enter. Pilih dompet sebelum mencatat.</p></section><section class="card"><h2>Aset bersih</h2><p class="lbl">Aset bersih adalah saldo semua dompet ditambah nilai aset, crypto, dan saham.</p></section><section class="card"><h2>Harga manual</h2><p class="lbl">Harga crypto dan saham tidak diambil dari API pasar. Perbarui melalui tombol “Update harga”.</p></section><section class="card"><h2>Cadangan data</h2><p class="lbl">Gunakan Ekspor JSON di Pengaturan untuk menyimpan cadangan, lalu Impor JSON untuk memulihkannya.</p></section>`;
}

function renderLogin(message = '') {
  $('v').innerHTML = `<section class="login-card"><span class="lbl">AKUN FLOWMONEY</span><h1>Masuk</h1><p class="lbl">Data akun dimuat dari API setelah login.</p><form id="login-form"><label class="field">Email<input name="email" type="email" autocomplete="username" required></label><label class="field">Kata sandi<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><div class="row"><button class="btn p" type="submit" data-auth="signin">Masuk</button><button class="btn" type="submit" data-auth="signup">Daftar</button></div><p class="lbl" role="status">${esc(message)}</p></form></section>`;
}

function draw() {
  renderNavigation();
  $('v').setAttribute('aria-label', view);
  if (useApi && !currentUser) return renderLogin();
  if (view === 'Dashboard') return renderDashboard();
  if (view === 'Transaksi') return renderTransactions();
  if (view === 'Aset') return renderAssetPage('aset');
  if (view === 'Crypto') return renderAssetPage('crypto');
  if (view === 'Saham') return renderAssetPage('saham');
  if (view === 'Target') return renderGoalsAndBudgets();
  if (view === 'Pengaturan') return renderSettings();
  return renderHelp();
}

function renderNavigation() {
  for (const button of $('nav').querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

function renderAccountBar() {
  const area = $('account-area');
  if (!useApi || !currentUser) {
    area.hidden = true;
    return;
  }
  area.hidden = false;
  const imported = localRepository.hasImportedAccount(currentUser.uid);
  area.innerHTML = `<div class="session-bar"><span>Masuk sebagai <b>${esc(currentUser.email || 'FlowMoney')}</b></span><span class="row">${imported ? '<span class="lbl">Data lokal sudah diimpor</span>' : '<button class="btn" type="button" data-action="import-local">Impor data lokal ke akun</button>'}<button class="btn" type="button" data-action="logout">Keluar</button></span></div>`;
}

async function loadData() {
  const sequence = ++loadSequence;
  if (useApi && !currentUser) return;
  try {
    const [profile, wallets, transactions, budgets, goals, assets] = await Promise.all([
      repository.getProfile(),
      repository.getWallets(),
      repository.getTransactions(),
      repository.getBudget(month),
      repository.getGoals(),
      repository.getAssets()
    ]);
    if (sequence !== loadSequence || (useApi && !currentUser)) return;
    snapshot = { name: profile.name || '', wallets, transactions, budgets, goals, assets };
    populateQuickWallet();
    $('month-picker').value = month;
    $('storage-warning').hidden = !storageWarning && repository.getStorageAvailable();
    $('storage-warning').textContent = storageWarning || 'Penyimpanan browser tidak tersedia; data hanya ada selama halaman ini dibuka.';
    renderAccountBar();
    draw();
  } catch (error) {
    showToast(error?.message || 'Data tidak dapat dimuat.', true);
  }
}

function showToast(message, error = false) {
  const toast = $('t');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('on');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('on'), 2400);
}

function parseInteger(value, allowZero = false) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && (allowZero ? number >= 0 : number > 0) ? number : null;
}

function fieldsForAsset(kind, asset = {}) {
  if (kind === 'aset') return [
    { name: 'name', label: 'Nama aset', value: asset.name || '', required: true, maxLength: 80 },
    { name: 'buy', label: 'Harga beli (Rp)', type: 'number', value: asset.buy || '', required: true, min: 1, step: 1 },
    { name: 'price', label: 'Nilai sekarang (Rp)', type: 'number', value: asset.price || '', required: true, min: 1, step: 1 }
  ];
  return [
    { name: 'name', label: kind === 'crypto' ? 'Simbol crypto' : 'Kode saham', value: asset.name || '', required: true, maxLength: 24 },
    { name: 'qty', label: 'Jumlah unit', type: 'number', value: asset.qty || '', required: true, min: 0.00000001, step: 'any' },
    { name: 'buy', label: 'Harga beli per unit (Rp)', type: 'number', value: asset.buy || '', required: true, min: 1, step: 1 },
    { name: 'price', label: 'Harga sekarang per unit (Rp)', type: 'number', value: asset.price || '', required: true, min: 1, step: 1 }
  ];
}

async function openDialog({ title, description = '', fields = [], confirmLabel = 'Simpan', destructive = false }) {
  const dialogElement = $('dlg');
  const fieldsElement = $('dlg-fields');
  $('dlg-title').textContent = title;
  $('dlg-kicker').textContent = 'FLOWMONEY';
  fieldsElement.replaceChildren();
  for (const field of fields) {
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = field.label;
    const input = document.createElement(field.options ? 'select' : 'input');
    input.name = field.name;
    if (field.options) {
      for (const option of field.options) {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        if (option.value === field.value) element.selected = true;
        input.append(element);
      }
    } else {
      input.type = field.type || 'text';
      if (field.value !== undefined) input.value = field.value;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.maxLength) input.maxLength = field.maxLength;
    }
    input.required = Boolean(field.required);
    label.append(input);
    fieldsElement.append(label);
  }
  $('dlg-description').textContent = description;
  $('dlg-description').hidden = !description;
  $('dlg-confirm').textContent = confirmLabel;
  $('dlg-confirm').classList.toggle('danger', destructive);
  $('dialog-error').hidden = true;
  dialogElement.showModal();
  fieldsElement.querySelector('input,select')?.focus();
  return new Promise(resolve => {
    const finish = value => {
      dialogElement.removeEventListener('close', onClose);
      dialogElement.close();
      resolve(value);
    };
    const onClose = () => resolve(null);
    dialogElement.addEventListener('close', onClose, { once: true });
    $('dlg-form').onsubmit = event => {
      event.preventDefault();
      if (!$('dlg-form').reportValidity()) return;
      finish(Object.fromEntries(new FormData($('dlg-form'))));
    };
    dialogElement.querySelectorAll('[data-dialog-cancel]').forEach(button => {
      button.onclick = () => finish(null);
    });
  });
}

async function askConfirmation(title, description) {
  return (await openDialog({ title, description, confirmLabel: 'Ya, lanjutkan', destructive: true })) !== null;
}

function goTo(nextView) {
  view = nextView;
  query = '';
  draw();
  $('v').focus({ preventScroll: true });
}

async function addWallet() {
  const values = await openDialog({
    title: 'Tambah dompet',
    fields: [
      { name: 'name', label: 'Nama dompet', required: true, maxLength: 60 },
      { name: 'open', label: 'Saldo awal (Rp)', type: 'number', value: 0, min: 0, step: 1, required: true }
    ]
  });
  if (!values) return;
  const open = parseRupiah(values.open, true);
  if (open === null) return toast('Saldo awal harus berupa rupiah integer nol atau lebih.', true);
  try {
    await repository.addWallet({ name: values.name, open });
    await loadData();
    toast('Dompet ditambahkan.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function addGoal() {
  const values = await openDialog({
    title: 'Tambah target tabungan',
    fields: [
      { name: 'name', label: 'Nama target', required: true, maxLength: 80 },
      { name: 'target', label: 'Nominal target (Rp)', type: 'number', min: 1, step: 1, required: true }
    ]
  });
  if (!values) return;
  const target = parseRupiah(values.target);
  if (target === null) return toast('Target harus berupa rupiah integer lebih dari nol.', true);
  try {
    await repository.addGoal({ name: values.name, target });
    await loadData();
    toast('Target ditambahkan.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function addAsset(kind) {
  const label = kind === 'aset' ? 'aset' : kind === 'crypto' ? 'crypto' : 'saham';
  const fields = [{ name: 'name', label: kind === 'aset' ? 'Nama aset' : kind === 'crypto' ? 'Simbol crypto' : 'Kode saham', required: true, maxLength: 80 }];
  if (kind !== 'aset') fields.push({ name: 'qty', label: 'Jumlah unit', type: 'number', min: 0.00000001, step: 'any', required: true });
  fields.push({ name: 'buy', label: kind === 'aset' ? 'Nilai perolehan (Rp)' : 'Harga beli per unit (Rp)', type: 'number', min: 1, step: 1, required: true });
  fields.push({ name: 'price', label: kind === 'aset' ? 'Nilai sekarang (Rp)' : 'Harga sekarang per unit (Rp)', type: 'number', min: 1, step: 1, required: true });
  const values = await openDialog({ title: `Tambah ${label}`, description: 'Harga dicatat manual; tidak ada API pasar berbayar.', fields });
  if (!values) return;
  const qty = kind === 'aset' ? 1 : Number(values.qty);
  const buy = parseRupiah(values.buy);
  const price = parseRupiah(values.price);
  if (!Number.isFinite(qty) || qty <= 0 || buy === null || price === null) return toast('Jumlah harus positif dan harga harus rupiah integer.', true);
  try {
    await repository.addAsset({ name: values.name, kind, qty, buy, price });
    await loadData();
    toast(`${label} ditambahkan.`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function updateAsset(assetId) {
  const asset = snapshot.assets.find(item => item.id === assetId);
  if (!asset) return;
  const values = await openDialog({
    title: 'Update harga manual',
    description: 'Harga tidak diperbarui otomatis dari pasar.',
    fields: [{ name: 'price', label: asset.kind === 'aset' ? 'Nilai sekarang (Rp)' : 'Harga sekarang per unit (Rp)', type: 'number', value: asset.price, min: 1, step: 1, required: true }],
    confirmLabel: 'Update harga'
  });
  if (!values) return;
  const price = parseRupiah(values.price);
  if (price === null) return toast('Harga harus berupa rupiah integer lebih dari nol.', true);
  try {
    const quote = await priceProvider.acceptManualPrice(asset, price);
    await repository.updateAssetPrice(quote.id, quote.price);
    await loadData();
    toast('Harga manual diperbarui.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function addBudget() {
  const values = await openDialog({
    title: 'Atur batas anggaran',
    description: `Batas pengeluaran untuk ${monthLabel(month)}.`,
    fields: [
      { name: 'category', label: 'Kategori', type: 'select', options: EXPENSE_CATEGORIES.map(category => ({ value: category, label: CATEGORY[category].label })) },
      { name: 'limit', label: 'Batas (Rp)', type: 'number', min: 1, step: 1, required: true }
    ]
  });
  if (!values) return;
  const limit = parseRupiah(values.limit);
  if (limit === null) return toast('Batas anggaran harus rupiah integer lebih dari nol.', true);
  try {
    await repository.setBudget(month, values.category, limit);
    await loadData();
    goTo('Target');
    toast('Anggaran disimpan.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function handleQuickEntry(event) {
  event.preventDefault();
  const input = $('quick-input');
  const parsed = parseQuickEntry(input.value);
  if (!parsed) {
    toast('Nominal belum terbaca. Contoh: makan 45rb atau gaji 5jt.', true);
    input.focus();
    return;
  }
  const walletId = $('quick-wallet').value;
  if (!walletId) return toast('Tambahkan dompet sebelum mencatat.', true);
  try {
    await repository.addTransaction({ type: parsed.type, amount: parsed.amount, walletId, category: parsed.category, date: localDate(), note: parsed.note });
    month = localMonth();
    await loadData();
    toast('Transaksi berhasil dicatat.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function handleFormSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = new FormData(form);
  try {
    if (form.id === 'transaction-form') {
      const amount = parseRupiah(values.get('amount'));
      if (amount === null) throw new Error('Nominal harus rupiah integer lebih dari nol.');
      await repository.addTransaction({ type: values.get('type'), amount, walletId: values.get('wallet'), category: values.get('category'), date: values.get('date'), note: values.get('note') });
      await loadData();
      toast('Transaksi disimpan.');
    } else if (form.id === 'login-form') {
      const action = event.submitter?.dataset.auth || 'signin';
      if (action === 'signup') await authHelpers.signUpWithEmail(values.get('email'), values.get('password'));
      else await authHelpers.signInWithEmail(values.get('email'), values.get('password'));
    }
  } catch (error) {
    if (form.id === 'login-form') {
      const status = form.querySelector('[role="status"]');
      status.textContent = error.message;
    } else toast(error.message, true);
  }
}

async function handleAction(action, button) {
  const id = button.dataset.id;
  const category = button.dataset.category;
  if (action === 'logout') {
    if (!useApi) return toast('Mode lokal tidak memiliki sesi login. Data tetap di browser ini.');
    loadSequence += 1;
    await authHelpers?.signOutUser();
    currentUser = null;
    snapshot = { name: '', wallets: [], transactions: [], budgets: {}, goals: [], assets: [] };
    draw();
    return;
  }
  if (action === 'import-local') {
    if (!await askConfirmation('Impor data lokal?', 'Data lokal akan dikirim satu kali ke akun ini.')) return;
    await repository.importLocalData(localRepository.getSnapshot());
    localRepository.markImportedAccount(currentUser.uid);
    renderAccountBar();
    toast('Data lokal berhasil diimpor.');
    return;
  }
  if (action === 'sample') {
    if (useApi) return toast('Data contoh hanya tersedia di mode lokal.');
    await repository.importData(createDashboardDemoData());
    await loadData();
    toast('Data contoh dimuat.');
    return;
  }
  if (action === 'delete-transaction') {
    if (!await askConfirmation('Hapus transaksi?', 'Transaksi yang dihapus tidak dapat dipulihkan.')) return;
    await repository.deleteTransaction(id);
    await loadData();
    toast('Transaksi dihapus.');
    return;
  }
  if (action === 'add-wallet') return addWallet();
  if (action === 'delete-wallet') {
    if (!await askConfirmation('Hapus dompet?', 'Dompet terakhir atau dompet yang masih memiliki transaksi tidak dapat dihapus.')) return;
    await repository.deleteWallet(id);
    await loadData();
    toast('Dompet dihapus.');
    return;
  }
  if (action === 'add-asset') return addAsset(button.dataset.kind);
  if (action === 'update-asset') return updateAsset(id);
  if (action === 'delete-asset') {
    const asset = snapshot.assets.find(item => item.id === id);
    if (!await askConfirmation('Hapus holding?', `Hapus ${asset?.name || 'holding'} dari daftar aset?`)) return;
    await repository.deleteAsset(id);
    await loadData();
    toast('Holding dihapus.');
    return;
  }
  if (action === 'add-goal') return addGoal();
  if (action === 'delete-goal') {
    if (!await askConfirmation('Hapus target?', 'Target tabungan ini akan dihapus.')) return;
    await repository.deleteGoal(id);
    await loadData();
    toast('Target dihapus.');
    return;
  }
  if (action === 'contribute-goal') {
    const goal = snapshot.goals.find(item => item.id === id);
    const values = await openDialog({ title: 'Isi target', description: goal?.name || '', fields: [{ name: 'amount', label: 'Nominal tabungan (Rp)', type: 'number', min: 1, step: 1, required: true }] });
    if (!values) return;
    const amount = parseRupiah(values.amount);
    if (amount === null) return toast('Nominal harus rupiah integer lebih dari nol.', true);
    await repository.contributeToGoal(id, amount);
    await loadData();
    toast('Tabungan ditambahkan.');
    return;
  }
  if (action === 'add-budget') return addBudget();
  if (action === 'edit-budget') {
    const values = await openDialog({ title: 'Ubah batas anggaran', description: categoryInfo(category).label, fields: [{ name: 'limit', label: 'Batas (Rp)', type: 'number', value: repository.getBudget(month)[category], min: 1, step: 1, required: true }] });
    if (!values) return;
    const limit = parseRupiah(values.limit);
    if (limit === null) return toast('Batas harus rupiah integer lebih dari nol.', true);
    await repository.setBudget(month, category, limit);
    await loadData();
    return;
  }
  if (action === 'delete-budget') {
    if (!await askConfirmation('Hapus batas anggaran?', categoryInfo(category).label)) return;
    await repository.deleteBudget(month, category);
    await loadData();
    return;
  }
  if (action === 'edit-name') {
    const values = await openDialog({ title: 'Nama panggilan', fields: [{ name: 'name', label: 'Nama panggilan', value: snapshot.name, maxLength: 30 }] });
    if (!values) return;
    await repository.updateProfile({ name: values.name });
    await loadData();
    return;
  }
  if (action === 'export') return exportData();
  if (action === 'import') return $('imf').click();
  if (action === 'reset') {
    if (!await askConfirmation('Reset semua data?', 'Dompet, transaksi, aset, anggaran, dan target akan dihapus. Tindakan ini tidak dapat dibatalkan.')) return;
    await repository.resetData();
    view = 'Dashboard';
    await loadData();
    toast('Data berhasil direset.');
  }
}

async function exportData() {
  try {
    const text = await repository.exportData();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `flowmoney-${localDate()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('File JSON diekspor.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function importData(file) {
  try {
    const normalized = await file.text();
    const { normalizeDashboardData } = await import('../src/repositories/localDashboardRepository.js');
    const data = normalizeDashboardData(JSON.parse(normalized));
    if (!data) throw new Error('Struktur file tidak sesuai schema FlowMoney.');
    if (!await askConfirmation('Impor data?', 'Data saat ini akan diganti dengan isi file JSON.')) return;
    await repository.importData(data);
    await loadData();
    toast('Data berhasil diimpor.');
  } catch (error) {
    toast(error.message || 'File JSON tidak valid.', true);
  } finally {
    $('imf').value = '';
  }
}

async function initializeApi() {
  if (!useApi) return loadData();
  if (!window.__FLOWMONEY_FIREBASE_CONFIG__?.apiKey) {
    useApi = false;
    storageWarning = 'Konfigurasi Firebase belum tersedia; mode lokal aktif.';
    return loadData();
  }
  try {
    const [firebaseModule, authModule] = await Promise.all([
      import('../src/firebase.js'),
      import('../src/services/dashboardFirebaseAuth.js')
    ]);
    await firebaseModule.authReady;
    auth = firebaseModule.auth;
    authHelpers = authModule;
    repository = new ApiDashboardRepository({
      apiBaseUrl: runtime.API_BASE_URL,
      getIdToken: () => auth.currentUser?.getIdToken(),
      getUserId: () => auth.currentUser?.uid
    });
    authHelpers.subscribeToAuth(user => {
      currentUser = user;
      if (!user) snapshot = { name: '', wallets: [], transactions: [], budgets: {}, goals: [], assets: [] };
      draw();
      if (user) void loadData();
    });
  } catch (error) {
    currentUser = null;
    storageWarning = `API/Firebase belum siap: ${error?.message || 'konfigurasi tidak tersedia'}. Mode lokal tetap aktif.`;
    useApi = false;
    repository = localRepository;
    await loadData();
  }
}

function bindEvents() {
  populateNavigation();
  $('month-picker').value = month;
  $('nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) goTo(button.dataset.view);
    const actionButton = event.target.closest('[data-action="logout"]');
    if (actionButton) void handleAction('logout', actionButton);
  });
  $('v').addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) return goTo(viewButton.dataset.view);
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) void handleAction(actionButton.dataset.action, actionButton).catch(error => toast(error.message, true));
  });
  $('v').addEventListener('submit', event => {
    if (event.target.id === 'transaction-form' || event.target.id === 'login-form') void handleFormSubmit(event);
  });
  $('v').addEventListener('change', event => {
    if (event.target.id === 'transaction-type') $('transaction-category').innerHTML = categoryOptions(event.target.value);
    if (event.target.id === 'transaction-month') {
      month = event.target.value || month;
      $('month-picker').value = month;
      void loadData();
    }
  });
  $('v').addEventListener('input', event => {
    if (event.target.id !== 'transaction-search') return;
    query = event.target.value;
    renderTransactionList(query);
  });
  $('month-picker').addEventListener('change', () => {
    month = $('month-picker').value || month;
    void loadData();
  });
  $('quick-form').addEventListener('submit', event => void handleQuickEntry(event));
  $('imf').addEventListener('change', event => {
    if (event.target.files?.[0]) void importData(event.target.files[0]);
  });
  $('account-area').addEventListener('click', event => {
    const button = event.target.closest('[data-action="import-local"]');
    if (button) void handleAction('import-local', button).catch(error => toast(error.message, true));
  });
  $('account-area').addEventListener('submit', event => {
    if (event.target.id === 'login-form') void handleFormSubmit(event);
  });
}

bindEvents();
void initializeApi();