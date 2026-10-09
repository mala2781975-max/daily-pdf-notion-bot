/**
 * setup.js – Interactive Telegram setup wizard.
 *
 * If .env is missing or incomplete, the first person to message the bot
 * is walked through a step-by-step prompt to supply every required value.
 * All responses are written to .env so subsequent starts skip setup.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '.env');

/* ---------- helpers ---------- */

/** Read existing .env into a key-value map (best effort). */
async function readEnv() {
  try {
    const raw = await fs.readFile(ENV_PATH, 'utf8');
    const map = {};
    for (const line of raw.split('\n')) {
      const [k, ...rest] = line.split('=');
      if (k && !k.startsWith('#')) map[k.trim()] = rest.join('=').trim();
    }
    return map;
  } catch {
    return {};
  }
}

/** Write a key-value map back to .env, preserving existing structure. */
async function writeEnv(map) {
  const lines = Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  await fs.writeFile(ENV_PATH, lines + '\n', 'utf8');
}

/* ---------- wizard definition ---------- */

const STEPS = [
  {
    key: 'TELEGRAM_BOT_TOKEN',
    label: '🤖 *Telegram Bot Token*',
    hint: 'Get it from @BotFather → /newbot\nPaste the token (looks like `123456:ABC-DEF1234…`):',
    validate: (v) => /^\d+:[A-Za-z0-9_-]{30,}$/.test(v.trim()) || 'That does not look like a valid bot token. Try again:',
  },
  {
    key: 'GEMINI_API_KEY',
    label: '🔑 *Gemini API Key*',
    hint: 'Get it from https://aistudio.google.com/app/apikey\nPaste your key:',
    validate: (v) => v.trim().length > 10 || 'Key seems too short. Try again:',
  },
  {
    key: 'NOTION_API_KEY',
    label: '📓 *Notion Integration Token*',
    hint: 'Create an integration at https://www.notion.so/my-integrations\nPaste the secret (starts with `secret_`):',
    validate: (v) => v.trim().startsWith('secret_') || v.trim().startsWith('ntn_') || 'Should start with `secret_` or `ntn_`. Try again:',
  },
  {
    key: 'NOTION_YEAR_PAGE_ID',
    label: '📅 *Notion Year Page ID*',
    hint:
      'Open your "2026" Notion page → share → copy link.\n' +
      'The page ID is the last 32-char hex string in the URL.\n' +
      'Example: `https://notion.so/My-2026-<PAGE_ID>`\nPaste the page ID (or full URL):',
    transform: (v) => {
      // Accept full URL or bare ID
      const m = v.match(/([a-f0-9]{32})/i) || v.match(/([a-f0-9-]{36})/i);
      return m ? m[1].replace(/-/g, '') : v.trim();
    },
    validate: (v) => /^[a-f0-9]{32}$/i.test(v.replace(/-/g, '')) || 'Could not find a valid 32-char page ID. Try again:',
  },
  // PDF URL is hardcoded for tnpscthervupettagam.com – no step needed
  {
    key: 'TELEGRAM_ALLOWED_CHAT_IDS',
    label: '🔐 *Allowed Telegram Chat IDs*',
    hint:
      'Your Telegram chat ID will be auto-added.\n' +
      'If you want to also allow other users, paste their IDs separated by commas.\n' +
      'Otherwise press Enter / type "skip":',
    optional: true,
    default: '__SELF__', // replaced at runtime with sender's ID
  },
  {
    key: 'GEMINI_MODEL',
    label: '🧠 *Gemini model*',
    hint: 'Default: `gemini-2.5-flash` (recommended).\nPress Enter / type "skip" to use the default:',
    optional: true,
    default: 'gemini-2.5-flash',
  },
  {
    key: 'CRON_SCHEDULE',
    label: '⏰ *Daily auto-run time (cron)*',
    hint: 'Default: `30 7 * * *` = every day at 07:30 IST.\nPress Enter / type "skip" to keep the default:',
    optional: true,
    default: '30 7 * * *',
  },
  {
    key: 'TIMEZONE',
    label: '🌍 *Timezone*',
    hint: 'Default: `Asia/Kolkata`.\nPress Enter / type "skip" to keep the default:',
    optional: true,
    default: 'Asia/Kolkata',
  },
  {
    key: 'BATCH_SIZE',
    label: '📦 *Pages per Gemini batch*',
    hint: 'How many PDF pages to send to Gemini at once.\nDefault: `10` (safe limit). Press Enter / type "skip":',
    optional: true,
    default: '10',
  },
];

