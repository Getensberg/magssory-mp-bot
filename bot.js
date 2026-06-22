const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios"); // для Google Sheets

// ================== НАСТРОЙКИ ==================
require("dotenv").config();
const TOKEN = process.env.BOT_TOKEN || "";
const GOOGLE_SHEETS_URL = process.env.SHEETS_URL || "";

const bot = new TelegramBot(TOKEN, { polling: true });

// Состояния пользователей
const userStates = new Map();

const STEP = {
  START: "start",
  NAME: "name",
  PHONE: "phone",
  PLATFORM: "platform",
  TEST_Q1: "test_q1",
  TEST_Q2: "test_q2",
  TEST_Q3: "test_q3",
  CATALOG: "catalog", // короткий шаг перед отзывами
  REVIEW: "review",
  SOCIAL: "social",
  SUBSCRIBE: "subscribe",
  FINAL: "final",
};

function getState(chatId) {
  if (!userStates.has(chatId)) {
    userStates.set(chatId, {
      step: STEP.START,
      name: "",
      phone: "",
      platform: "",
      testCorrect: 0,
    });
  }
  return userStates.get(chatId);
}

// Отправка в Google Sheets
function sendToSheet(name, phone, platform) {
  // Не ждём ответа — просто отправляем и забываем
  axios
    .post(GOOGLE_SHEETS_URL, { name, phone, platform })
    .then(() => console.log("Данные отправлены в таблицу"))
    .catch((err) => console.error("Ошибка отправки в таблицу:", err.message));
}

// ================== /start ==================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const state = getState(chatId);
  // сброс
  state.step = STEP.START;
  state.name = "";
  state.phone = "";
  state.platform = "";
  state.testCorrect = 0;
  userStates.set(chatId, state);

  const text =
    "🚀 *Добро пожаловать!* Вы попали в межгалактический квест *Magssory*.\n\n" +
    "Пройдите все этапы и откройте постоянный доступ во вселенную Magssory: " +
    "личный промокод, доступ к предпродажам, закрытые ивенты и многое другое!\n\n" +
    "_Вселенная Magssory ждёт тебя._";

  bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Начать", callback_data: "start_quest" }],
        [
          { text: "💬 Поддержка", callback_data: "support_info" },
          // { text: '📖 Инструкция', callback_data: 'instruction_info' }
        ],
      ],
    },
  });
});

