// find-sitemap-pdfs.mjs
// Crawl sitemap / robots to find actual PDF page URLs
import axios from 'axios';

const BASE = 'https://www.tnpscthervupettagam.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0';

async function get(url) {
  const r = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 15000 });
  return r.data;
}

// 1. Check sitemap
console.log('=== Checking sitemap.xml ===');
try {
  const sitemap = await get(`${BASE}/sitemap.xml`);
  const pdfUrls = [...String(sitemap).matchAll(/<loc>([^<]+\.pdf[^<]*)<\/loc>/gi)].map(m => m[1]);
  const dlUrls  = [...String(sitemap).matchAll(/<loc>([^<]*download[^<]*)<\/loc>/gi)].map(m => m[1]);
  console.log('PDF locs:', pdfUrls.slice(0,5));
  console.log('Download locs:', dlUrls.slice(0,5));
  console.log('Total sitemap entries:', String(sitemap).match(/<loc>/g)?.length || 0);
} catch(e) { console.log('sitemap error:', e.message); }

// 2. Check robots.txt for hints
console.log('\n=== robots.txt ===');
try {
  const robots = await get(`${BASE}/robots.txt`);
  console.log(String(robots).slice(0, 500));
} catch(e) { console.log('robots error:', e.message); }

// 3. Try the category API with different parameter names
console.log('\n=== Trying AJAX with different params ===');
const AJAX = `${BASE}/siteajax/ajaxservice`;
const hdrs = {
  'Referer': `${BASE}/downloads-category/tnpsc-daily-current-affairs`,
  'User-Agent': UA,
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
};
const bodies = [
  'action=get_posts_by_category&lng=english&cat_id=1&page=1',
  'action=get_posts_by_category&lng=english&cat_id=2&page=1',
  'action=get_posts_by_category&lng=english&cat_id=3&page=1',
  'action=get_posts_by_category&lng=english&cat_id=4&page=1',
  'action=get_posts_by_category&lng=english&cat_id=5&page=1',
];
for (const body of bodies) {
  const r = await axios.post(AJAX, body, { headers: hdrs, timeout: 8000 }).catch(e => ({ data: e.message }));
  const s = String(r.data).trim();
  if (s && s !== 'No direct script access allowed') {
    console.log(`\n✅ ${body.split('&cat_id=')[1]?.split('&')[0]} →`, s.slice(0, 400));
  }
}
