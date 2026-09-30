import express from 'express';
import { randomUUID } from 'node:crypto';
import { formatIdr, parseTelegramTransaction } from './functions/telegram.js';

const app = express();
app.use(express.json());

const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;

// Get config from environment variables
function getConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN,
    databaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    databaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET
  };
}

async function telegramRequest(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram ${method} failed`);
  return payload.result;
}

async function databaseRequest(config, table, { method = 'GET', query = '', body, prefer = 'return=representation' } = {}) {
  const response = await fetch(`${config.databaseUrl}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: config.databaseKey,
      Authorization: `Bearer ${config.databaseKey}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Prefer: prefer
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(payload?.message || `Database request failed for ${table}`);
  return payload;
}

async function findOrCreateUser(config, telegramUser) {
  const telegramId = String(telegramUser.id);
  const existing = await databaseRequest(config, 'telegram_accounts', {
    query: `?telegram_user_id=eq.${encodeURIComponent(telegramId)}&select=user_id`
  });
  if (existing[0]?.user_id) return existing[0].user_id;

  const userId = randomUUID();
  await databaseRequest(config, 'users', {
    method: 'POST',
    body: { id: userId, name: telegramUser.first_name || 'Telegram User', timezone: 'Asia/Jakarta' }
  });
  await databaseRequest(config, 'user_identities', {
    method: 'POST',
    body: { user_id: userId, provider: 'telegram', provider_user_id: telegramId }
  });
  await databaseRequest(config, 'telegram_accounts', {
    method: 'POST',
    body: {
      user_id: userId,
      telegram_user_id: telegramUser.id,
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
      last_name: telegramUser.last_name || null,
      language_code: telegramUser.language_code || null
    }
  });
  return userId;
}

async function getWallets(config, userId) {
  return databaseRequest(config, 'wallets', {
    query: `?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&deleted_at=is.null&select=id,name,type,initial_balance&order=created_at.asc`
  });
}

async function getBalance(config, userId) {
  const [wallets, transactions] = await Promise.all([
    getWallets(config, userId),
    databaseRequest(config, 'transactions', {
      query: `?user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&select=wallet_id,type,amount`
    })
  ]);
  const balances = wallets.map(wallet => {
    const total = transactions.filter(transaction => transaction.wallet_id === wallet.id).reduce((sum, transaction) => {
      return sum + (transaction.type === 'income' ? Number(transaction.amount) : -Number(transaction.amount));
    }, Number(wallet.initial_balance || 0));
    return { name: wallet.name, amount: total };
  });
  return balances.reduce((sum, wallet) => sum + wallet.amount, 0);
}

async function saveTransaction(config, pendingTransaction) {
  const [transaction] = await databaseRequest(config, 'transactions', {
    method: 'POST',
    body: {
      user_id: pendingTransaction.userId,
      type: pendingTransaction.type,
      amount: pendingTransaction.amount,
      currency: 'IDR',
      category_name: pendingTransaction.categoryName,
      wallet_id: pendingTransaction.walletId,
      date: new Date().toISOString().slice(0, 10),
      time: new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      note: pendingTransaction.note
    }
  });
  return transaction;
}

function cleanupPending() {
  const now = Date.now();
  for (const [key, value] of pending.entries()) if (value.expiresAt < now) pending.delete(key);
}

async function handleUpdate(config, update) {
  const message = update.message;
  if (!message?.chat?.id || !message.from) return;
  const chatId = message.chat.id;
  const telegramId = String(message.from.id);
  const userId = await findOrCreateUser(config, message.from);
  const text = String(message.text || '').trim();

  if (text === '/start') {
    await telegramRequest(config.token, 'sendMessage', {
      chat_id: chatId,
      text: 'Selamat datang di FlowMoney!\\n\\nBuat wallet pertama di dashboard, lalu kirim contoh:\\n\\nmakan 45rb\\n\\nSaya akan meminta konfirmasi sebelum menyimpannya.'
    });
    return;
  }

  if (text === '/balance') {
    const balance = await getBalance(config, userId);
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: `Saldo total kamu saat ini:\\n${formatIdr(balance)}` });
    return;
  }

  if (text === '/cancel') {
    pending.delete(telegramId);
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: 'Transaksi dibatalkan.' });
    return;
  }

  const currentPending = pending.get(telegramId);
  if (currentPending && /^(ya|yes|konfirmasi|confirm)$/i.test(text)) {
    await saveTransaction(config, currentPending);
    pending.delete(telegramId);
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: `Transaksi tersimpan ✅\\n${currentPending.categoryName} · ${formatIdr(currentPending.amount)}` });
    return;
  }

  const parsed = parseTelegramTransaction(text);
  if (!parsed) {
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: 'Format belum dikenali. Contoh:\\n\\nmakan 45rb\\n\\nKetik /cancel untuk membatalkan konfirmasi.' });
    return;
  }

  const wallets = await getWallets(config, userId);
  if (!wallets.length) {
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: 'Kamu belum punya wallet. Buat wallet terlebih dahulu di dashboard FlowMoney.' });
    return;
  }
  pending.set(telegramId, { ...parsed, userId, walletId: wallets[0].id, expiresAt: Date.now() + PENDING_TTL_MS });
  await telegramRequest(config.token, 'sendMessage', {
    chat_id: chatId,
    text: `Konfirmasi transaksi?\\n\\n${parsed.categoryName}\\n${formatIdr(parsed.amount)}\\nWallet: ${wallets[0].name}\\n\\nBalas "ya" untuk simpan atau /cancel untuk batal.`
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telegram webhook endpoint
app.post('/webhook/telegram', async (req, res) => {
  try {
    const config = getConfig();
    
    // Validate secret
    if (!config.secret || req.headers['x-telegram-bot-api-secret-token'] !== config.secret) {
      return res.status(401).json({ ok: false });
    }

    cleanupPending();
    await handleUpdate(config, req.body);
    res.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.status(200).json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 FlowMoney webhook server running on port ${PORT}`);
  console.log(`📡 Telegram webhook: POST /webhook/telegram`);
  console.log(`❤️  Health check: GET /health`);
});

