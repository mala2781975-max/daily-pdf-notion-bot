// inspect-september-bundle.mjs
// Fetch Sept bundle (which worked) to understand the PDF link format
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://www.tnpscthervupettagam.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';
const hdrs = { 'User-Agent': UA, 'Referer': BASE };

// Try the working September 2026 listing to get the actual PDF URL structure
const urls = [
  `${BASE}/downloads-detail/tnpsc-daily-current-affairs-\u2013-september-2026?cat=tnpsc-daily-current-affairs`,
  `${BASE}/downloads-detail/tnpsc-daily-current-affairs-\u2013-september-2026`,
];

for (const url of urls) {
  console.log('\n=== Fetching:', url.slice(0, 100), '===');
  try {
    const r = await axios.get(url, { headers: hdrs, timeout: 20000 });
    const $ = cheerio.load(r.data);

    // Find ALL links
    const links = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href.length > 10 && !href.includes('google') && !href.includes('facebook') && !href.includes('javascript')) {
        links.push({ href, text: text.slice(0, 50) });
      }
    });
    
    console.log('Links (first 20):');
    links.slice(0, 20).forEach(l => console.log(' ', JSON.stringify(l)));
    
    // Look for PDF-specific content
    const pdfLinks = links.filter(l => l.href.includes('.pdf'));
    console.log('\nPDF links:', pdfLinks);
    
    // Look for download buttons
    const dlButtons = links.filter(l =>
      l.text.toLowerCase().includes('download') ||
      l.href.toLowerCase().includes('download')
    );
    console.log('\nDownload buttons:', dlButtons);
    
    // Page content
    const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 1500);
    console.log('\nBody text:', bodyText);
    
  } catch (e) {
    console.log('Error:', e.response?.status, String(e.response?.data || e.message).slice(0, 200));
  }
}

// Also: AJAX POST using the category listing page as referer with session cookie
console.log('\n=== AJAX with session cookie ===');
// First: GET the category page to pick up any session cookies
const catR = await axios.get(`${BASE}/downloads-category/tnpsc-daily-current-affairs`, {
  headers: hdrs,
  timeout: 15000,
  withCredentials: true,
});
const cookies = catR.headers['set-cookie']?.join('; ') || '';
console.log('Cookies set:', cookies.slice(0, 200));

// Now POST AJAX with cookie
const AJAX = `${BASE}/siteajax/ajaxservice`;
const ahdrs = {
  ...hdrs,
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': `${BASE}/downloads-category/tnpsc-daily-current-affairs`,
  'Cookie': cookies,
};
const r2 = await axios.post(AJAX, 'action=get_posts_by_category&lng=english&cat_seo_name=tnpsc-daily-current-affairs&page=1', {
  headers: ahdrs, timeout: 10000
});
const resp = String(r2.data).trim();
if (resp && resp !== 'No direct script access allowed') {
  console.log('✅ AJAX response:', resp.slice(0, 500));
} else {
  console.log('❌ AJAX still blocked:', resp.slice(0, 100));
}
