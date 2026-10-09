/**
 * index.js – Bot entry point.
 *
 * First run (no .env):  walks the user through the interactive setup wizard.
 * Subsequent runs:      starts the full pipeline bot immediately.
 */

import http from 'http';
import dayjs from 'dayjs';
import axios from 'axios';
import 'dotenv/config';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

/* ──────────────────────────────────────────────────────────────
   SETUP MODE – fires when .env is missing or incomplete
─────────────────────────────────────────────────────────────── */
import { SetupWizard } from './setup.js';

const bootstrapToken = process.env.TELEGRAM_BOT_TOKEN;

if (!bootstrapToken) {
  console.error(
    '\n❌  TELEGRAM_BOT_TOKEN is not set.\n' +
    '   Please create a .env file and add:\n' +
    '   TELEGRAM_BOT_TOKEN=<your token from @BotFather>\n' +
    '   Then run:  npm start\n' +
    '   The bot will guide you through the rest of the setup via Telegram.\n'
  );
  process.exit(1);
}

const wizard   = new SetupWizard();
const needsSetup = await wizard.isNeeded();

if (needsSetup) {
  const setupBot = new TelegramBot(bootstrapToken, { polling: true });
  wizard.bot = setupBot;
  console.log('⚙️  Setup wizard active – send any message to your bot to begin.');

  setupBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const handled = await wizard.handle(msg);
    if (!handled) {
      await setupBot.sendMessage(
        chatId,
        '👋 Welcome! This is the *Daily PDF → Notion Bot* setup wizard.\n\n' +
        'I will ask you for a few API keys and settings, then save everything to `.env`.\n' +
        'You can press Enter or type `skip` to accept any *optional* default.\n\n' +
        "Let's begin! 🚀",
        { parse_mode: 'Markdown' }
      );
      await wizard.start(chatId);
    }
  });

  setupBot.on('polling_error', (e) => console.error('Polling error:', e.message));

} else {
  /* ────────────────────────────────────────────────────────────
     NORMAL MODE – full pipeline bot with interactive verification & date picker
  ──────────────────────────────────────────────────────────── */


  const { config } = await import('./config.js');
  const { updateEnvKey, checkSystemHealth } = await import('./utils.js');
  const { downloadAndPromptVerification, processGeminiToNotion, processUrlToNotion, processUploadedPdfToNotion } = await import('./pipeline.js');
  const { getMonitoredUrls, addMonitoredUrl, removeMonitoredUrl, processAllMonitoredUrls } = await import('./urlManager.js');

  const bot        = new TelegramBot(config.telegramToken, { polling: true });
  const activeChatIds = new Set(config.allowedChatIds);
  let running      = false;
  const userStates = new Map(); // chatId -> waiting state

  const registerChatId = async (id) => {
    const strId = String(id);
    if (!activeChatIds.has(strId)) {
      activeChatIds.add(strId);
      const updated = [...activeChatIds].join(',');
      await updateEnvKey('TELEGRAM_ALLOWED_CHAT_IDS', updated);
      config.allowedChatIds = [...activeChatIds];
    }
  };

  const isAllowed = (id) => {
    registerChatId(id);
    return !config.allowedChatIds.length || config.allowedChatIds.includes(String(id));
  };

  const notifier = (chatIds) => {
    const fn = async (text) => {
      for (const id of chatIds) {
        try {
          await bot.sendMessage(id, text, { disable_web_page_preview: true, parse_mode: 'Markdown' });
        } catch (e) {
          console.error('Telegram send failed:', e.message);
        }
      }
      console.log(text);
    };

    fn.sendDocument = async (doc, filename, caption) => {
      for (const id of chatIds) {
        try {
          await bot.sendDocument(id, doc, { caption }, { filename, contentType: 'application/pdf' });
        } catch (e) {
          console.error('Telegram sendDocument failed:', e.message);
        }
      }
    };

    return fn;
  };

  /** Send / Edit the main dashboard with API Health Status & Inline Update Buttons */
  async function sendStartHealthDashboard(chatId, messageId = null) {
    let loadingMsg = null;
    if (!messageId) {
      loadingMsg = await bot.sendMessage(chatId, '🔍 *Checking API & System Health…*', { parse_mode: 'Markdown' });
    }

    const health = await checkSystemHealth();
    const savedUrls = await getMonitoredUrls();

    const text =
      `👋 *Daily PDF → Notion Bot*\n\n` +
      `🆔 *Your Chat ID*: \`${chatId}\`\n\n` +
      `🏥 *API & System Health Status*:\n` +
      `• 🔑 *Gemini API*: ${health.gemini.msg}\n` +
      `• 📓 *Notion API Key*: ${health.notionToken.msg}\n` +
      `• 📅 *Notion Integrated Page*: ${health.notionPage.msg}\n` +
      `• 🌐 *Monitored Web/PDF URLs*: *${savedUrls.length} saved*\n\n` +
      `📌 *Daily PDF Commands & Features*:\n` +
      `/today – Download today's PDF & prompt verification\n` +
      `/date – Open Interactive Date Picker (Year/Month/Day)\n` +
      `/url <link> – Process custom PDF or web article URL\n` +
      `/process YYYY-MM-DD – Download specific date's PDF\n` +
      `📤 *Upload PDF*: Attach/send any PDF file directly in chat!\n\n` +
      `👇 *Click any button below to manage PDFs, URLs, API Keys & Settings:*`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📆 Pick Date & Download PDF', callback_data: 'menu_pick_date' },
          { text: '📤 Upload PDF Info', callback_data: 'menu_upload_pdf' },
        ],
        [
          { text: '🌐 Add Monitored URL', callback_data: 'menu_add_url' },
          { text: `📋 View Saved URLs (${savedUrls.length})`, callback_data: 'menu_view_urls' },
        ],
        [
          { text: '🔑 Update Gemini Key', callback_data: 'menu_gemini' },
          { text: '📓 Update Notion Secret', callback_data: 'menu_notion_key' },
        ],
        [
          { text: '📅 Update Notion Page', callback_data: 'menu_notion_page' },
          { text: '🧠 Change Gemini Model', callback_data: 'menu_model' },
        ],
        [
          { text: '🔄 Re-check System Health', callback_data: 'menu_status' },
        ],
      ],
    };

    const targetMsgId = messageId || loadingMsg?.message_id;

    if (targetMsgId) {
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: targetMsgId,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      } catch (e) {
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
      }
    } else {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }

  /* ---------- INTERACTIVE DATE PICKER WIZARD ---------- */

  function sendYearPicker(chatId, messageId = null) {
    const text = `📆 *Interactive Date Picker (Step 1 of 3)*\n\nSelect the *Year* of the daily PDF:`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🗓️ 2026', callback_data: 'pick_year:2026' },
          { text: '🗓️ 2027', callback_data: 'pick_year:2027' },
          { text: '🗓️ 2028', callback_data: 'pick_year:2028' },
        ],
      ],
    };
    if (messageId) {
      bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }

  function sendMonthPicker(chatId, year, messageId) {
    const text = `📆 *Interactive Date Picker (Step 2 of 3)*\n\nSelected Year: *${year}*\nNow select the *Month*:`;
    const months = [
      [ { text: 'Jan', callback_data: `pick_month:${year}:01` }, { text: 'Feb', callback_data: `pick_month:${year}:02` }, { text: 'Mar', callback_data: `pick_month:${year}:03` }, { text: 'Apr', callback_data: `pick_month:${year}:04` } ],
      [ { text: 'May', callback_data: `pick_month:${year}:05` }, { text: 'Jun', callback_data: `pick_month:${year}:06` }, { text: 'Jul', callback_data: `pick_month:${year}:07` }, { text: 'Aug', callback_data: `pick_month:${year}:08` } ],
      [ { text: 'Sep', callback_data: `pick_month:${year}:09` }, { text: 'Oct', callback_data: `pick_month:${year}:10` }, { text: 'Nov', callback_data: `pick_month:${year}:11` }, { text: 'Dec', callback_data: `pick_month:${year}:12` } ],
    ];
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: months } });
  }

  function sendDayPicker(chatId, year, monthStr, messageId) {
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mNum = parseInt(monthStr, 10);
    const mName = monthNames[mNum];
    const daysInMonth = dayjs(`${year}-${monthStr}-01`).daysInMonth();

    const text = `📆 *Interactive Date Picker (Step 3 of 3)*\n\nSelected: *${mName} ${year}*\nNow click the *Day* to download the PDF:`;

    const dayButtons = [];
    let row = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const isoDate = `${year}-${monthStr}-${dd}`;
      row.push({ text: dd, callback_data: `pick_day:${isoDate}` });
      if (row.length === 7 || d === daysInMonth) {
        dayButtons.push(row);
        row = [];
      }
    }

    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: dayButtons } });
  }

  /** Step 1: Download & prompt verification */
  async function triggerFetch(dateStr, chatIds) {
    if (running) {
      return notifier(chatIds)('⏳ A job is already running. Please wait.');
    }
    running = true;
    const notify = notifier(chatIds);
    try {
      for (const id of chatIds) {
        await downloadAndPromptVerification(dateStr, notify, bot, id);
      }
    } catch (e) {
      await notify(`❌ Download failed: ${e.message}`);
    } finally {
      running = false;
    }
  }

  /** Step 2: Gemini extraction to Notion */
  async function triggerGeminiProcess(dateStr, chatIds, opts) {
    if (running) {
      return notifier(chatIds)('⏳ A job is already running. Please wait.');
    }
    running = true;
    const notify = notifier(chatIds);
    try {
      await processGeminiToNotion(dateStr, notify, opts);
    } catch (e) {
      await notify(`❌ Gemini/Notion processing failed: ${e.message}`);
    } finally {
      running = false;
    }
  }

  /** Custom URL extraction to Notion */
  async function triggerUrlProcess(targetUrl, chatIds) {
    if (running) {
      return notifier(chatIds)('⏳ A job is already running. Please wait.');
    }
    running = true;
    const notify = notifier(chatIds);
    try {
      await processUrlToNotion(targetUrl, notify);
    } catch (e) {
      await notify(`❌ URL processing failed: ${e.message}`);
    } finally {
      running = false;
    }
  }

  /** User-uploaded PDF extraction to Notion */
  async function triggerUploadedPdfProcess(fileId, filename, captionText, chatIds) {
    if (running) {
      return notifier(chatIds)('⏳ A job is already running. Please wait.');
    }
    running = true;
    const notify = notifier(chatIds);
    try {
      await notify(`📥 Downloading uploaded PDF from Telegram…`);
      const fileLink = await bot.getFileLink(fileId);
      const res = await axios.get(fileLink, { responseType: 'arraybuffer', timeout: 60000 });
      const buf = Buffer.from(res.data);

      let dateStr;
      if (captionText) {
        const match = captionText.match(/\b(\d{4}-\d{2}-\d{2})\b/) || captionText.match(/\b(\d{2}[-/\.]\d{2}[-/\.]\d{4})\b/);
        if (match) dateStr = match[1];
      }

      await processUploadedPdfToNotion(buf, filename, notify, dateStr);
    } catch (e) {
      await notify(`❌ Uploaded PDF processing failed: ${e.message}`);
    } finally {
      running = false;
    }
  }

  /* ---------- inline button callbacks ---------- */

  bot.on('callback_query', async (query) => {
    try {
    const chatId = query.message.chat.id;
    if (!isAllowed(chatId)) return;

    const data = query.data || '';

    if (data.startsWith('confirm:')) {
      const dateStr = data.replace('confirm:', '');
      await bot.answerCallbackQuery(query.id, { text: '🚀 Starting Gemini AI extraction...' });
      
      try {
        await bot.editMessageCaption(
          query.message.caption + '\n\n✅ *PDF Verified by User!* Starting Gemini LLM extraction & Notion sync…',
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
        );
      } catch {}

      await triggerGeminiProcess(dateStr, [chatId], { force: true });

    } else if (data.startsWith('cancel:')) {
      const dateStr = data.replace('cancel:', '');
      await bot.answerCallbackQuery(query.id, { text: 'Cancelled' });

      try {
        await bot.editMessageCaption(
          query.message.caption + '\n\n❌ *Cancelled by User.* PDF will not be sent to Gemini or Notion.',
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
        );
      } catch {}

    } else if (data === 'menu_pick_date') {
      await bot.answerCallbackQuery(query.id);
      sendYearPicker(chatId, query.message.message_id);

    } else if (data === 'menu_upload_pdf') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `📤 *How to Upload & Extract any Current Affairs PDF*:\n\n` +
        `1. Click the attachment 📎 icon in this chat.\n` +
        `2. Select & send any PDF file (Current Affairs, news roundup, or study notes).\n` +
        `3. *(Optional)* Add a date in the caption (e.g. \`2026-10-09\`) to save under a specific date in Notion.\n\n` +
        `The bot will automatically download your PDF, process it with Gemini AI, and save high-yield exam notes directly to your Notion page! 🚀`,
        { parse_mode: 'Markdown' }
      );

    } else if (data.startsWith('pick_year:')) {
      const year = data.split(':')[1];
      await bot.answerCallbackQuery(query.id);
      sendMonthPicker(chatId, year, query.message.message_id);

    } else if (data.startsWith('pick_month:')) {
      const [, year, monthStr] = data.split(':');
      await bot.answerCallbackQuery(query.id);
      sendDayPicker(chatId, year, monthStr, query.message.message_id);

    } else if (data.startsWith('pick_day:')) {
      const isoDate = data.split(':')[1];
      await bot.answerCallbackQuery(query.id, { text: `Processing ${isoDate}...` });
      try {
        await bot.editMessageText(`🚀 *Fetching PDF for ${isoDate} & processing automatically to Notion…*`, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        });
      } catch {}
      triggerGeminiProcess(isoDate, [chatId], { force: true });

    } else if (data === 'menu_gemini') {
      userStates.set(chatId, 'WAITING_FOR_GEMINI_KEY');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `🔑 *Update Gemini API Key*\n\n` +
        `Please reply with your new Gemini API Key:\n` +
        `(Get key: https://aistudio.google.com/app/apikey)\n\n` +
        `Type /cancel to abort.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

    } else if (data === 'menu_notion_key') {
      userStates.set(chatId, 'WAITING_FOR_NOTION_KEY');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `📓 *Update Notion Integration Secret*\n\n` +
        `Please reply with your new Notion Integration Secret (starts with \`ntn_\` or \`secret_\`):\n\n` +
        `Type /cancel to abort.`,
        { parse_mode: 'Markdown' }
      );

    } else if (data === 'menu_notion_page') {
      userStates.set(chatId, 'WAITING_FOR_NOTION_PAGE');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `📅 *Update Notion Target Page*\n\n` +
        `Please reply with your Notion Page URL or 32-character Page ID:\n` +
        `Example: \`https://www.notion.so/Current-Affairs-367bdc8a71e0804d9bd5fe58951e60bf\`\n\n` +
        `Type /cancel to abort.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

    } else if (data === 'menu_model') {
      userStates.set(chatId, 'WAITING_FOR_MODEL');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `🧠 *Update Gemini Model*\n\n` +
        `Please reply with the model name (e.g. \`gemini-2.5-flash\` or \`gemini-1.5-pro\`):\n\n` +
        `Type /cancel to abort.`,
        { parse_mode: 'Markdown' }
      );

    } else if (data === 'menu_add_url') {
      userStates.set(chatId, 'WAITING_FOR_MONITORED_URL');
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(
        chatId,
        `🌐 *Add Monitored Website / PDF URL*\n\n` +
        `Please reply with the web page URL or daily PDF link you want the bot to monitor automatically:\n\n` +
        `Example: \`https://pib.gov.in/PressReleaseDetail.aspx?PRID=12345\`\n\n` +
        `Type /cancel to abort.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );

    } else if (data === 'menu_view_urls') {
      await bot.answerCallbackQuery(query.id);
      const urls = await getMonitoredUrls();
      if (!urls.length) {
        return bot.sendMessage(chatId, '📋 *Monitored URLs*: No URLs are currently saved.\n\nClick *Add Monitored URL* in the dashboard to add one!', { parse_mode: 'Markdown' });
      }
      let text = `📋 *Saved Monitored URLs* (${urls.length}):\n\n`;
      const keyboard = { inline_keyboard: [] };
      urls.forEach((u, idx) => {
        text += `${idx + 1}. *${u.label}*\n🔗 \`${u.url}\`\n\n`;
        keyboard.inline_keyboard.push([
          { text: `❌ Delete #${idx + 1} (${u.label})`, callback_data: `del_url:${u.id}` },
        ]);
      });
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true, reply_markup: keyboard });

    } else if (data.startsWith('del_url:')) {
      const urlId = data.split(':')[1];
      await removeMonitoredUrl(urlId);
      await bot.answerCallbackQuery(query.id, { text: 'URL removed from backend monitoring!' });
      await bot.sendMessage(chatId, '✅ *URL deleted from backend monitoring!*', { parse_mode: 'Markdown' });
      await sendStartHealthDashboard(chatId);

    } else if (data === 'menu_status') {
      await bot.answerCallbackQuery(query.id, { text: 'Re-checking API Health...' });
      await sendStartHealthDashboard(chatId, query.message.message_id);
    }
    } catch (e) {
      // Stale or expired callback queries (common after restarts) — log and ignore
      console.warn('⚠️ callback_query error (likely stale query):', e.message);
    }
  });

  /* ---------- text message handler for interactive prompts ---------- */

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;
    const text = (msg.text || '').trim();

    if (text === '/cancel') {
      if (userStates.has(chatId)) {
        userStates.delete(chatId);
        return bot.sendMessage(chatId, '❌ Update cancelled.');
      }
      return;
    }

    // Check if user uploaded a PDF document
    if (msg.document) {
      const mime = (msg.document.mime_type || '').toLowerCase();
      const fname = (msg.document.file_name || '').toLowerCase();
      if (mime === 'application/pdf' || fname.endsWith('.pdf')) {
        return triggerUploadedPdfProcess(
          msg.document.file_id,
          msg.document.file_name || 'Uploaded_Document.pdf',
          msg.caption || '',
          [chatId]
        );
      }
    }

    const state = userStates.get(chatId);
    if (!state) {
      // Auto-process direct URL pastes
      if (/^https?:\/\//i.test(text)) {
        return triggerUrlProcess(text, [chatId]);
      }
      return;
    }

    if (state === 'WAITING_FOR_GEMINI_KEY') {
      if (text.length < 10) {
        return bot.sendMessage(chatId, '⚠️ Key seems too short. Please try again or type /cancel:');
      }
      await updateEnvKey('GEMINI_API_KEY', text);
      userStates.delete(chatId);
      await bot.sendMessage(chatId, '✅ *Gemini API Key updated successfully!*', { parse_mode: 'Markdown' });
      await sendStartHealthDashboard(chatId);

    } else if (state === 'WAITING_FOR_NOTION_KEY') {
      if (!text.startsWith('secret_') && !text.startsWith('ntn_')) {
        return bot.sendMessage(chatId, '⚠️ Notion API Key should start with `secret_` or `ntn_`. Try again or type /cancel:', { parse_mode: 'Markdown' });
      }
      await updateEnvKey('NOTION_API_KEY', text);
      userStates.delete(chatId);
      await bot.sendMessage(chatId, '✅ *Notion API Secret updated successfully!*', { parse_mode: 'Markdown' });
      await sendStartHealthDashboard(chatId);

    } else if (state === 'WAITING_FOR_NOTION_PAGE') {
      const match = text.match(/([a-f0-9]{32})/i) || text.match(/([a-f0-9-]{36})/i);
      const pageId = match ? match[1].replace(/-/g, '') : text;
      if (!/^[a-f0-9]{32}$/i.test(pageId)) {
        return bot.sendMessage(chatId, '⚠️ Could not extract a valid 32-character Notion Page ID. Try again or type /cancel:');
      }
      await updateEnvKey('NOTION_YEAR_PAGE_ID', pageId);
      userStates.delete(chatId);
      await bot.sendMessage(chatId, `✅ *Notion Page ID updated to*: \`${pageId}\``, { parse_mode: 'Markdown' });
      await sendStartHealthDashboard(chatId);

    } else if (state === 'WAITING_FOR_MODEL') {
      await updateEnvKey('GEMINI_MODEL', text);
      userStates.delete(chatId);
      await bot.sendMessage(chatId, `✅ *Gemini Model updated to*: \`${text}\``, { parse_mode: 'Markdown' });
      await sendStartHealthDashboard(chatId);
      return;

    } else if (state === 'WAITING_FOR_MONITORED_URL') {
      if (!text.startsWith('http://') && !text.startsWith('https://')) {
        return bot.sendMessage(chatId, '⚠️ Please reply with a valid URL starting with `http://` or `https://`. Type /cancel to abort:', { parse_mode: 'Markdown' });
      }
      const res = await addMonitoredUrl(text);
      userStates.delete(chatId);
      if (res.success) {
        await bot.sendMessage(chatId, `✅ *Website URL saved for backend daily monitoring!* (${res.count} URLs total)`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `⚠️ ${res.msg}`, { parse_mode: 'Markdown' });
      }
      await sendStartHealthDashboard(chatId);
      return;
    }
  });

  /* ---------- commands ---------- */

  bot.onText(/^\/(start|status|settings|config)/, (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    sendStartHealthDashboard(msg.chat.id);
  });

  bot.onText(/^\/(date|fetch|pick)/, (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    sendYearPicker(msg.chat.id);
  });

  bot.onText(/^\/setgemini\s+(.+)/i, async (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    const newKey = m[1].trim();
    if (newKey.length < 10) {
      return bot.sendMessage(msg.chat.id, '⚠️ Gemini API key seems too short. Please check and try again.');
    }
    await updateEnvKey('GEMINI_API_KEY', newKey);
    bot.sendMessage(msg.chat.id, '✅ *Gemini API Key updated successfully!*', { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/setnotiontoken\s+(.+)/i, async (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    const newToken = m[1].trim();
    if (!newToken.startsWith('secret_') && !newToken.startsWith('ntn_')) {
      return bot.sendMessage(msg.chat.id, '⚠️ Notion API Key should start with `secret_` or `ntn_`.', { parse_mode: 'Markdown' });
    }
    await updateEnvKey('NOTION_API_KEY', newToken);
    bot.sendMessage(msg.chat.id, '✅ *Notion API Secret updated successfully!*', { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/setnotionpage\s+(.+)/i, async (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    const raw = m[1].trim();
    const match = raw.match(/([a-f0-9]{32})/i) || raw.match(/([a-f0-9-]{36})/i);
    const pageId = match ? match[1].replace(/-/g, '') : raw;
    if (!/^[a-f0-9]{32}$/i.test(pageId)) {
      return bot.sendMessage(msg.chat.id, '⚠️ Could not extract a valid 32-character Notion Page ID.');
    }
    await updateEnvKey('NOTION_YEAR_PAGE_ID', pageId);
    bot.sendMessage(msg.chat.id, `✅ *Notion Page ID updated to*: \`${pageId}\``, { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/setmodel\s+(.+)/i, async (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    const model = m[1].trim();
    await updateEnvKey('GEMINI_MODEL', model);
    bot.sendMessage(msg.chat.id, `✅ *Gemini Model updated to*: \`${model}\``, { parse_mode: 'Markdown' });
  });

  bot.onText(/^\/today/, (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    triggerFetch(undefined, [msg.chat.id]);
  });

  bot.onText(/^\/(autorun|auto)/, (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    triggerGeminiProcess(undefined, [msg.chat.id], { force: true });
  });

  bot.onText(/^\/url\s+(https?:\/\/\S+)/i, (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    triggerUrlProcess(m[1].trim(), [msg.chat.id]);
  });

  bot.onText(/^\/process(?:@\w+)?\s+(\d{4}-\d{2}-\d{2})(\s+force)?/i, (msg, m) => {
    if (!isAllowed(msg.chat.id)) return;
    if (m[2]) {
      triggerGeminiProcess(m[1], [msg.chat.id], { force: true });
    } else {
      triggerFetch(m[1], [msg.chat.id]);
    }
  });

  /* ---------- daily cron ---------- */

  cron.schedule(
    config.cron,
    async () => {
      const targets = [...activeChatIds];
      if (!targets.length) {
        return console.log('⏰ Daily Auto-Run triggered, but no registered Chat IDs found. Send /start to the bot to register.');
      }
      console.log(`⏰ Daily Auto-Run triggered – executing hands-free extraction & Notion sync for ${targets.join(', ')}...`);
      // 1. Process daily PDF
      await triggerGeminiProcess(undefined, targets, { force: true });
      // 2. Process all monitored website/PDF URLs stored in backend
      await processAllMonitoredUrls(notifier(targets));
    },
    { timezone: config.tz }
  );

  bot.on('polling_error', (e) => console.error('Polling error:', e.message));

  // Global safety net — prevents stale Telegram errors from crashing the process
  process.on('unhandledRejection', (reason) => {
    console.warn('⚠️ Unhandled rejection (bot kept running):', reason?.message || reason);
  });

  // HTTP server for cloud platforms (Render, Railway) health checks
  const port = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Daily PDF → Notion Bot is online and healthy!\n');
  }).listen(port, () => {
    console.log(`🌐 Health server listening on port ${port}`);
  });

  console.log(`✅ Bot started. Daily run: ${config.cron} (${config.tz})`);
}
