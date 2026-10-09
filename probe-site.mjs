// probe-site.mjs – finds the correct AJAX action & PDF URL pattern
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
};

const actions = [
  'get_posts_by_category',
  'get_downloads_by_cat',
  'get_posts',
  'downloads_list',
  'getdownloads',
  'downloads',
  'get_download',
];

console.log('=== Probing AJAX actions ===\n');
for (const action of actions) {
  try {
    const r = await axios.post(AJAX, `action=${action}&lng=english&cat_seo_name=${CAT}&page=1`, { headers, timeout: 8000 });
    const snippet = String(r.data).slice(0, 300).replace(/\s+/g, ' ');
    console.log(`✅ [${action}]:`, snippet, '\n');
  } catch (e) {
    console.log(`❌ [${action}]: ${e.message}\n`);
  }
}

// Also try to guess direct PDF URL from today's date
const today = new Date();
const dd = String(today.getDate()).padStart(2, '0');
const mm = String(today.getMonth() + 1).padStart(2, '0');
const yyyy = today.getFullYear();
const guesses = [
  `${BASE}/uploads/downloads/${yyyy}/${mm}/${dd}-daily-current-affairs.pdf`,
  `${BASE}/uploads/downloads/current-affairs-${dd}-${mm}-${yyyy}.pdf`,
  `${BASE}/uploads/downloads/${yyyy}-${mm}-${dd}-tnpsc-daily-current-affairs.pdf`,
  `${BASE}/assets/downloads/${yyyy}/${mm}/${dd}.pdf`,
];

console.log('\n=== Probing direct PDF URL guesses ===\n');
for (const url of guesses) {
  try {
    const r = await axios.head(url, { headers: { 'Referer': BASE, 'User-Agent': headers['User-Agent'] }, timeout: 8000 });
    console.log(`✅ FOUND: ${url}  (status ${r.status})`);
  } catch (e) {
    console.log(`❌ ${url}: ${e.response?.status || e.message}`);
  }
}
