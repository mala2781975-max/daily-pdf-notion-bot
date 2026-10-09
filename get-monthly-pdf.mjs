// get-monthly-pdf.mjs
// The site publishes MONTHLY bundles. Each month has a "Continue Reading" page.
// URL: /downloads-detail/tnpsc-daily-current-affairs-–-{Month}-{YYYY}?cat=tnpsc-daily-current-affairs
import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';

const BASE = 'https://www.tnpscthervupettagam.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';
const hdrs = { 'User-Agent': UA, 'Referer': BASE };

const today = dayjs();
const month = today.format('MMMM'); // October
const year  = today.format('YYYY'); // 2026

// Exact pattern found in page HTML (note the special dash –)
const detailUrl = `${BASE}/downloads-detail/tnpsc-daily-current-affairs-\u2013-${month.toLowerCase()}-${year}?cat=tnpsc-daily-current-affairs`;

console.log('Fetching:', detailUrl);
const r = await axios.get(detailUrl, { headers: hdrs, timeout: 20000 });
const $ = cheerio.load(r.data);

console.log('\n=== All links on detail page ===');
$('a').each((_, el) => {
  const href = $(el).attr('href') || '';
  const text = $(el).text().trim();
  if (href.length > 5) {
    console.log({ href: href.slice(0, 120), text: text.slice(0, 60) });
  }
});

console.log('\n=== iframes / embeds ===');
$('iframe, embed, object').each((_, el) => {
  console.log({ tag: el.name, src: $(el).attr('src') || $(el).attr('data') });
});

console.log('\n=== Page text (first 1000) ===');
console.log($('body').text().replace(/\s+/g, ' ').slice(0, 1000));
