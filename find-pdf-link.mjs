// find-pdf-link.mjs  
// The site loads PDFs via AJAX POST. We try every known action name
// with the correct headers and print whatever JSON/HTML response we get.
import axios from 'axios';

const BASE = 'https://www.tnpscthervupettagam.com';
const AJAX = `${BASE}/siteajax/ajaxservice`;
const CAT  = 'tnpsc-daily-current-affairs';

const headers = {
  'Referer': `${BASE}/downloads-category/${CAT}`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Origin': BASE,
  'Accept': 'application/json, text/javascript, */*; q=0.01',
};

// From the JS source: action names seen in downloads.js
const payloads = [
  `action=get_posts_by_category&lng=english&cat_seo_name=${CAT}&page=1`,
  `action=get_posts_by_category&lng=tamil&cat_seo_name=${CAT}&page=1`,
  `action=downloads_list&lng=english&cat_seo_name=${CAT}`,
  `action=downloads_count_by_category&lng=english&ca_catid=1`,
  `action=get_posts&cat_seo_name=${CAT}&lng=english`,
];

for (const body of payloads) {
  const r = await axios.post(AJAX, body, { headers, timeout: 10000 }).catch(e => ({ data: e.message }));
  const snippet = String(r.data).trim().slice(0, 500);
  if (snippet && snippet !== 'No direct script access allowed' && snippet.length > 30) {
    console.log(`\n✅ PAYLOAD: ${body.split('&')[0]}`);
    console.log(snippet);
  } else {
    console.log(`❌ ${body.split('&')[0]}: ${snippet.slice(0,60)}`);
  }
}

// Also try fetching the category page with curl-style streaming to get post HTML
console.log('\n=== Trying category listing page (raw HTML) ===');
const page = await axios.get(`${BASE}/downloads-category/${CAT}`, {
  headers: { 'User-Agent': headers['User-Agent'], 'Accept': 'text/html' }, timeout: 15000
});
// Find all PDF links in the HTML
const html = page.data;
const pdfLinks = [...html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi)].map(m => m[1]);
const downloadLinks = [...html.matchAll(/href="([^"]*download[^"]*)"/gi)].map(m => m[1]);
console.log('PDF hrefs found:', pdfLinks.slice(0,5));
console.log('Download hrefs:', downloadLinks.slice(0,5));

// Find any script-injected data
const jsonData = [...html.matchAll(/var\s+\w+\s*=\s*(\{[\s\S]{0,500}?\})/g)].map(m => m[0].slice(0,200));
console.log('\nInline JS data snippets:', jsonData.slice(0,3));
