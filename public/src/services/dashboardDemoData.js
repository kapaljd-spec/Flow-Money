function monthAtOffset(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function dateInMonth(date, day) {
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, monthEnd);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function createDashboardDemoData(now = new Date()) {
  const monthExpenses = [1_250_000, 1_500_000, 1_100_000, 1_850_000, 1_600_000, 2_350_000];
  const walletId = 'demo-wallet-main';
  const transactions = [];

  for (let index = 0; index < 5; index += 1) {
    const date = monthAtOffset(now, index - 5);
    transactions.push({
      id: `demo-history-${index}`,
      date: dateInMonth(date, 18),
      type: 'out',
      wallet: walletId,
      cat: ['Belanja', 'Tagihan', 'Makan', 'Transport', 'Belanja'][index],
      amount: monthExpenses[index],
      note: ['Belanja bulanan', 'Tagihan rumah', 'Makan bersama', 'Perjalanan', 'Belanja kebutuhan'][index],
      createdAt: dateInMonth(date, 18) + 'T12:00:00.000Z'
    });
  }

  const currentMonth = monthAtOffset(now, 0);
  const currentTransactions = [
    { id: 'demo-salary', day: 2, type: 'in', cat: 'Gaji', amount: 7_000_000, note: 'Gaji bulanan' },
    { id: 'demo-bills', day: 10, type: 'out', cat: 'Tagihan', amount: 2_000_000, note: 'Bills' },
    { id: 'demo-shopping', day: 21, type: 'out', cat: 'Belanja', amount: 275_000, note: 'Belanja mingguan' },
    { id: 'demo-transport', day: 28, type: 'out', cat: 'Transport', amount: 25_000, note: 'Ride' },
    { id: 'demo-food', day: 29, type: 'out', cat: 'Makan', amount: 50_000, note: 'Lunch' }
  ];

  for (const item of currentTransactions) {
    const date = dateInMonth(currentMonth, Math.min(item.day, now.getDate()));
    transactions.push({
      id: item.id,
      date,
      type: item.type,
      wallet: walletId,
      cat: item.cat,
      amount: item.amount,
      note: item.note,
      createdAt: `${date}T12:00:00.000Z`
    });
  }

  const totalExpenses = monthExpenses.reduce((sum, amount) => sum + amount, 0);
  const openingBalance = 12_500_000 + totalExpenses - 7_000_000;

  return {
    version: 3,
    name: '',
    wallets: [{ id: walletId, name: 'Main wallet', open: openingBalance }],
    tx: transactions,
    budgets: {},
    goals: [
      { id: 'demo-goal-emergency', name: 'Dana darurat', target: 20_000_000, saved: 5_000_000 },
      { id: 'demo-goal-trip', name: 'Liburan', target: 8_000_000, saved: 8_000_000 }
    ],
    assets: [
      { id: 'demo-asset-gold', kind: 'aset', name: 'Emas 10 gram', qty: 1, buy: 9_000_000, price: 11_000_000 },
      { id: 'demo-asset-btc', kind: 'crypto', name: 'BTC', qty: 0.01, buy: 900_000_000, price: 1_100_000_000 },
      { id: 'demo-asset-bbca', kind: 'saham', name: 'BBCA', qty: 100, buy: 9_000, price: 9_800 }
    ],
    importedAccounts: []
  };
}