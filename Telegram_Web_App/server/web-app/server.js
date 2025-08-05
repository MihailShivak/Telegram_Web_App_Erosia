// Подключаем зависимости
const express = require('express');
require('dotenv').config();
const cors = require('cors');

// Подключаем маршруты

// Сервер
const app = express();
const PORT = ProcessingInstruction.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Прописываем маршруты

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
})