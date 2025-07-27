const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_WEB_APP_TOKEN, EXECUTOR_CHAT_ID, WEB_APP_URL } = require('./config');

const bot = new TelegramBot(TELEGRAM_WEB_APP_TOKEN, { polling: true });

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id
});

