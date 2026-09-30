export function isPositiveRupiah(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function calculateWalletBalance(wallet, transactions) {
  return transactions.reduce((balance, transaction) => {
    if ((transaction.walletId ?? transaction.wallet) !== wallet.id) return balance;
    const isIncome = transaction.type === 'income' || transaction.type === 'in';
    return balance + (isIncome ? transaction.amount : -transaction.amount);
  }, wallet.open ?? wallet.openingBalance);
}

export function aggregateExpensesByCategory(transactions, month) {
  return transactions.reduce((totals, transaction) => {
    const isExpense = transaction.type === 'expense' || transaction.type === 'out';
    if (!isExpense || !transaction.date.startsWith(`${month}-`)) return totals;
    const category = transaction.category ?? transaction.cat;
    totals[category] = (totals[category] || 0) + transaction.amount;
    return totals;
  }, {});
}

export function aggregateMonthlyExpenses(transactions, count = 6, endDate = new Date()) {
  const months = [];
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - offset, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({ month, amount: 0 });
  }

  const amountsByMonth = new Map(months.map(item => [item.month, item]));
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' && transaction.type !== 'out') continue;
    const month = transaction.date.slice(0, 7);
    const aggregate = amountsByMonth.get(month);
    if (aggregate) aggregate.amount += transaction.amount;
  }
  return months;
}

export function aggregateDailyExpenses(transactions, month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, '0')}`,
    day: index + 1,
    amount: 0
  }));
  const byDate = new Map(days.map(item => [item.date, item]));
  for (const transaction of transactions) {
    if (transaction.type !== 'expense' && transaction.type !== 'out') continue;
    const day = byDate.get(transaction.date);
    if (day) day.amount += transaction.amount;
  }
  return days;
}

export function calculateActivityStreak(transactions, now = new Date()) {
  const activeDates = new Set(transactions.map(transaction => transaction.date));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = formatLocalDate(today);
  const cursor = activeDates.has(todayKey) ? today : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  let streak = 0;
  while (activeDates.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculateAssetValue(asset) {
  const rawValue = asset.kind === 'aset' ? asset.price : asset.qty * asset.price;
  return Number.isFinite(rawValue) && rawValue >= 0 ? Math.round(rawValue) : 0;
}

export function calculateAssetCost(asset) {
  const rawCost = asset.kind === 'aset' ? asset.buy : asset.qty * asset.buy;
  return Number.isFinite(rawCost) && rawCost >= 0 ? Math.round(rawCost) : 0;
}

export function calculateAssetPerformance(asset) {
  const value = calculateAssetValue(asset);
  const cost = calculateAssetCost(asset);
  const profit = value - cost;
  return { value, cost, profit, percent: cost === 0 ? 0 : profit / cost * 100 };
}

export function calculateGoalProgress(goal) {
  return goal.target > 0 ? Math.min(100, Math.round(goal.saved / goal.target * 100)) : 0;
}

export function getBudgetStatus(spent, limit) {
  if (spent > limit) return 'exceeded';
  if (limit > 0 && spent * 100 >= limit * 80) return 'warning';
  return 'normal';
}