// Подключаем зависимости
const express = require('express');
const cors = require('cors');
const { SERVER_PORT } = require('./config.js');

// Подключаем маршруты
const productsRouter = require('./routes/products.js');
const orderRouter = require('./routes/orders.js');
const paymentCallbackRouter = require('./routes/paymentCallback.js');

// Сервер
const app = express();
const PORT = SERVER_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Прописываем маршруты
app.use('/api/products', productsRouter);
app.use('/api/create-order', orderRouter);
app.use('/api/payment-callback', paymentCallbackRouter);

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
})