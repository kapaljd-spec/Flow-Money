import { getBudgetStatus } from '../src/services/dashboardFinance.js';

const categoryPresentation = {
  Makan: ['Food', '🍔'],
  Makanan: ['Food', '🍔'],
  Transport: ['Transport', '🚙'],
  Transportasi: ['Transport', '🚙'],
  Belanja: ['Shopping', '🛍️'],
  Tagihan: ['Bills', '🧾'],
  Hiburan: ['Fun', '🎬'],
  Kesehatan: ['Health', '💊'],
  Lainnya: ['Other', '📦'],
  Gaji: ['Salary', '💰'],
  Bonus: ['Bonus', '🎁'],
  Pemasukan: ['Income', '💰'],
  Pendapatan: ['Salary', '💰'],
  Pendidikan: ['Education', '📚']
};

const categoryChoices = ['Makan', 'Transport', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Lainnya'];

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function formatMoney(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(amount);
}

export function getCategoryPresentation(category) {
  return categoryPresentation[category] || ['Other', '📦'];
}

function transactionType(transaction) {
  return transaction.type === 'income' || transaction.type === 'in' ? 'income' : 'expense';
}

function transactionCategory(transaction) {
  return transaction.category ?? transaction.cat ?? 'Lainnya';
}

function transactionWallet(transaction) {
  return transaction.walletId ?? transaction.wallet;
}

function transactionRow(transaction, wallets) {
  const category = transactionCategory(transaction);
  const [label, emoji] = getCategoryPresentation(category);
  const type = transactionType(transaction);
  const sign = type === 'income' ? '+' : '−';
  const wallet = wallets.find(item => item.id === transactionWallet(transaction));
  return `
    <li class="transaction-row ${type}">
      <span class="transaction-icon" aria-hidden="true">${emoji}</span>
      <span class="transaction-copy">
        <strong>${escapeHTML(label)}</strong>
        <span>${escapeHTML(transaction.note || category)}</span>
      </span>
      <span class="transaction-amount">${sign}${formatMoney(transaction.amount)}</span>
      <button class="icon-button" type="button" data-action="delete-transaction" data-id="${escapeHTML(transaction.id)}" aria-label="Hapus transaksi ${escapeHTML(transaction.note || label)}" title="Hapus transaksi">×</button>
      <span class="visually-hidden">${escapeHTML(wallet?.name || '')}</span>
    </li>`;
}

function renderOverview(model) {
  const maxExpense = Math.max(1, ...model.monthlyExpenses.map(item => item.amount));
  const chart = model.monthlyExpenses.map(item => {
    const height = item.amount === 0 ? 3 : Math.max(8, Math.round(item.amount / maxExpense * 100));
    const isCurrent = item.month === model.month;
    return `
      <div class="chart-column${isCurrent ? ' current' : ''}">
        <div class="chart-track">
          <span class="chart-bar" tabindex="0" role="img" aria-label="${escapeHTML(item.label)}: ${formatMoney(item.amount)}" style="height:${height}%">
            <span class="chart-tooltip">${formatMoney(item.amount)}</span>
          </span>
        </div>
        <span class="chart-month">${escapeHTML(item.shortLabel)}</span>
      </div>`;
  }).join('');
  const recent = model.transactions.slice(0, 5);
  const deltaClass = model.delta < 0 ? ' negative' : '';
  const deltaSign = model.delta > 0 ? '+' : model.delta < 0 ? '−' : '';

  return `
    <section class="overview" aria-label="Overview">
      <header class="balance-heading">
        <div><span class="eyebrow">TOTAL BALANCE</span><h1 class="balance-amount">${formatMoney(model.balance)}</h1></div>
        <span class="delta-pill${deltaClass}" aria-label="Net monthly change ${formatMoney(model.delta)}">${deltaSign}${formatMoney(Math.abs(model.delta))}</span>
      </header>

      <div class="metrics-grid" aria-label="Monthly income and expense">
        <article class="metric-card"><span>Income</span><strong>${formatMoney(model.income)}</strong></article>
        <article class="metric-card expense"><span>Expense</span><strong>${formatMoney(model.expense)}</strong></article>
      </div>

      <section class="chart-card" aria-labelledby="monthly-chart-title">
        <div class="section-heading"><h2 id="monthly-chart-title">MONTHLY EXPENSES</h2><span>LAST 6 MONTHS</span></div>
        <div class="monthly-chart" role="img" aria-label="Pengeluaran enam bulan terakhir: ${model.monthlyExpenses.map(item => `${escapeHTML(item.label)} ${formatMoney(item.amount)}`).join(', ')}">${chart}</div>
      </section>

      <section class="recent-section" aria-labelledby="recent-title">
        <div class="section-heading"><h2 id="recent-title">RECENT TRANSACTIONS</h2><span>${recent.length ? 'LATEST 5' : ''}</span></div>
        ${recent.length
          ? `<ul class="transaction-list">${recent.map(transaction => transactionRow(transaction, model.wallets)).join('')}</ul>`
          : `<div class="empty-state"><strong>Belum ada transaksi bulan ini.</strong><p>Coba catat cepat, misalnya makan 45rb.</p>${model.canLoadDemo ? '<button class="action-button" type="button" data-action="load-demo">Load sample data</button>' : ''}</div>`}
      </section>
    </section>`;
}

function renderWallet(model) {
  const walletRows = model.wallets.map(wallet => {
    const hasTransactions = model.allTransactions.some(transaction => transactionWallet(transaction) === wallet.id);
    return `
      <li class="wallet-row">
        <span class="wallet-name"><strong>${escapeHTML(wallet.name)}</strong><span>Opening balance ${formatMoney(wallet.openingBalance)}</span></span>
        <strong class="wallet-balance">${formatMoney(wallet.balance)}</strong>
        <span class="wallet-actions"><button class="action-button danger" type="button" data-action="delete-wallet" data-id="${escapeHTML(wallet.id)}" aria-label="Delete wallet ${escapeHTML(wallet.name)}"${model.wallets.length === 1 || hasTransactions ? ' disabled title="Wallet terakhir atau wallet yang memiliki transaksi tidak dapat dihapus"' : ''}>Delete</button></span>
      </li>`;
  }).join('');

  return `
    <section aria-label="Wallet">
      <div class="panel-title"><div><span class="eyebrow">YOUR MONEY</span><h1>Wallet</h1><p>Saldo awal ditambah pemasukan dan dikurangi pengeluaran.</p></div></div>
      <div class="panel-grid">
        <section class="panel-card" aria-labelledby="wallet-list-title">
          <div class="panel-title"><h2 id="wallet-list-title">All wallets</h2><span>${model.wallets.length} TOTAL</span></div>
          <ul class="wallet-list">${walletRows}</ul>
          <form class="finance-form" id="wallet-form">
            <div class="form-row">
              <label class="field">Wallet name<input name="name" type="text" maxlength="60" required /></label>
              <label class="field">Opening balance (IDR)<input name="openingBalance" type="number" min="0" step="1" inputmode="numeric" value="0" required /></label>
            </div>
            <button type="submit">Add wallet</button>
          </form>
        </section>
        <section class="panel-card" aria-labelledby="wallet-tools-title">
          <div class="panel-title"><div><span class="eyebrow">DATA TOOLS</span><h2 id="wallet-tools-title">Backup & reset</h2></div></div>
          <p class="empty-state">Data tersimpan di browser ini sebagai rupiah integer. Simpan file JSON untuk membuat cadangan atau memindahkan data.</p>
          <div class="tool-actions">
            <button class="action-button" type="button" data-action="export">Export JSON</button>
            <button class="action-button" type="button" data-action="import">Import JSON</button>
            <button class="action-button danger" type="button" data-action="reset">Reset data</button>
          </div>
        </section>
      </div>
    </section>`;
}

function renderAnalytics(model) {
  const spentByCategory = model.categoryTotals;
  const categories = [...new Set([
    ...Object.keys(spentByCategory),
    ...Object.keys(model.budgets),
    ...(model.allTransactions.length ? [] : [])
  ])].filter(category => !['Gaji', 'Bonus', 'Pemasukan'].includes(category));
  const total = model.expense;
  const rows = categories.sort((a, b) => (spentByCategory[b] || 0) - (spentByCategory[a] || 0)).map(category => {
    const spent = spentByCategory[category] || 0;
    const limit = model.budgets[category];
    const status = limit ? getBudgetStatus(spent, limit) : 'no-budget';
    const ratio = limit ? spent / limit : total > 0 ? spent / total : 0;
    const width = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    const [label, emoji] = getCategoryPresentation(category);
    return `
      <li class="category-row">
        <div class="category-top">
          <span class="category-label"><span class="category-emoji" aria-hidden="true">${emoji}</span><span><strong>${escapeHTML(label)}</strong><small>${formatMoney(spent)} spent</small></span></span>
          <span class="category-value"><strong>${limit ? `${formatMoney(spent)} / ${formatMoney(limit)}` : formatMoney(spent)}</strong><small>${limit ? `${width}% of limit` : `${width}% of total`}</small></span>
        </div>
        <div class="progress-track ${status}" role="img" aria-label="${escapeHTML(label)}: ${formatMoney(spent)}${limit ? ` of ${formatMoney(limit)}` : `, ${width}% of total expenses`}"><span style="width:${width}%"></span></div>
        ${limit ? `<div class="budget-meta"><span>${status === 'exceeded' ? 'Limit exceeded' : status === 'warning' ? 'Near limit' : 'Within limit'}</span><button class="icon-button" type="button" data-action="delete-budget" data-category="${escapeHTML(category)}" aria-label="Hapus anggaran ${escapeHTML(label)}" title="Hapus anggaran">×</button></div>` : ''}
      </li>`;
  }).join('');

  return `
    <section aria-label="Analytics">
      <div class="panel-title"><div><span class="eyebrow">MONTHLY ANALYSIS</span><h1>Analytics</h1><p>Spending by category and monthly limits.</p></div></div>
      <div class="metrics-grid analytics-metrics"><article class="metric-card expense"><span>Total expense · ${escapeHTML(model.monthLabel)}</span><strong>${formatMoney(model.expense)}</strong></article><article class="metric-card"><span>Budget categories</span><strong>${Object.keys(model.budgets).length}</strong></article></div>
      <div class="panel-grid">
        <section class="panel-card" aria-labelledby="category-spend-title">
          <div class="panel-title"><div><span class="eyebrow">BREAKDOWN</span><h2 id="category-spend-title">Category spending</h2></div></div>
          ${rows ? `<ul class="category-list">${rows}</ul>` : '<div class="empty-state"><strong>Belum ada pengeluaran bulan ini.</strong><p>Tanpa anggaran, bar menunjukkan porsi kategori dari total pengeluaran.</p></div>'}
        </section>
        <section class="panel-card" aria-labelledby="budget-form-title">
          <div class="panel-title"><div><span class="eyebrow">MONTHLY LIMITS</span><h2 id="budget-form-title">Set a category budget</h2><p>${escapeHTML(model.monthLabel)}</p></div></div>
          <form class="budget-form" id="budget-form">
            <label class="field">Category<select name="category">${categoryChoices.map(category => `<option value="${category}">${getCategoryPresentation(category)[0]}</option>`).join('')}</select></label>
            <label class="field">Monthly limit (IDR)<input name="limit" type="number" min="1" step="1" inputmode="numeric" required /></label>
            <button type="submit">Save budget</button>
          </form>
          <p class="empty-state">Kuning mulai di 80%; merah berarti melewati batas.</p>
        </section>
      </div>
    </section>`;
}

export function renderDashboardView(tab, model) {
  if (tab === 'wallet') return renderWallet(model);
  if (tab === 'analytics') return renderAnalytics(model);
  return renderOverview(model);
}