// ================== Обработка кнопок ==================
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const state = getState(chatId);

  bot.answerCallbackQuery(query.id);

  try {
    switch (data) {
      // --- Старт квеста ---
      case "start_quest":
        state.step = STEP.NAME;
        userStates.set(chatId, state);
        await bot.sendMessage(
          chatId,
          "👋 *Давайте познакомимся!*\nНапишите ваше имя:",
          { parse_mode: "Markdown" },
        );
        // убираем клавиатуру у приветствия
        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: messageId },
          );
        } catch (e) {}
        break;

      // --- Инфо-кнопки ---
      case "support_info":
        await bot.sendMessage(chatId, "📞 Свяжитесь с нами: @Magssory_top");
        break;

      // --- Выбор платформы ---
      case "platform_iphone":
      case "platform_android":
        if (state.step !== STEP.PLATFORM) return;
        state.platform = data === "platform_iphone" ? "iPhone" : "Android";
        sendToSheet(state.name, state.phone, state.platform); // без await
        await bot.sendMessage(chatId, "✅ Отлично, полетели дальше.");
        // Старт викторины
        state.step = STEP.TEST_Q1;
        state.testCorrect = 0;
        userStates.set(chatId, state);
        await sendTestQuestion(chatId, 1);
        // убираем клавиатуру у сообщения с выбором
        try {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: messageId },
          );
        } catch (e) {}
        break;

      // --- Ответы викторины ---
      case "q1_a":
      case "q1_b":
      case "q1_c":
      case "q2_a":
      case "q2_b":
      case "q2_c":
      case "q2_d":
      case "q3_a":
      case "q3_b":
      case "q3_c":
      case "q3_d":
        await handleTestAnswer(chatId, messageId, data, state);
        break;

      // --- Отзывы ---
      case "review_done":
      case "review_skip":
        if (state.step !== STEP.REVIEW) return;
        state.step = STEP.SOCIAL;
        userStates.set(chatId, state);
        await bot.editMessageText(
          "📢 *Так держать!* Теперь усиливаем связь — подпишитесь на наши соцсети.\n\n" +
            "Там мы публикуем анонсы новых заданий, бонусы и интересные новости из мира аксессуаров.\n" +
            "Для прохождения достаточно подписаться на одну соцсеть, но мы будем рады, если вы подпишетесь на несколько.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📸 Instagram",
                    url: "https://www.instagram.com/magssory/",
                  },
                ],
                [{ text: "📘 VK", url: "https://vk.com/magssory" }],
                [
                  {
                    text: "📱 Telegram",
                    url: "https://t.me/magssory_official",
                  },
                ],
                [
                  {
                    text: "🎵 TikTok",
                    url: "https://www.tiktok.com/@magssory_official",
                  },
                ],
                [{ text: "✅ Готово", callback_data: "social_done" }],
              ],
            },
          },
        );
        break;

      // --- Соцсети ---
      case "social_done":
        if (state.step !== STEP.SOCIAL) return;
        state.step = STEP.SUBSCRIBE;
        userStates.set(chatId, state);
        await bot.editMessageText(
          "📧 *Почти финал!* Осталось последнее задание:\n\n" +
            "Подпишитесь на нашу рассылку — там мы присылаем только интересные и полезные новости и анонсы.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📩 Подписаться на рассылку",
                    url: "https://magssory.com/subscribe",
                  },
                ],
                [
                  { text: "✅ Готово", callback_data: "subscribe_done" },
                  { text: "⏭️ Пропустить", callback_data: "subscribe_skip" },
                ],
              ],
            },
          },
        );
        break;

      // --- Рассылка ---
      case "subscribe_done":
      case "subscribe_skip":
        if (state.step !== STEP.SUBSCRIBE) return;
        state.step = STEP.FINAL;
        userStates.set(chatId, state);
        await bot.editMessageText(
          '🎊 *Поздравляем!* Вы прошли квест "Вселенная Magssory" и присоединились к клубу избранных.\n\n' +
            "Спасибо, что вы с нами — вы стали частью нашей вселенной аксессуаров и технологий.\n\n" +
            "*Ваша награда:*\n\n" +
            "🎁 *Промокод: MAGSSORI20*\n" +
            "(скидка 20% на любую покупку до 30.09.2026)\n\n" +
            "Следите за новыми заданиями, бонусами и анонсами в наших соцсетях и рассылке.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🛍️ На сайт", url: "https://magssory.com/" }],
              ],
            },
          },
        );
        break;

      default:
        break;
    }
  } catch (err) {
    console.error("Callback error:", err);
  }
});

// ================== Текстовые сообщения ==================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  const state = getState(chatId);

  switch (state.step) {
    case STEP.NAME:
      state.name = text.trim();
      state.step = STEP.PHONE; // теперь это просто ожидание контакта
      userStates.set(chatId, state);
      await bot.sendMessage(
        chatId,
        "📞 Нажмите кнопку ниже, чтобы поделиться вашим номером телефона:",
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "📱 Поделиться номером телефона",
                  request_contact: true,
                },
              ],
            ],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        },
      );
      break;

    default:
      if (state.step !== STEP.START && state.step !== STEP.FINAL) {
        bot.sendMessage(chatId, "ℹ️ Пожалуйста, используйте кнопки на экране.");
      }
  }
});

// Обработка контакта (кнопка "Поделиться номером телефона")
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const state = getState(chatId);

  if (state.step === STEP.PHONE && contact && contact.phone_number) {
    state.phone = contact.phone_number;
    state.step = STEP.PLATFORM;
    userStates.set(chatId, state);

    // Убираем кастомную клавиатуру с кнопкой контакта
    await bot.sendMessage(chatId, "✅ Номер получен!", {
      reply_markup: { remove_keyboard: true },
    });
    await bot.sendMessage(chatId, "📱 *На какой Вы стороне?*", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🍏 У меня Айфон", callback_data: "platform_iphone" },
            { text: "🤖 У меня Андроид", callback_data: "platform_android" },
          ],
        ],
      },
    });
  } else {
    // Если бот не ожидает контакт, просто удаляем клавиатуру
    await bot.sendMessage(
      chatId,
      "ℹ️ Сейчас контакт не требуется. Продолжите по кнопкам.",
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  }
});

