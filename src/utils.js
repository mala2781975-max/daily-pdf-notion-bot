import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Client as NotionClient } from '@notionhq/client';
import { config } from './config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'YYYY-MM-DD' -> dayjs in configured timezone; no arg -> today */
export function parseDate(str) {
  return str ? dayjs.tz(str, config.tz) : dayjs().tz(config.tz);
}

/** Update a key in .env file and live process.env dynamically */
export async function updateEnvKey(key, value) {
  const envPath = path.resolve(process.cwd(), '.env');
  let raw = '';
  try {
    raw = await fs.readFile(envPath, 'utf8');
  } catch {}

  const lines = raw.split('\n');
  let found = false;
  const newLines = lines.map((line) => {
    const [k] = line.split('=');
    if (k && k.trim() === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    newLines.push(`${key}=${value}`);
  }

  await fs.writeFile(envPath, newLines.join('\n'), 'utf8');
  process.env[key] = value;
  
  // also update config object live
  if (key === 'GEMINI_API_KEY') config.geminiKey = value;
  if (key === 'GEMINI_MODEL') config.geminiModel = value;
  if (key === 'NOTION_API_KEY') config.notionToken = value;
  if (key === 'NOTION_YEAR_PAGE_ID') config.notionYearPageId = value;
  if (key === 'TELEGRAM_BOT_TOKEN') config.telegramToken = value;
}

/** Perform live health check for Gemini AI, Notion Token & Notion Target Page */
export async function checkSystemHealth() {
  const health = {
    gemini: { ok: false, msg: 'Not checked' },
    notionToken: { ok: false, msg: 'Not checked' },
    notionPage: { ok: false, name: 'Unknown', msg: 'Not checked' },
  };

  // 1. Check Gemini API Key
  try {
    const ai = new GoogleGenAI({ apiKey: config.geminiKey });
    await ai.models.generateContent({
      model: config.geminiModel || 'gemini-2.5-flash',
      contents: 'Ping',
    });
    health.gemini = { ok: true, msg: `🟢 Working (${config.geminiModel})` };
  } catch (e) {
    const shortErr = e.message.includes('429') || e.message.includes('RESOURCE_EXHAUSTED')
      ? '🔴 Quota Exceeded (429)'
      : `🔴 Error (${e.message.slice(0, 40)})`;
    health.gemini = { ok: false, msg: shortErr };
  }

  // 2. Check Notion Token & Integrated Page Name
  try {
    const notion = new NotionClient({ auth: config.notionToken });
    const page = await notion.pages.retrieve({ page_id: config.notionYearPageId });
    const title = page.properties.title?.title?.[0]?.plain_text || 'Untitled Page';
    health.notionToken = { ok: true, msg: '🟢 Connected' };
    health.notionPage = { ok: true, name: title, msg: `🟢 Found ("${title}")` };
  } catch (e) {
    health.notionToken = { ok: false, msg: `🔴 Invalid API Key` };
    health.notionPage = { ok: false, name: 'N/A', msg: `🔴 Page Not Found or Access Denied` };
  }

  return health;
}
