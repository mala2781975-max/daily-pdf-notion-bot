/**
 * config.js – Reads and validates environment variables from .env
 *
 * NOTE: This module is imported lazily (only in normal mode, after setup).
 * index.js handles the case where .env is missing / incomplete.
 */
import 'dotenv/config';

const req = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k} in .env – run setup or fill in the value.`);
  return v;
};
const opt = (k, d = '') => process.env[k] || d;
const num = (k, d) => (process.env[k] ? Number(process.env[k]) : d);

export const config = {
  // Telegram
  telegramToken:    req('TELEGRAM_BOT_TOKEN'),
  allowedChatIds:   opt('TELEGRAM_ALLOWED_CHAT_IDS')
    .split(',').map((s) => s.trim()).filter(Boolean),

  // Gemini
  geminiKey:   req('GEMINI_API_KEY'),
  geminiModel: opt('GEMINI_MODEL', 'gemini-2.5-flash'),

  // Notion
  notionToken:      req('NOTION_API_KEY'),
  notionRootPageId: opt('NOTION_ROOT_PAGE_ID'),
  notionYearPageId: opt('NOTION_YEAR_PAGE_ID'),

  // PDF source
  pdfUrlTemplate:  opt('PDF_URL_TEMPLATE'),
  pageUrl:         opt('PAGE_URL'),
  pdfLinkSelector: opt('PDF_LINK_SELECTOR', 'a[href$=".pdf"]'),
  pdfCookie:       opt('PDF_COOKIE'),

  // Behaviour
  batchSize:            num('BATCH_SIZE', 10),
  batchDelayMs:         num('BATCH_DELAY_MS', 4000),
  downloadRetries:      num('DOWNLOAD_RETRIES', 12),
  downloadRetryMinutes: num('DOWNLOAD_RETRY_MINUTES', 15),

  // Scheduling
  cron:            opt('CRON_SCHEDULE', '30 7 * * *'),
  tz:              opt('TIMEZONE', 'Asia/Kolkata'),
  dateTitleFormat: opt('DATE_TITLE_FORMAT', 'DD MMM YYYY'),
};

// Validate that at least one Notion page reference is set
if (!config.notionRootPageId && !config.notionYearPageId) {
  throw new Error('Set NOTION_ROOT_PAGE_ID or NOTION_YEAR_PAGE_ID in .env');
}

// PDF source: custom downloader for tnpscthervupettagam.com (no .env key required)