// ================== Викторина ==================
async function sendTestQuestion(chatId, qNum) {
  const q1 = {
    text: "📱 *Когда появился первый iPhone?*",
    buttons: [
      [{ text: "В 2001", callback_data: "q1_a" }],
      [{ text: "В 2022", callback_data: "q1_b" }],
      [{ text: "В 2007", callback_data: "q1_c" }],
    ],
  };
  const q2 = {
    text: "🧲 *Что такое MagSafe?*",
    buttons: [
      [
        {
          text: "Магнитное крепление и зарядка для iPhone",
          callback_data: "q2_a",
        },
      ],
      [{ text: "Система защиты экрана", callback_data: "q2_b" }],
      [{ text: "Название чехла", callback_data: "q2_c" }],
      [{ text: "Не знаю", callback_data: "q2_d" }],
    ],
  };
  const q3 = {
    text: "🛍️ *Что предлагает бренд Magssory?*",
    buttons: [
      [{ text: "Чехлы и аксессуары для телефонов", callback_data: "q3_a" }],
      [{ text: "Одежду", callback_data: "q3_b" }],
      [{ text: "Бытовую технику", callback_data: "q3_c" }],
      [{ text: "Не знаю", callback_data: "q3_d" }],
    ],
  };
  const questions = { 1: q1, 2: q2, 3: q3 };
  const q = questions[qNum];
  await bot.sendMessage(chatId, q.text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: q.buttons },
  });
}

async function handleTestAnswer(chatId, messageId, answer, state) {
  const correctMap = {
    q1_c: true, // 2007
    q2_a: true, // Магнитное крепление
    q3_a: true, // Чехлы и аксессуары
  };
  if (correctMap[answer]) {
    state.testCorrect++;
    userStates.set(chatId, state);
  }

  // Убираем клавиатуру вопроса
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: messageId },
    );
  } catch (e) {}

  if (answer.startsWith("q1")) {
    state.step = STEP.TEST_Q2;
    userStates.set(chatId, state);
    await sendTestQuestion(chatId, 2);
  } else if (answer.startsWith("q2")) {
    state.step = STEP.TEST_Q3;
    userStates.set(chatId, state);
    await sendTestQuestion(chatId, 3);
  } else if (answer.startsWith("q3")) {
    await showTestResultAndProceed(chatId, state);
  }
}

async function showTestResultAndProceed(chatId, state) {
  const count = state.testCorrect;
  const messages = {
    3: "🏆 *3 — ты крут!*\nУх ты — настоящий техногик! Спасибо, что играете с нами во Вселенной Magssory.",
    2: "👍 *2 — ты крут!*\nОтлично знаешь технику — почти профи!",
    1: "🙂 *1 — ты крут!*\nНеплохо, но можно ещё подтянуть знания — у нас много полезного.",
    0: "🤖 *0 — ты робот?*\nХм… возможно, вы не гиковат(а), но всё равно добро пожаловать в клуб Вселенной Magssory.",
  };
  await bot.sendMessage(chatId, messages[count], { parse_mode: "Markdown" });

  // Отправляем ссылку на каталог
  await bot.sendMessage(
    chatId,
    "🛒 *Отлично!* Полный каталог аксессуаров Magssory всегда можно найти на [САЙТЕ](https://magssory.com/catalog/)",
    { parse_mode: "Markdown" },
  );

  // Задание с отзывами
  state.step = STEP.REVIEW;
  userStates.set(chatId, state);

  const reviewText =
    "⭐ *Следующее задание из Вселенной Magssory* — оставить отзыв о покупке. " +
    "Это поможет нам стать лучше и сделает квест ещё интереснее.\n\n" +
    "Оставьте отзыв на одной из площадок, а потом вернитесь и нажмите «Готово».";

  const reviewKeyboard = {
    inline_keyboard: [
      [
        {
          text: "🟣 Оставить на Wildberries (WB)",
          url: "https://vk.cc/cF1zNF",
        },
      ],
      [
        {
          text: "🔵 Оставить на Яндекс.Маркет",
          url: "https://market.yandex.ru/business--magssory/162562558?generalContext=t%3DshopInShop%3Bi%3D1%3Bbi%3D162562558%3B&rs=eJwzUv3EqMTBKLDwEKsEg8aiQ6waB1a2smhsPMqq0XicVeP9qwfMGs-7eQD6HA5T&searchContext=sins_ctx",
        },
      ],
      [{ text: "🟢 Оставить на Ozon", url: "https://vk.cc/cF1zJg" }],
      [
        {
          text: "🌐 Купил(а) в другом месте — искать на Yandex",
          url: "https://ya.ru/search/?text=magssory&lr=213&search_source=yaru_desktop_common&search_domain=yaru&src=suggest_B",
        },
      ],
      [
        { text: "✅ Готово", callback_data: "review_done" },
        { text: "⏭️ Пропустить", callback_data: "review_skip" },
      ],
    ],
  };

  await bot.sendMessage(chatId, reviewText, {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    reply_markup: reviewKeyboard,
  });
}
