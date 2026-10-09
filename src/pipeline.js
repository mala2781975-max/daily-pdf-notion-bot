import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from './config.js';
import { downloadWithRetry } from './downloader.js';
import { getPageCount, splitIntoBatches } from './pdfSplitter.js';
import { analyseBatch, analyseText } from './gemini.js';
import { getOrCreateDatePage, pageHasContent, appendSections } from './notion.js';
import { parseDate, sleep } from './utils.js';

/** Step 1: Download PDF and send to Telegram chat with inline confirmation buttons */
export async function downloadAndPromptVerification(dateStr, notify, bot, chatId) {
  const d = parseDate(dateStr);
  const label = d.format('DD MMM YYYY');
  const isoDate = d.format('YYYY-MM-DD');

  await notify(`📥 Downloading daily PDF for ${label}…`);
  const { file, buf, url: pdfSourceUrl } = await downloadWithRetry(d, notify);

  const total = await getPageCount(buf);
  const batchesTotal = Math.ceil(total / config.batchSize);

  // Send PDF document with inline verification buttons
  await bot.sendDocument(
    chatId,
    file,
    {
      caption:
        `📄 *Downloaded PDF*: ${label}\n` +
        `📊 *Details*: ${total} pages (${batchesTotal} batches)\n` +
        `🌐 *Source*: ${pdfSourceUrl || 'tnpscthervupettagam.com'}\n\n` +
        `🔍 *Please open and verify the PDF file above.*\n` +
        `Click *Confirm & Process* below to extract content to Notion!`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 Confirm & Process with Gemini', callback_data: `confirm:${isoDate}` },
            { text: '❌ Cancel', callback_data: `cancel:${isoDate}` },
          ],
        ],
      },
    }
  );
}

/** Step 2: Upload verified PDF batch-by-batch to Gemini LLM and save structured notes to Notion */
export async function processGeminiToNotion(dateStr, notify, { force = false } = {}) {
  const d = parseDate(dateStr);
  const label = d.format('DD MMM YYYY');
  const isoDate = d.format('YYYY-MM-DD');
  const filePath = path.join('downloads', `${isoDate}.pdf`);

  let buf;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    const dl = await downloadWithRetry(d, notify);
    buf = dl.buf;
  }

  const total = await getPageCount(buf);
  const batchesTotal = Math.ceil(total / config.batchSize);

  await notify(`🚀 *PDF Verified!* Uploading to Gemini AI (${total} pages → ${batchesTotal} batches)…`);

  const { pageId, url } = await getOrCreateDatePage(d);
  if (!force && (await pageHasContent(pageId))) {
    await notify(`⚠️ Notion page for ${label} already has content.\n${url}`);
    return;
  }

  const failed = [];
  const unreadable = [];
  let n = 0, sectionCount = 0;

  for await (const batch of splitIntoBatches(buf, config.batchSize)) {
    n++;
    await notify(`📦 Processing Gemini Batch ${n}/${batchesTotal} (pages ${batch.from}-${batch.to})…`);
    try {
      const res = await analyseBatch(batch, label);
      unreadable.push(...res.unreadable);
      if (res.sections.length) {
        await appendSections(pageId, res.sections);
        sectionCount += res.sections.length;
      }
    } catch (e) {
      const reason = e.message?.split('\n')[0] || e.message;
      failed.push(`${batch.from}-${batch.to} (${reason})`);
      await notify(`❌ Batch ${batch.from}-${batch.to} failed: ${reason}`);
    }
    await sleep(config.batchDelayMs);
  }

  let msg = `✅ *Notion Sync Complete*: ${label}\n📌 ${sectionCount} topics saved to Notion\n🔗 ${url}`;
  if (unreadable.length) msg += `\n⚠️ Unreadable pages: ${[...new Set(unreadable)].join(', ')}`;
  if (failed.length) msg += `\n⚠️ Failed page ranges: ${failed.join(', ')}`;
  await notify(msg);
}

/** Step 3: Fetch custom URL (PDF or Web Article) and process directly to Notion */
export async function processUrlToNotion(targetUrl, notify, dateStr = undefined) {
  const d = parseDate(dateStr);
  const label = d.format('DD MMM YYYY');

  await notify(`🌐 *Fetching URL*: ${targetUrl}…`);

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  };

  const res = await axios.get(targetUrl, {
    headers,
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const contentType = (res.headers['content-type'] || '').toLowerCase();
  const buf = Buffer.from(res.data);
  const isPdf = targetUrl.toLowerCase().includes('.pdf') || contentType.includes('application/pdf') || buf.subarray(0, 4).toString() === '%PDF';

  const { pageId, url } = await getOrCreateDatePage(d);

  if (isPdf) {
    await notify(`📄 Detected PDF URL. Splitting and uploading to Gemini…`);
    const total = await getPageCount(buf);
    const batchesTotal = Math.ceil(total / config.batchSize);
    let n = 0, sectionCount = 0;

    for await (const batch of splitIntoBatches(buf, config.batchSize)) {
      n++;
      await notify(`🤖 Processing Gemini Batch ${n}/${batchesTotal} (pages ${batch.from}-${batch.to})…`);
      try {
        const out = await analyseBatch(batch, label);
        if (out.sections.length) {
          await appendSections(pageId, out.sections);
          sectionCount += out.sections.length;
        }
      } catch (e) {
        await notify(`❌ Batch error: ${e.message}`);
      }
      await sleep(config.batchDelayMs);
    }
    await notify(`✅ *Notion Sync Complete*: ${label}\n📌 ${sectionCount} topics extracted from PDF URL\n🔗 ${url}`);

  } else {
    await notify(`📰 Detected Web Article URL. Parsing text & extracting exam notes…`);
    const html = buf.toString('utf8');
    const $ = cheerio.load(html);

    // Clean up noise
    $('script, style, nav, footer, iframe, header, form, noscript').remove();
    const bodyText = ($('article').text() || $('main').text() || $('body').text()).replace(/\s+/g, ' ').trim();

    if (!bodyText || bodyText.length < 50) {
      throw new Error('Could not extract readable text from the provided web URL.');
    }

    const out = await analyseText(bodyText, label, targetUrl);
    if (out.sections.length) {
      await appendSections(pageId, out.sections);
    }
    await notify(`✅ *Notion Sync Complete*: ${label}\n📌 ${out.sections.length} topics extracted from Article URL\n🔗 ${url}`);
  }
}

/** Legacy / direct helper */
export async function runPipeline(dateStr, notify, opts = {}) {
  await processGeminiToNotion(dateStr, notify, opts);
}
