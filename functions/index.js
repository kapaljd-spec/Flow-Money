import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { formatIdr, parseTelegramTransaction } from './telegram.js';

const telegramToken = defineSecret('TELEGRAM_BOT_TOKEN');
const supabaseUrl = defineSecret('SUPABASE_URL');
const supabaseServiceRoleKey = defineSecret('SUPABASE_SERVICE_ROLE_KEY');
const webhookSecret = defineSecret('TELEGRAM_WEBHOOK_SECRET');
const pending = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;

initializeApp({
  databaseURL: 'https://flow-moneys-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const realtimeDatabase = getDatabase();

function jsonResponse(response, status, body) {
  response.status(status).set('Content-Type', 'application/json').send(body);
}

function getConfig() {
  return {
    token: telegramToken.value(),
    databaseUrl: supabaseUrl.value().replace(/\/$/, ''),
    databaseKey: supabaseServiceRoleKey.value(),
    secret: webhookSecret.value()
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
  await realtimeDatabase.ref(`sync/${pendingTransaction.userId}`).push({
    type: 'transaction.created',
    resource: 'transactions',
    resourceId: transaction.id,
    occurredAt: new Date().toISOString()
  });
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
      text: 'Selamat datang di FlowMoney!\n\nBuat wallet pertama di dashboard, lalu kirim contoh:\n\nmakan 45rb\n\nSaya akan meminta konfirmasi sebelum menyimpannya.'
    });
    return;
  }

  if (text === '/balance') {
    const balance = await getBalance(config, userId);
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: `Saldo total kamu saat ini:\n${formatIdr(balance)}` });
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
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: `Transaksi tersimpan ✅\n${currentPending.categoryName} · ${formatIdr(currentPending.amount)}` });
    return;
  }

  const parsed = parseTelegramTransaction(text);
  if (!parsed) {
    await telegramRequest(config.token, 'sendMessage', { chat_id: chatId, text: 'Format belum dikenali. Contoh:\n\nmakan 45rb\n\nKetik /cancel untuk membatalkan konfirmasi.' });
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
    text: `Konfirmasi transaksi?\n\n${parsed.categoryName}\n${formatIdr(parsed.amount)}\nWallet: ${wallets[0].name}\n\nBalas “ya” untuk simpan atau /cancel untuk batal.`
  });
}

export const telegramWebhook = onRequest({
  region: 'asia-southeast2',
  secrets: [telegramToken, supabaseUrl, supabaseServiceRoleKey, webhookSecret],
  cors: false
}, async (request, response) => {
  const config = getConfig();
  if (request.method !== 'POST') return jsonResponse(response, 405, { ok: false });
  if (!config.secret || request.get('x-telegram-bot-api-secret-token') !== config.secret) return jsonResponse(response, 401, { ok: false });
  cleanupPending();
  try {
    await handleUpdate(config, request.body);
    return jsonResponse(response, 200, { ok: true });
  } catch (error) {
    console.error('Telegram webhook error', error);
    return jsonResponse(response, 200, { ok: false });
  }
});
