// Подключаем зависимости
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { SERVER_PORT } = require('./config.js');

// Подключаем маршруты
const productsRouter = require('./routes/products.js');
const orderRouter = require('./routes/orders.js');
const paymentCallbackRouter = require('./routes/paymentCallback.js');

// Сервер
const app = express();
const PORT = SERVER_PORT || 3000;

// Middleware защиты
app.use(helmet());
app.use(express.json());

app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Прописываем маршруты
app.use('/api/products', productsRouter);
app.use('/api/create-order', orderRouter);
app.use('/api/payment-callback', paymentCallbackRouter);

// Обработка неизвестных маршрутов
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err.message);
    res.status(500).json({error:'Внутренняя ошибка сервера'});
});

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
})