/**
 * urlManager.js – Persistent storage & automated execution for monitored website URLs.
 */
import fs from 'fs/promises';
import path from 'path';
import { processUrlToNotion } from './pipeline.js';

const DATA_DIR = path.resolve('data');
const FILE_PATH = path.join(DATA_DIR, 'monitored_urls.json');

/** Ensure data directory and file exist */
async function init() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE_PATH);
  } catch {
    await fs.writeFile(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
  }
}

/** Get list of saved monitored URLs */
export async function getMonitoredUrls() {
  await init();
  try {
    const raw = await fs.readFile(FILE_PATH, 'utf8');
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

/** Add a new URL to backend storage */
export async function addMonitoredUrl(url, label = '') {
  await init();
  const urls = await getMonitoredUrls();
  const cleanUrl = url.trim();
  if (urls.some((item) => item.url === cleanUrl)) {
    return { success: false, msg: 'URL is already being monitored!' };
  }
  urls.push({
    id: Date.now().toString(36),
    url: cleanUrl,
    label: label.trim() || new URL(cleanUrl).hostname,
    addedAt: new Date().toISOString(),
  });
  await fs.writeFile(FILE_PATH, JSON.stringify(urls, null, 2), 'utf8');
  return { success: true, count: urls.length };
}

/** Remove a monitored URL by ID or URL string */
export async function removeMonitoredUrl(target) {
  await init();
  let urls = await getMonitoredUrls();
  const origLen = urls.length;
  urls = urls.filter((item) => item.id !== target && item.url !== target);
  if (urls.length === origLen) return false;
  await fs.writeFile(FILE_PATH, JSON.stringify(urls, null, 2), 'utf8');
  return true;
}

/** Process all saved monitored URLs during daily cron or manual trigger */
export async function processAllMonitoredUrls(notify) {
  const urls = await getMonitoredUrls();
  if (!urls.length) return;

  await notify(`🌐 *Processing ${urls.length} Saved Monitored Website URLs…*`);
  for (const item of urls) {
    try {
      await notify(`🌐 Processing monitored URL: *${item.label}*\n🔗 ${item.url}`);
      await processUrlToNotion(item.url, notify);
    } catch (e) {
      await notify(`❌ Monitored URL failed (*${item.label}*): ${e.message}`);
    }
  }
}
