// Подключаем зависимости
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { v4:uuidv4 } = require('uuid');
const axios = require('axios');
const { } = require('../config.js');


// ORDERS PATH
const ORDERS_JSON = path.join(__dirname, '../data/orders.json');

// POST /api/create-order | создание заказа
router.post('/', async (req, res) => {
    try {
        const {
            user_id,
            username,
            name,
            phone,
            pickup_point,
            items
        } = req.body

        if(!user_id || !items || !Array.isArray(items)){
            return res.status(400).json({ error: 'Неверные данные заказа' });
        }

        const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

        const newOrder = {
            id: uuidv4(),
            user_id,
            username,
            name,
            phone,
            pickup_point,
            items,
            total,
            paid: false
        };

        // получаем существующие заказы
        let orders = [];
        if (await fs.pathExists(ORDERS_JSON)){
            orders = await fs.readJSON(ORDERS_JSON);
        }

        // добавляем новый заказ
        orders.push(newOrder);
        await fs.writeJSON(ORDERS_JSON, orders, {spaces: 2});
        
        // PaymentPayload
        const paymentPayload = {
            amount: {
                value: total.toFixed(2), // строка типа "1359.99"
                currency: 'RUB'
            },
            confirmation: {
                type: 'redirect',
                return_url: `${process.env.FRONTEND_CHECKOUT_URL}/checkout/${newOrder.id}` // после оплаты Юkassa перенаправляет пользователя по адресу return_url
            },
            capture: true,
            description: `Оплата заказа №${newOrder.id}`,
            metadata: {
                order_id: newOrder.id,
                name: name,
                phone: phone,
                username: username
            }
        };

        // Авторизуемся в провайдере
        const auth = Buffer
            .from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`)
            .toString('base64');

        // const yooKassaResponse = await axios.post(
        //     'https://api.yookassa.ru/v3/payments',
        //     paymentPayload,
        //     {
        //         headers: {
        //             'Content-Type': 'application/json',
        //             'Authorization': `Basic ${auth}`,
        //             'Idempotence-Key': newOrder.id
        //         }
        //     }
        // );

        const fakePaymentLink = `https://example.com/pay/${newOrder.id}`;

        // генерируем временную ссылку на оплату
        // const paymentLink = yooKassaResponse.data.confirmation.confirmation_url;
        const paymentLink = fakePaymentLink;

        res.json({
            success: true,
            order: {
                order_id: newOrder.id,
                total: total,
                user_id: newOrder.user_id,
                username: newOrder.username,
                name: newOrder.name,
                phone: newOrder.phone,
                pickup_point: newOrder.pickup_point,
                items: newOrder.items,
            },
            payment: {
                url: paymentLink,
                provider: 'yookassa'
            },
            message: 'Ваш заказ успешно создан. Перейдите по ссылке для его оплаты.'
        });

    } catch (error) {
        console.error('Ошибка при создании заказа:', error);
        res.status(500).json({error:'Не удалось создать заказ'});
    }
});

module.exports = router