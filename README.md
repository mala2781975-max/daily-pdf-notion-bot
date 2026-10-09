# 📄 Daily PDF → Notion Bot

A Telegram bot that automatically:
1. **Downloads** the daily PDF from any website
2. **Splits** it into batches (auto page-count)
3. **Analyses** each batch with Gemini AI (structured notes)
4. **Saves** the result to Notion (Year → Month → Date structure)

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- A Telegram Bot token from [@BotFather](https://t.me/BotFather)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- A Notion integration token + a "Year" page

### 2. Clone & Install
```bash
npm install
```

### 3. Add your Telegram Bot Token
Edit `.env` and paste your token:
```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
```

### 4. Run the bot
```bash
npm start
```

### 5. Open Telegram → send any message to your bot

The bot will guide you through all remaining settings:
- Gemini API Key
- Notion Integration Token
- Notion Year Page ID
- Daily PDF website URL & CSS selector
- Schedule (cron), timezone, batch size, etc.

All values are saved to `.env`. Restart once after setup.

---

## 📌 Commands

| Command | Description |
|---------|-------------|
| `/today` | Download & process today's PDF |
| `/process YYYY-MM-DD` | Process a specific date |
| `/process YYYY-MM-DD force` | Re-process even if already saved |
| `/status` | Show current configuration |
| `/start` | Show help & your chat ID |

---

## 🗂️ Notion Structure

```
Root Page
└── 2026
    ├── January
    │   ├── 01 Jan 2026   ← H1 headings + bullet points
    │   └── 02 Jan 2026
    ├── February
    ...
```

**Format in each date page:**
- `Heading 1` – topic title
- `Bullet points` – key facts with **bold yellow** highlights for important keywords

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | From @BotFather |
| `TELEGRAM_ALLOWED_CHAT_IDS` | ✅ | Comma-separated chat IDs |
| `GEMINI_API_KEY` | ✅ | Google AI Studio |
| `GEMINI_MODEL` | ❌ | Default: `gemini-2.5-flash` |
| `NOTION_API_KEY` | ✅ | Notion integration secret |
| `NOTION_YEAR_PAGE_ID` | ✅ | Your 2026 page ID |
| `NOTION_ROOT_PAGE_ID` | ❌ | Parent of year page (auto-create year) |
| `PDF_URL_TEMPLATE` | ✅* | Direct URL with `{YYYY}/{MM}/{DD}` placeholders |
| `PAGE_URL` | ✅* | Web page URL to scrape for PDF link |
| `PDF_LINK_SELECTOR` | ❌ | CSS selector (default: `a[href$=".pdf"]`) |
| `PDF_COOKIE` | ❌ | Cookie header if site needs login |
| `BATCH_SIZE` | ❌ | Pages per Gemini call (default: 10) |
| `BATCH_DELAY_MS` | ❌ | Delay between batches (default: 4000ms) |
| `DOWNLOAD_RETRIES` | ❌ | Retry count if PDF not ready (default: 12) |
| `DOWNLOAD_RETRY_MINUTES` | ❌ | Minutes between retries (default: 15) |
| `CRON_SCHEDULE` | ❌ | Cron expression (default: `30 7 * * *`) |
| `TIMEZONE` | ❌ | Timezone (default: `Asia/Kolkata`) |
| `DATE_TITLE_FORMAT` | ❌ | Page title format (default: `DD MMM YYYY`) |

*Either `PDF_URL_TEMPLATE` or `PAGE_URL` must be set.
