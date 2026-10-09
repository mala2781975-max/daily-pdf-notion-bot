/**
 * downloader.js – Downloads the daily English PDF from tnpscthervupettagam.com
 *
 * Strategy (two-tier):
 *
 * 1. MONTHLY DETAIL PAGE  (primary)
 *    URL: /downloads-detail/tnpsc-daily-current-affairs-–-{month}-{YYYY}
 *    This page lists every daily PDF link for the month.
 *    We find the English PDF for today's date by matching day number in the link text.
 *
 * 2. DIRECT ASSET URL  (fallback)
 *    Pattern: /assets/home/media/general/doc/{YY}_{Month}_{DD}_-_English[N].pdf
 *    We try suffix variants 1-5 in case there is a numbering scheme.
 *
 * Both approaches are retried because the daily PDF is often uploaded late.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { sleep } from './utils.js';

const BASE = 'https://www.tnpscthervupettagam.com';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: BASE,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/* ─────────────────────────────────────────
   Strategy 1: Monthly detail page scrape
───────────────────────────────────────── */

/**
 * Fetch the monthly bundle page and extract today's English PDF URL.
 * Returns null if the page or link isn't found yet.
 */
async function getPdfUrlFromMonthlyPage(d) {
  // The en-dash (–) in the URL is URL-encoded as %E2%80%93
  const month = d.format('MMMM').toLowerCase();   // "october"
  const year  = d.format('YYYY');                 // "2026"
  const dd    = d.format('DD');                   // "08"
  const day   = String(parseInt(dd, 10));         // "8" (no leading zero in link text)

  const pageUrl =
    `${BASE}/downloads-detail/tnpsc-daily-current-affairs` +
    `\u2013-${month}-${year}?cat=tnpsc-daily-current-affairs`;

  let html;
  try {
    const r = await axios.get(pageUrl, { headers: HEADERS, timeout: 30000 });
    html = r.data;
  } catch {
    return null; // Page not ready yet (500 early in the month)
  }

  const $ = cheerio.load(html);
  let pdfUrl = null;

  // Find an <a href="*.pdf"> whose text contains the day number and "English"
  $('a[href$=".pdf"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    // Match e.g. "October 08 - English" or "08 - English" etc.
    const dayPattern = new RegExp(`\\b${day}\\b`, 'i');
    const isEnglish  = /english/i.test(text);
    if (dayPattern.test(text) && isEnglish) {
      pdfUrl = href.startsWith('http') ? href : new URL(href, BASE).href;
      return false; // break cheerio each
    }
  });

  return pdfUrl;
}

/* ─────────────────────────────────────────
   Strategy 2: Direct asset URL guesses
───────────────────────────────────────── */

async function getPdfUrlDirect(d) {
  const yy    = d.format('YY');        // "26"
  const month = d.format('MMMM');      // "October"
  const dd    = d.format('DD');        // "08"

  // Variations seen in the wild: suffix "", "1", "2" … "_docx"
  const suffixes = ['', '1', '2', '3', '_docx'];

  for (const s of suffixes) {
    const url = `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}_-_English${s}.pdf`;
    try {
      const r = await axios.get(url, {
        headers: { ...HEADERS, Accept: 'application/pdf,*/*' },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const buf = Buffer.from(r.data);
      if (buf.subarray(0, 4).toString() === '%PDF') return { url, buf };
    } catch {
      // not found, try next
    }
  }
  return null;
}

/* ─────────────────────────────────────────
   Core: download once (try both strategies)
───────────────────────────────────────── */

async function downloadOnce(d) {
  // --- Strategy 1: monthly page ---
  const pdfUrl = await getPdfUrlFromMonthlyPage(d);
  if (pdfUrl) {
    const r = await axios.get(pdfUrl, {
      headers: { ...HEADERS, Accept: 'application/pdf,*/*' },
      responseType: 'arraybuffer',
      timeout: 180000,
    });
    const buf = Buffer.from(r.data);
    if (buf.subarray(0, 4).toString() === '%PDF') {
      return { url: pdfUrl, buf };
    }
    throw new Error('Monthly-page link did not return a valid PDF (not uploaded yet?)');
  }

  // --- Strategy 2: direct URL ---
  const direct = await getPdfUrlDirect(d);
  if (direct) return direct;

  throw new Error(
    `PDF not available yet for ${d.format('DD MMM YYYY')}. ` +
    'The site usually uploads it by 08:00–10:00 IST.'
  );
}

/* ─────────────────────────────────────────
   Public: download with retry
───────────────────────────────────────── */

export async function downloadWithRetry(d, notify) {
  await fs.mkdir('downloads', { recursive: true });

  let lastErr;
  for (let i = 1; i <= config.downloadRetries; i++) {
    try {
      const { url, buf } = await downloadOnce(d);
      const file = path.join('downloads', `${d.format('YYYY-MM-DD')}.pdf`);
      await fs.writeFile(file, buf);
      return { file, url, buf };
    } catch (e) {
      lastErr = e;
      if (i === config.downloadRetries) break;
      await notify(
        `⏳ PDF not ready (${e.message}). ` +
        `Retry ${i}/${config.downloadRetries - 1} in ${config.downloadRetryMinutes} min…`
      );
      await sleep(config.downloadRetryMinutes * 60 * 1000);
    }
  }
  throw new Error(`Could not download PDF after ${config.downloadRetries} attempts: ${lastErr?.message}`);
}
