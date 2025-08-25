// Подключаем зависимости
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { TELEGRAM_BOT_TOKEN, EXECUTOR_CHAT_ID, TEST_THREAD_ID } = require('../config');

// --- ЗАГЛУШКА: временно отключаем CDEK для тестирования ---
// const { validatePickupPoint } = require('../utils/cdek'); 

// Пути к файлам
const ORDERS_JSON = path.join(__dirname, '../data/orders.json');
const PRODUCTS_JSON = path.join(__dirname, '../data/products.json');

// --- Rate Limiting ---
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Слишком много заказов. Попробуйте снова через минуту.' },
  standardHeaders: true,
  legacyHeaders: false
});

// --- ЗАГЛУШКА: временно отключаем CDEK для тестирования ---
async function validatePickupPointStub(code) {
  console.log('⚠️  Используется заглушка CDEK. Код ПВЗ:', code);

  // --- ЗАГЛУШКА: временно отключаем CDEK для тестирования ---
  return {
    code: code || '117321',
    address: `Профсоюзная улица, 152к1`,
    city: 'Москва',
    postal_code: '117321',
    name: `ПВЗ ${code || '117321'}`,
    work_time: 'пн-пт 10:00-20:00, сб-вс 10:00-18:00',
    phone: '+7 (999) 999-99-99'
  };
}

// --- Функция отправки уведомления в Telegram ---
async function sendTelegramNotification(order) {
  if (!TELEGRAM_BOT_TOKEN || !EXECUTOR_CHAT_ID) {
    console.log('⚠️  Telegram настройки не configured, пропускаем уведомление');
    return;
  }

  try {
    const customerItems = (order.items || [])
      .map(i => `- ${i.name} ×${i.qty} — ${i.price * i.qty} ₽`)
      .join('\n');

    // Форматируем адрес ПВЗ с городом и индексом
    let pickupAddress = '';
    if (order.pickup_point) {
      const { address, city, postal_code } = order.pickup_point;
      pickupAddress = `${address}${city ? ', ' + city : ''}${postal_code ? ', ' + postal_code : ''}`;
    } else {
      pickupAddress = 'Не указан';
    }

    const notifyMsg = `
🛒 Новый заказ оплачен!
👤 ФИО: ${order.name}
📱 Телефон: ${order.phone}
📍 ПВЗ: ${pickupAddress}
🔗 Telegram: ${order.username || 'не указан'}
🆔 User ID: ${order.user_id}

📦 Товары:
${customerItems || '—'}

💰 Сумма: ${order.total} ₽
💳 Оплата: ✅ Оплачено (тестовый режим)
📋 Номер заказа: ${order.id}
    `.trim();

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: EXECUTOR_CHAT_ID,
      message_thread_id: TEST_THREAD_ID ? Number(TEST_THREAD_ID) : undefined,
      text: notifyMsg
    });

    console.log('✅ Уведомление отправлено в Telegram');

  } catch (error) {
    console.error('❌ Ошибка отправки уведомления в Telegram:', error.message);
  }
}

// --- Функция отправки уведомления покупателю ---
async function notifyCustomer(user_id, orderId, amount) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const message = `
✅ Ваш заказ #${orderId} успешно оплачен!
💰 Сумма: ${amount} руб.
📦 Статус: Передан в обработку

Спасибо за покупку! 🛍️
    `.trim();

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: user_id,
      text: message
    });

    console.log('✅ Уведомление отправлено покупателю');

  } catch (error) {
    console.error('❌ Ошибка отправки уведомления покупателю:', error.message);
  }
}

