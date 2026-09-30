const AMOUNT_UNITS = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000
};

const CATEGORIES = [
  ['makan', 'Makan'],
  ['kopi', 'Makan'],
  ['nasi', 'Makan'],
  ['food', 'Makan'],
  ['grab', 'Transport'],
  ['ojek', 'Transport'],
  ['bensin', 'Transport'],
  ['tol', 'Transport'],
  ['parkir', 'Transport'],
  ['transport', 'Transport'],
  ['listrik', 'Tagihan'],
  ['pulsa', 'Tagihan'],
  ['wifi', 'Tagihan'],
  ['kos', 'Tagihan'],
  ['tagihan', 'Tagihan'],
  ['belanja', 'Belanja'],
  ['beli', 'Belanja'],
  ['nonton', 'Hiburan'],
  ['game', 'Hiburan'],
  ['hiburan', 'Hiburan'],
  ['obat', 'Kesehatan'],
  ['dokter', 'Kesehatan'],
  ['kesehatan', 'Kesehatan'],
  ['pendidikan', 'Pendidikan']
];

export function parseIdrAmount(value) {
  const normalized = String(value || '').toLowerCase().replace(/rp\.?/g, '').replace(/\s/g, '');
  const match = normalized.match(/^(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(rb|ribu|k|jt|juta|m)?$/);
  if (!match) return null;
  const unit = match[2] || '';
  const multiplier = BigInt(AMOUNT_UNITS[unit] || 1);
  const isGroupedAmount = !unit && /^\d{1,3}(?:\.\d{3})+$/.test(match[1]);
  const numericPart = isGroupedAmount ? match[1].replaceAll('.', '') : match[1];
  const [wholePart, fractionPart = ''] = numericPart.split(/[.,]/);
  let amount = BigInt(wholePart) * multiplier;

  if (fractionPart) {
    const divisor = 10n ** BigInt(fractionPart.length);
    const fractionalAmount = BigInt(fractionPart) * multiplier;
    amount += fractionalAmount / divisor;
    if ((fractionalAmount % divisor) * 2n >= divisor) amount += 1n;
  }

  return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function parseQuickEntry(text) {
  const input = String(text || '').trim();
  const tokens = input.split(/\s+/);
  if (tokens.length < 2) return null;

  let amountIndex = -1;
  let amountTokenCount = 1;
  let amount = null;

  for (let index = 0; index < tokens.length; index += 1) {
    if (index + 1 < tokens.length) {
      const separatedAmount = parseIdrAmount(`${tokens[index]}${tokens[index + 1]}`);
      if (separatedAmount !== null) {
        amountIndex = index;
        amountTokenCount = 2;
        amount = separatedAmount;
        break;
      }
    }

    const directAmount = parseIdrAmount(tokens[index]);
    if (directAmount !== null) {
      amountIndex = index;
      amount = directAmount;
      break;
    }
  }

  if (amountIndex < 0) return null;

  const descriptionTokens = tokens.filter((_, index) => (
    index < amountIndex || index >= amountIndex + amountTokenCount
  ));
  const description = descriptionTokens.join(' ').trim();
  const normalizedDescription = description.toLowerCase();
  const isBonus = normalizedDescription.includes('bonus');
  const isSalary = normalizedDescription.includes('gaji') || normalizedDescription.includes('salary');
  const isIncome = ['gaji', 'bonus', 'salary', 'income', 'pendapatan', 'dapat']
    .some(keyword => normalizedDescription.includes(keyword));
  const category = isIncome
    ? isBonus ? 'Bonus' : isSalary ? 'Gaji' : 'Pemasukan'
    : CATEGORIES.find(([keyword]) => normalizedDescription.includes(keyword))?.[1] || 'Lainnya';
  return {
    amount,
    type: isIncome ? 'income' : 'expense',
    category,
    note: description || category
  };
}

export function parseExpenseText(text) {
  const parsed = parseQuickEntry(text);
  if (!parsed) return null;
  const categoryNames = { Makan: 'Makanan', Transport: 'Transportasi', Pemasukan: 'Pendapatan', Gaji: 'Pendapatan' };
  return {
    amount: parsed.amount,
    categoryName: categoryNames[parsed.category] || parsed.category,
    note: parsed.note
  };
}

export function parseTelegramTransaction(text) {
  const parsed = parseQuickEntry(text);
  if (!parsed) return null;
  return {
    amount: parsed.amount,
    categoryName: parsed.category === 'Makan'
      ? 'Makanan'
      : parsed.category === 'Transport'
        ? 'Transportasi'
        : ['Pemasukan', 'Gaji'].includes(parsed.category)
          ? 'Pendapatan'
          : parsed.category,
    note: parsed.note,
    type: parsed.type
  };
}

export function formatIdr(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}
