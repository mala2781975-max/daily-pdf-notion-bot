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

## 🚀 Deploy to Render (24/7 Hosting)

You can host this bot on **[Render.com](https://render.com)** for free so it runs continuously 24/7.

### Step-by-Step Render Setup:

1. **Sign in to Render**: Go to [dashboard.render.com](https://dashboard.render.com) and log in with your GitHub account (`mala2781975-max`).
2. **Create New Web Service**:
   - Click **New +** → **Web Service** (or **Blueprint**).
   - Connect your GitHub repository: `mala2781975-max/daily-pdf-notion-bot`.
3. **Configure Settings**:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. **Add Environment Variables** (under *Environment* tab):
   - `TELEGRAM_BOT_TOKEN`: `<Your bot token from @BotFather>`
   - `GEMINI_API_KEY`: `<Your Gemini API key>`
   - `NOTION_API_KEY`: `<Your Notion secret starting with secret_ or ntn_>`
   - `NOTION_YEAR_PAGE_ID`: `<Your Notion Page ID>`
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `TELEGRAM_ALLOWED_CHAT_IDS`: `<Your Telegram Chat ID>`
   - `TZ`: `Asia/Kolkata`
5. **Click Deploy Web Service**: Render will build and launch your bot! It includes an HTTP health check on port `3000` to stay active and healthy.

---

## 📌 Commands

| Command / Action | Description |
|------------------|-------------|
| 📤 **Upload PDF Attachment** | Attach/send any PDF file directly into chat for instant AI extraction to Notion |
| `/today` | Download & process today's PDF |
| `/date` | Open interactive Date Picker (Year/Month/Day) |
| `/url <link>` | Process custom PDF URL, web article, or news page directly |
| `/process YYYY-MM-DD` | Process a specific date |
| `/process YYYY-MM-DD force` | Re-process even if already saved |
| `/status` / `/start` | Show interactive dashboard & health status |

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
