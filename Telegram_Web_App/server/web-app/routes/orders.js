// Подключаем зависимости
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { validatePickupPoint } = require('../utils/cdek');

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

// --- POST /api/create-order | создание заказа ---
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

    // --- Валидация списка товаров ---
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Некорректный список товаров' });
    }

    // --- Проверка ПВЗ через API CDEK ---
    if (!pickup_point || typeof pickup_point !== 'object' || !pickup_point.code) {
      return res.status(400).json({ error: 'Некорректный ПВЗ' });
    }

    const cdekPoint = await validatePickupPoint(pickup_point.code);
    if (!cdekPoint) {
      return res.status(400).json({ error: 'ПВЗ не найден в системе СДЭК' });
    }

    // Обновляем pickup_point из данных СДЭК
    const normalizedPickupPoint = {
      code: cdekPoint.code,
      address: cdekPoint.location.address_full,
      city: cdekPoint.location.city,
      postal_code: cdekPoint.location.postal_code
    };

    // --- Загружаем список товаров ---
    let products = [];
    if (await fs.pathExists(PRODUCTS_JSON)) {
      products = await fs.readJSON(PRODUCTS_JSON);
    }

    // --- Пересчитываем корзину ---
    let recalculatedItems = [];
    let total = 0;

    for (const clientItem of items) {
      const product = products.find(p => p.id === clientItem.id);

      if (!product) {
        console.warn(`Попытка заказать несуществующий товар id=${clientItem.id}`);
        return res.status(400).json({ error: `Товар с id=${clientItem.id} не найден` });
      }

      let qty = Number(clientItem.qty) || 1;
      if (qty < 1) qty = 1;
      if (qty > 100) qty = 100;

      const itemTotal = product.price * qty;

      recalculatedItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty,
        subtotal: itemTotal
      });

      total += itemTotal;
    }

    // --- Формируем заказ ---
    const newOrder = {
      id: uuidv4(),
      user_id,
      username,
      name,
      phone,
      pickup_point: normalizedPickupPoint,
      items: recalculatedItems,
      total,
      paid: false,
      created_at: new Date().toISOString()
    };

    // --- Загружаем существующие заказы ---
    let orders = [];
    if (await fs.pathExists(ORDERS_JSON)) {
      const raw = await fs.readFile(ORDERS_JSON, 'utf-8');
      orders = raw.trim() ? JSON.parse(raw) : [];
    }

    // --- Добавляем новый заказ ---
    orders.push(newOrder);
    await fs.writeJSON(ORDERS_JSON, orders, { spaces: 2 });

    // --- Заглушка для оплаты ---
    const fakePaymentLink = `https://example.com/pay/${newOrder.id}`;

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
      message: 'Ваш заказ успешно создан. Перейдите по ссылке для его оплаты.'
    });
  } catch (error) {
    console.error('Ошибка при создании заказа:', error.message);
    res.status(500).json({ error: 'Не удалось создать заказ' });
  }
});

module.exports = router;
