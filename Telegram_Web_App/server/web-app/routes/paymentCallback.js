// Подключаем зависимости
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { TELEGRAM_BOT_TOKEN, EXECUTOR_CHAT_ID, TEST_THREAD_ID } = require('../config.js');

// Файлы
const ORDERS_JSON = path.join(__dirname, '../data/orders.json');
const LOG_FILE = path.join(__dirname, '../logs/webhooks.log');

// POST /api/payment-callback

router.post('/', async(req, res) => {
    try {
        const webhookData = req.body;

        // Логируем входящий webhook
        await fs.ensureFile(LOG_FILE);

        let logLines = [];
        if (await fs.pathExists(LOG_FILE)) {
            const raw = await fs.readFile(LOG_FILE, 'utf-8');
            logLines = raw.trim().split(',\n').filter(Boolean);
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            data: webhookData
        };
        logLines.push(JSON.stringify(logEntry, null, 2));

        const MAX_LOGS = 1000;
        if (logLines.length > MAX_LOGS) {
            logLines = logLines.slice(logLines.length - MAX_LOGS);
        }

        await fs.writeFile(LOG_FILE, logLines.join(',\n') + ',\n');

        // Check event
        const event = webhookData.event;
        const payment = webhookData.object;

        if (event !== 'payment.succeeded'){
            return res.status(400).json({error: 'Ошибка оплаты!'});
        }

        const orderId = payment.metadata?.order_id;

        if (!orderId){
            return res.status(400).json({error:'order_id не найден'});
        }

        // Find an order
        const orders = await fs.readJson(ORDERS_JSON);
        const index = orders.findIndex(o => o.id === orderId);

        if (index === -1){
            return res.status(404).json({error: 'Заказ не найден'});
        }

        // Update the order
        orders[index].paid = true;
        await fs.writeJson(ORDERS_JSON, orders, {spaces: 2});

        const order = orders[index];

        // Notify the contractor
        const message = `
🛒 Новый заказ!

👤 ФИО: ${order.name}
📱 Телефон: ${order.phone}
📍 ПВЗ: ${order.pickup_point}
🔗 Telegram: ${order.username || 'не указан'}

📦 Товары:
${order.items.map(i => `- ${i.name} ×${i.qty} — ${i.price * i.qty} ₽`).join('\n')}

💰 Сумма: ${order.total} ₽

💳 Оплата: ✅ Оплачено
        `;

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: EXECUTOR_CHAT_ID,
            message_thread_id: Number(TEST_THREAD_ID),
            text: message
        });

        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка в payment-callback', error.message);
        res.status(500).json({error: 'Ошибка сервера'});
    }
});

module.exports = router