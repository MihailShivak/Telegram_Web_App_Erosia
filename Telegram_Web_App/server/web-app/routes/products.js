// Подключаем зависимости
const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');

// GET /api/products | получаем список товаров методом GET
router.get('/', async(req, res) => {
    try {
        const PRODUCTS_JSON = path.join(__dirname, '../data/products.json');
        const products = await fs.readJSON(PRODUCTS_JSON);
        res.json(products);
    } catch (error) {
        console.error('Ошибка при чтении products.json:', error.message);
        res.status(500).json({error: 'Ошибка при получении товаров'});
    }
});

module.exports = router