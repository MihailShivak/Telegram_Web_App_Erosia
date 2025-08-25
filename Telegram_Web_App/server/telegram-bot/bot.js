const TelegramBot = require('node-telegram-bot-api');
const fsExtra = require('fs-extra');
const path = require('path');
const { TELEGRAM_BOT_TOKEN, EXECUTOR_CHAT_ID, TEST_THREAD_ID, WEB_APP_URL } = require('./config');

// --- Init bot ---
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// --- userState для обработки состояния пользователя при направлении обращения ---
const userState = {};

// --- Blacklist ---
const BLACKLIST_FILE = path.join(__dirname, 'data/blacklist.json');
const rateLimitMap = new Map();

async function loadBlacklist() {
  if (!(await fsExtra.pathExists(BLACKLIST_FILE))) return [];
  return await fsExtra.readJSON(BLACKLIST_FILE);
}

async function saveBlacklist(list) {
  await fsExtra.writeJSON(BLACKLIST_FILE, list, { spaces: 2 });
}

async function isBlacklisted(userId) {
  const list = await loadBlacklist();
  return list.includes(userId);
}

async function addToBlacklist(userId) {
  const list = await loadBlacklist();
  if (!list.includes(userId)) {
    list.push(userId);
    await saveBlacklist(list);
  }
}

// --- Spam Protection ---
async function checkSpam(msg) {
  const userId = msg.from.id;

  // Если в чёрном списке
  if (await isBlacklisted(userId)) {
    bot.sendMessage(userId, '🚫 Вы заблокированы за спам.');
    return false;
  }

  const now = Date.now();
  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, []);
  }

  const timestamps = rateLimitMap.get(userId).filter(t => now - t < 60 * 1000);
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);

  if (timestamps.length > 5) {
    await addToBlacklist(userId);
    bot.sendMessage(userId, '🚫 Вы заблокированы за превышение лимита сообщений.');
    return false;
  }

  return true;
}

// --- Подсказки с доступными командами ---
bot.setMyCommands([
  { command: '/start', description: '✨ Запустить бота' },
  { command: '/help', description: '📋 Помощь по командам' },
  { command: '/shop', description: '🛍️ Открыть магазин' },
  { command: '/support', description: '❓ Написать в поддержку' },
  { command: '/stop', description: '🏁 Завершение текущего взаимодействия' }
]);

// --- /start ---
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, 'Главное меню:', {
    reply_markup: {
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

// --- /help ---
bot.onText(/\/help/, (msg) => {
  const helpCommandText = `
📝 *Доступные команды:*

/start -  ✨ Запустить бота
/help -  📋 Помощь по командам
/shop -  🛍️ Открыть магазин
/support -  ❓ Написать в поддержку
/stop -  🏁 Завершение текущего взаимодействия
  `;

  bot.sendMessage(msg.chat.id, helpCommandText, { parse_mode: 'Markdown' });
});

// --- /shop ---
bot.onText(/\/shop/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, '🛍️ Хотите открыть магазин ?', {
    reply_markup: {
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

// --- /support ---
bot.onText(/\/support/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, '🆘 Хотите перейти к созданию обращения ?', {
    reply_markup: {
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

// --- /stop ---
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;

  if (userState[chatId] === 'awaiting_support') {
    bot.sendMessage(chatId, '❗ Вы вышли из режима обращения');
  } else {
    bot.sendMessage(chatId, `
❗ У вас нет активного взаимодействия.
✨ Чтобы начать - используйте /start
    `);
  }
});

// --- callback обработка (support) ---
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;

  if (query.data === 'support') {
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

// --- Обработка входящих сообщений ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // --- Проверка на спам ---
  const ok = await checkSpam(msg);
  if (!ok) return;

  if (text.startsWith('/')) return;

  if (userState[chatId] === 'awaiting_support') {
    const username = msg.from.username ? `@${msg.from.username}` : 'не указан';
    const supportMessage = `
📩 Новое обращение от пользователя:

🆔 ID: ${msg.from.id}
👤 Username: ${username}

💬 Сообщение:
${text}
    `;

    bot.sendMessage(EXECUTOR_CHAT_ID, supportMessage.trim(), {
      message_thread_id: Number(TEST_THREAD_ID)
    });
    bot.sendMessage(chatId, `✅ Ваше сообщение отправлено!`);
    delete userState[chatId];
  }
});