// --- POST /api/create-order ---
router.post('/', orderLimiter, async (req, res) => {
  try {
    const { user_id, username, name, phone, pickup_point, items } = req.body;

    // --- Валидация пользователя ---
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ error: 'Некорректный user_id' });
    }
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ error: 'Некорректное имя' });
    }
    if (!phone || !/^\+?\d{10,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Некорректный телефон' });
    }

    // --- Валидация товаров ---
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Некорректный список товаров' });
    }

    // --- Проверка ПВЗ через CDEK ---
    // --- ЗАГЛУШКА: временно отключаем CDEK для тестирования ---
    // if (!pickup_point?.code) {
    //   return res.status(400).json({ error: 'Не указан код ПВЗ' });
    // }

    // const normalizedPickupPoint = await validatePickupPoint(pickup_point.code);
    // if (!normalizedPickupPoint) {
    //   return res.status(400).json({ error: 'ПВЗ не найден в системе CDEK' });
    // }

    // --- ЗАГЛУШКА: временно отключаем CDEK для тестирования ---
    const normalizedPickupPoint = await validatePickupPointStub(pickup_point?.code);

    // --- Загружаем список товаров ---
    let products = [];
    if (await fs.exists(PRODUCTS_JSON)) {
      try {
        const raw = await fs.readFile(PRODUCTS_JSON, 'utf-8');
        products = raw.trim() ? JSON.parse(raw) : [];
        console.log('✅ Загружено товаров:', products.length);
      } catch (error) {
        console.error('❌ Ошибка чтения products.json:', error.message);
        // Возвращаем тестовые товары если файл поврежден
        products = [
          {
            id: "1",
            name: "Резервный товар 1",
            price: 1000
          },
          {
            id: "2",
            name: "Резервный товар 2", 
            price: 2000
          }
        ];
      }
    } else {
      console.log('⚠️  Файл products.json не найден, используем тестовые данные');
      products = [
        {
          id: "1",
          name: "Тестовый товар 1",
          price: 1000
        },
        {
          id: "2",
          name: "Тестовый товар 2", 
          price: 2000
        }
      ];
    }

    // --- Пересчёт корзины ---
    let recalculatedItems = [];
    let total = 0;

    for (const clientItem of items) {
      const product = products.find(p => p.id === clientItem.id);
      if (!product) {
        return res.status(400).json({ error: `Товар с id=${clientItem.id} не найден` });
      }

      let qty = Number(clientItem.qty) || 1;
      if (qty < 1) qty = 1;
      if (qty > 100) qty = 100;

      const subtotal = product.price * qty;

      recalculatedItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty,
        subtotal
      });

      total += subtotal;
    }

    // --- Формируем заказ ---
    const newOrder = {
      id: uuidv4(),
      user_id,
      username,
      name,
      phone,
      pickup_point: normalizedPickupPoint, // уже нормализованный объект
      items: recalculatedItems,
      total,
      paid: false,
      created_at: new Date().toISOString()
    };

    // --- Загружаем заказы ---
    let orders = [];
    if (await fs.exists(ORDERS_JSON)) {
      try {
        const raw = await fs.readFile(ORDERS_JSON, 'utf-8');
        orders = raw.trim() ? JSON.parse(raw) : [];
      } catch (error) {
        console.error('Ошибка чтения orders.json:', error.message);
        orders = [];
      }
    }

    // --- Добавляем заказ ---
    orders.push(newOrder);
    await fs.writeJSON(ORDERS_JSON, orders, { spaces: 2 });

    // --- Заглушка для оплаты ---
    const fakePaymentLink = `http://localhost:3000/api/create-order/mock-payment/${newOrder.id}?amount=${total}`;

    res.json({
      success: true,
      order: {
        id: newOrder.id,
        total: newOrder.total,
        items: newOrder.items,
        pickup_point: newOrder.pickup_point
      },
      payment: {
        url: fakePaymentLink,
        provider: 'yookassa (test mode)'
      },
      message: '✅ Ваш заказ успешно создан. Перейдите по ссылке для его оплаты.'
    });
  } catch (error) {
    console.error('Ошибка при создании заказа:', error.message);
    res.status(500).json({ error: 'Не удалось создать заказ' });
  }
});

// --- Маршрут для тестовой оплаты ---
router.get('/mock-payment/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.query;

    console.log('⚠️  Тестовая оплата для заказа:', orderId, 'Сумма:', amount);

    // Обновляем статус заказа
    let orders = [];
    if (await fs.exists(ORDERS_JSON)) {
      try {
        const raw = await fs.readFile(ORDERS_JSON, 'utf-8');
        orders = raw.trim() ? JSON.parse(raw) : [];
      } catch (error) {
        console.error('Ошибка чтения orders.json:', error.message);
        orders = [];
      }
    }

    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      orders[orderIndex].paid = true;
      orders[orderIndex].payment_info = {
        provider: 'test_payment',
        amount: parseFloat(amount) || 0,
        paid_at: new Date().toISOString()
      };
      
      try {
        await fs.writeJSON(ORDERS_JSON, orders, { spaces: 2 });
        console.log('✅ Статус заказа обновлен: оплачено');
        
        // Отправляем уведомление администратору
        await sendTelegramNotification(orders[orderIndex]);
        
        // Отправляем уведомление покупателю
        await notifyCustomer(orders[orderIndex].user_id, orderId, amount);
        
      } catch (error) {
        console.error('Ошибка записи orders.json:', error.message);
      }
    } else {
      console.log('❌ Заказ не найден:', orderId);
    }

    res.send(`
      <html>
        <head>
          <title>✅ Тестовая оплата</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; font-size: 24px; }
            .info { margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Оплата прошла успешно!</h1>
          <div class="info">
            <p><strong>Заказ #:</strong> ${orderId}</p>
            <p><strong>Сумма:</strong> ${amount} руб.</p>
          </div>
          <p>Это тестовая страница оплаты для разработки.</p>
          <p>Заказ помечен как "Оплачен" в системе.</p>
          <p>Уведомления отправлены в Telegram.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Ошибка при обработке тестовой оплаты:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1 style="color: red;">❌ Ошибка оплаты</h1>
          <p>Произошла ошибка при обработке оплаты.</p>
        </body>
      </html>
    `);
  }
});

module.exports = router;