/* ---------- main wizard class ---------- */

export class SetupWizard {
  /** @param {object} bot node-telegram-bot-api instance */
  constructor(bot) {
    this.bot = bot;
    this._sessions = new Map(); // chatId -> { stepIndex, env }
  }

  /** Returns true if setup is needed (missing required keys). */
  async isNeeded() {
    const env = await readEnv();
    const required = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'NOTION_API_KEY', 'NOTION_YEAR_PAGE_ID'];
    return required.some((k) => !env[k]);
  }

  /** Start the wizard for a given chatId. */
  async start(chatId) {
    const env = await readEnv();
    this._sessions.set(chatId, { step: 0, env });
    await this._askStep(chatId);
  }

  /** Handle an incoming text message during setup. */
  async handle(msg) {
    const chatId = msg.chat.id;
    const session = this._sessions.get(chatId);
    if (!session) return false; // not in setup

    const text = (msg.text || '').trim();
    const stepDef = STEPS[session.step];

    // Validate or accept optional skip
    let value = text;
    const isSkip = !text || text.toLowerCase() === 'skip';

    if (isSkip && stepDef.optional) {
      value = stepDef.default === '__SELF__' ? String(chatId) : stepDef.default;
    } else if (isSkip && !stepDef.optional) {
      await this.bot.sendMessage(chatId, '⚠️ This field is required. Please provide a value:');
      return true;
    }

    // Transform if needed
    if (stepDef.transform) value = stepDef.transform(value);

    // Validate
    if (stepDef.validate) {
      const result = stepDef.validate(value);
      if (result !== true) {
        await this.bot.sendMessage(chatId, `⚠️ ${result}`, { parse_mode: 'Markdown' });
        return true;
      }
    }

    // Special case: auto-add this chat to allowed IDs
    if (stepDef.key === 'TELEGRAM_ALLOWED_CHAT_IDS') {
      const ids = value === String(chatId) ? [String(chatId)] : [String(chatId), ...value.split(',').map((s) => s.trim())];
      value = [...new Set(ids)].join(',');
    }

    session.env[stepDef.key] = value;
    session.step++;

    if (session.step >= STEPS.length) {
      await this._finish(chatId, session.env);
    } else {
      await this._askStep(chatId);
    }
    return true;
  }

  async _askStep(chatId) {
    const session = this._sessions.get(chatId);
    const step = STEPS[session.step];
    const progress = `(${session.step + 1}/${STEPS.length})`;
    const msg = `${progress} ${step.label}\n\n${step.hint}`;
    await this.bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
  }

  async _finish(chatId, env) {
    this._sessions.delete(chatId);

    // Fill in sensible defaults for keys not asked
    env.BATCH_DELAY_MS   = env.BATCH_DELAY_MS   || '4000';
    env.DOWNLOAD_RETRIES = env.DOWNLOAD_RETRIES || '12';
    env.DOWNLOAD_RETRY_MINUTES = env.DOWNLOAD_RETRY_MINUTES || '15';
    env.DATE_TITLE_FORMAT = env.DATE_TITLE_FORMAT || 'DD MMM YYYY';

    await writeEnv(env);

    await this.bot.sendMessage(
      chatId,
      `✅ *Setup complete!*\n\n` +
        `All values saved to \`.env\`.\n\n` +
        `⚠️ *Please restart the bot* so the new configuration takes effect:\n` +
        "`npm start`\n\n" +
        "After restart:\n" +
        "• `/today` – process today's PDF\n" +
        "• `/process YYYY-MM-DD` – process a specific date\n" +
        `• Auto-run: \`${env.CRON_SCHEDULE}\` (${env.TIMEZONE})`,
      { parse_mode: 'Markdown' }
    );

    console.log('✅ Setup complete. .env written. Restart required.');
    process.exit(0); // clean exit so the user restarts with full config
  }
}
