// find-pdf-from-detail.mjs
// Discovered pattern: /downloads-detail/tnpsc-daily-current-affairs-{month}-{year}
// Let's fetch the current month's listing and find today's PDF
import axios from 'axios';
import * as cheerio from 'cheerio';
import dayjs from 'dayjs';

const BASE = 'https://www.tnpscthervupettagam.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';

const hdrs = {
  'User-Agent': UA,
  'Referer': BASE,
  'Accept': 'text/html,application/xhtml+xml',
};

// Try the monthly listing page
const today = dayjs();
const monthName = today.format('MMMM').toLowerCase();  // october
const year = today.format('YYYY');

// Try different URL formats
const listUrls = [
  `${BASE}/downloads-detail/tnpsc-daily-current-affairs-${monthName}-${year}`,
  `${BASE}/downloads-detail/tnpsc-daily-current-affairs–${monthName}-${year}`,
  `${BASE}/downloads-category/tnpsc-daily-current-affairs`,
];

for (const url of listUrls) {
  console.log(`\n=== Fetching: ${url} ===`);
  try {
    const r = await axios.get(url, { headers: hdrs, timeout: 15000 });
    const $ = cheerio.load(r.data);
    
    // Find all PDF links
    const pdfLinks = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.includes('.pdf') || href.includes('download') || text.toLowerCase().includes('pdf')) {
        pdfLinks.push({ href, text: text.slice(0, 80) });
      }
    });
    
    console.log('PDF/download links found:', pdfLinks.slice(0, 10));
    
    // Also look for any links containing today's date
    const dd = today.format('DD');
    const allLinks = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text();
      if (href.includes(dd) || text.includes(dd)) {
        allLinks.push({ href, text: text.trim().slice(0, 80) });
      }
    });
    console.log(`Links with "${dd}" in them:`, allLinks.slice(0, 5));
    
    // Print first 2000 chars of rendered text
    console.log('\nPage text preview:', $('body').text().replace(/\s+/g, ' ').slice(0, 800));
    
  } catch(e) {
    console.log('Error:', e.response?.status, e.message);
  }
}

// Also check if there is an API endpoint at /api/
console.log('\n=== Checking /api/ endpoints ===');
const apiUrls = [
  `${BASE}/api/downloads?category=tnpsc-daily-current-affairs`,
  `${BASE}/api/posts?category=tnpsc-daily-current-affairs`,
];
for (const url of apiUrls) {
  try {
    const r = await axios.get(url, { headers: hdrs, timeout: 8000 });
    console.log(`✅ ${url}:`, String(r.data).slice(0, 300));
  } catch(e) {
    console.log(`❌ ${url}: ${e.response?.status} ${e.message}`);
  }
}
