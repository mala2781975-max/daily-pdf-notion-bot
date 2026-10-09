// verify-oct-pdf.mjs – confirm October 2026 URL pattern with today's date
import axios from 'axios';

const BASE = 'https://www.tnpscthervupettagam.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';
const hdrs = { 'User-Agent': UA, 'Referer': BASE };

// Pattern: {YY}_{Month}_{DD}_-_English.pdf
// From Sept examples: 26_September_01_-_English.pdf
// Variations seen: 26_September_04_-_English1.pdf (suffix number for duplicates)
// October 2026
const yy = '26';
const month = 'October';
const dd = '08';

const candidates = [
  `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}_-_English.pdf`,
  `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}_-_English1.pdf`,
  `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}_-_English2.pdf`,
  `${BASE}/assets/home/media/general/doc/${yy}_${month.toLowerCase()}_${dd}_-_English.pdf`,
  `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}-English.pdf`,
  `${BASE}/assets/home/media/general/doc/${yy}_${month}_${dd}_English.pdf`,
];

for (const url of candidates) {
  try {
    const r = await axios.get(url, { headers: hdrs, responseType: 'arraybuffer', timeout: 15000 });
    const buf = Buffer.from(r.data);
    const magic = buf.subarray(0, 4).toString();
    const isPdf = magic === '%PDF';
    console.log(`${isPdf ? '✅ REAL PDF' : '⚠️  NOT PDF'}: ${url.split('/doc/')[1]}`);
    if (isPdf) console.log(`   Size: ${(buf.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.log(`❌ ${url.split('/doc/')[1]}: ${e.response?.status || e.message}`);
  }
}

// Also try the monthly listing page for October (the category listing)
console.log('\n=== Fetching category listing to get October PDFs ===');
const { default: cheerio } = await import('cheerio');
const catR = await axios.get(`${BASE}/downloads-category/tnpsc-daily-current-affairs`, { headers: hdrs, timeout: 15000 });
const $ = cheerio.load(catR.data);
$('a[href$=".pdf"]').each((_, el) => {
  console.log('PDF:', $(el).attr('href'), '|', $(el).text().trim());
});
