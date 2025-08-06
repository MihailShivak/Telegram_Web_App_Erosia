require('dotenv').config();

module.exports = {
    SERVER_PORT: process.env.SERVER_PORT,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    EXECUTOR_CHAT_ID: process.env.EXECUTOR_CHAT_ID,
    TEST_THREAD_ID:process.env.TEST_THREAD_ID,
};