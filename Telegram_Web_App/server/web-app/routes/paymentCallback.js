const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

const { 
  TELEGRAM_BOT_TOKEN, 
  EXECUTOR_CHAT_ID, 
  TEST_THREAD_ID, 
  WEBHOOK_SECRET, 
  YOOKASSA_SECRET_KEY 
} = require('../config.js');

const ORDERS_JSON = path.join(__dirname, '../data/orders.json');
const LOG_FILE = path.join(__dirname, '../logs/webhooks.log');

// --- Проверка подписи ЮKassa ---
function verifyYookassaSignature(body, signature, secret) {
  if (!signature) return false;
  const payload = JSON.stringify(body);
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

// --- Webhook handler ---
router.post('/', async (req, res) => {
  try {
    const webhookData = req.body;
    const payment = webhookData?.object || {};
    const metadata = payment?.metadata || {};
    const event = webhookData?.event;

    // --- Проверка кастомного секрета ---
    const webhookSecret = req.headers['x-webhook-secret'];
    if (!webhookSecret || webhookSecret !== WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Недействительный секретный ключ' });
    }

    // --- Проверка подписи ЮKassa ---
    const signature = req.headers['x-content-signature'] || req.headers['authorization'];
    if (!verifyYookassaSignature(webhookData, signature, YOOKASSA_SECRET_KEY)) {
      return res.status(403).json({ error: 'Неверная подпись ЮKassa' });
    }

    // --- Логируем webhook ---
    await fs.ensureFile(LOG_FILE);
    let logLines = [];
    if (await fs.pathExists(LOG_FILE)) {
      const raw = await fs.readFile(LOG_FILE, 'utf-8');
      logLines = raw.trim().split(',\n').filter(Boolean);
    }

    const logData = {
      timestamp: new Date().toISOString(),
      raw: webhookData,
      parsed: {
        order_id: metadata.order_id,
        username: metadata.username,
        name: metadata.name,
        phone: metadata.phone,
        pickup_point: metadata.pickup_point,
        items: metadata.items ? JSON.parse(metadata.items) : [],
        total: payment.amount?.value,
        currency: payment.amount?.currency,
        status: payment.status
      }
    };

    logLines.push(JSON.stringify(logData, null, 2));
    if (logLines.length > 1000) {
      logLines = logLines.slice(-1000);
    }
    await fs.writeFile(LOG_FILE, logLines.join(',\n') + ',\n');

    // --- Отправляем логи в Telegram ---
    if (TELEGRAM_BOT_TOKEN && EXECUTOR_CHAT_ID && TEST_THREAD_ID) {
      try {
        const message = JSON.stringify(logData, null, 2);
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: EXECUTOR_CHAT_ID,
          message_thread_id: Number(TEST_THREAD_ID),
          text: message
        });
      } catch (error) {
        console.error('Ошибка при отправке логов в Telegram:', error.message);
      }
    }

    // --- Проверка события ---
    if (event !== 'payment.succeeded') {
      return res.status(200).json({ ok: true, note: 'ignored non-succeeded event' });
    }

    const orderId = metadata?.order_id;
    if (!orderId) {
      return res.status(400).json({ error: 'order_id не найден' });
    }

    // --- Загружаем заказы ---
    let orders = [];
    if (await fs.pathExists(ORDERS_JSON)) {
      const raw = await fs.readFile(ORDERS_JSON, 'utf-8');
      orders = raw.trim() ? JSON.parse(raw) : [];
    }

    // Находим заказ
    const index = orders.findIndex(o => o.id === orderId);
    if (index === -1) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = orders[index];

    // --- Проверка суммы ---
    const webhookAmount = parseFloat(payment.amount?.value || '0');
    const orderTotal = Number(order.total) || 0;
    if (webhookAmount > 0 && orderTotal > 0 && Math.abs(webhookAmount - orderTotal) > 0.01) {
      console.error(`❌ Несовпадение суммы: webhook=${webhookAmount} vs order=${orderTotal} (order_id=${orderId})`);
      return res.status(400).json({ error: 'Сумма оплаты не совпадает с суммой заказа' });
    }

    // --- Идемпотентность ---
    if (order.paid === true) {
      return res.status(200).json({ ok: true, note: 'order already paid' });
    }

    // --- Обновляем заказ ---
    order.paid = true;
    order.payment_info = {
      provider: 'yookassa',
      payment_id: payment.id || null,
      amount: payment.amount || null,
      paid_at: payment.created_at || new Date().toISOString(),
      event
    };
    orders[index] = order;
    await fs.writeJSON(ORDERS_JSON, orders, { spaces: 2 });

    // --- Уведомляем исполнителя ---
    const customerItems = (order.items || [])
      .map(i => `- ${i.name} ×${i.qty} — ${i.price * i.qty} ₽`)
      .join('\n');

    const notifyMsg = `
🛒 Новый заказ!
👤 ФИО: ${order.name}
📱 Телефон: ${order.phone}
📍 ПВЗ: ${order.pickup_point}
🔗 Telegram: ${order.username || 'не указан'}

📦 Товары:
${customerItems || '—'}

💰 Сумма: ${order.total} ₽
💳 Оплата: ✅ Оплачено
    `.trim();

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: EXECUTOR_CHAT_ID,
      message_thread_id: Number(TEST_THREAD_ID),
      text: notifyMsg
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('Ошибка в payment-callback:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
