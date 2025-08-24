const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { TELEGRAM_BOT_TOKEN, EXECUTOR_CHAT_ID, TEST_THREAD_ID, WEB_APP_URL } = require('./config');

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// userState для обработки состояния пользователя при направлении обращения
const userState = {}

// Подсказки с доступными командами
bot.setMyCommands([
  { command: '/start', description: '✨ Запустить бота' },
  { command: '/help', description: '📋 Помощь по командам' },
  { command: '/shop', description: '🛍️ Открыть магазин' },
  { command: '/support', description: '❓ Написать в поддержку' },
  { command: '/stop', description: '🏁 Завершение текущего взаимодействия' }
]);

// Обработка команды /start /help /shop /support /stop
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, 'Главное меню:', {
        reply_markup:{
            inline_keyboard: [
                [
                    {
                        text: '🛍️ Магазин',
                        web_app: { url: WEB_APP_URL }
                    }
                ],
                [
                    { 
                        text: '❓ Помощь', 
                        callback_data: 'support' 
                    }
                ]
            ]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const helpCommandText = `
📝 *Доступные команды:*

    /start -  ✨ Запустить бота
    /help -  📋 Помощь по командам
    /shop -  🛍️ Открыть магазин
    /support -  ❓ Написать в поддержку
    /stop -  🏁 Завершение текущего взаимодействия
    `;

    bot.sendMessage(msg.chat.id, helpCommandText, {parse_mode: 'Markdown'});
});

bot.onText(/\/shop/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '🛍️ Хотите открыть магазин ?', {
        reply_markup:{
            inline_keyboard: [
                [
                    {
                        text: '🛍️ Открыть магазин',
                        web_app: { url: WEB_APP_URL }
                    }
                ]
            ]
        }
    });
    
});

bot.onText(/\/support/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '🆘 Хотите перейти к созданию обращения ?', {
        reply_markup:{
            inline_keyboard: [
                [
                    {
                        text: '🆘 Перейти к созданию обращения',
                        callback_data: 'support'
                    }
                ]
            ]
        }
    });
});

bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;

   if (userState[chatId] === 'awaiting_support'){
    bot.sendMessage(chatId, `
❗ Вы вышли из режима обращения
        `)
   } else {
    bot.sendMessage(chatId, `
❗ У вас нет активного взаимодействия.
✨ Чтобы начать - используйте /start
        `)
   }
});

// callback меняет состояние пользователя
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;

    if(query.data === 'support'){
        bot.sendMessage(chatId, `
❗ Обращение должно содержать следующие данные:

    👤 ФИО: Иванов Иван
    📱 Телефон: +79123456789
    💬 Сообщение: Мне нужна Помощь !

Введите текст обращения:
            `);
        userState[chatId] = 'awaiting_support';
        bot.answerCallbackQuery(query.id);
    }
});

// обработка callback'a
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // // Взять Chat ID
    // console.log('Chat ID:', msg.chat.id);

    // // Взять Thread ID
    // console.log('Thread ID:', msg.message_thread_id);

    if(text.startsWith('/')) return;

    if (userState[chatId] === 'awaiting_support'){
        const username = msg.from.username ? `@${msg.from.username}` : 'не указан';
        const supportMessage = `
📩 Новое обращение от пользователя:

🆔 ID: ${msg.from.id}
👤 Username: ${username}

💬 Сообщение:
${text}
        `;

        bot.sendMessage(EXECUTOR_CHAT_ID, supportMessage.trim(),{
            message_thread_id: Number(TEST_THREAD_ID)
        });
        bot.sendMessage(chatId, `
✅ Ваше сообщение отправлено !  
            `);
        delete userState[chatId];
    }
});
