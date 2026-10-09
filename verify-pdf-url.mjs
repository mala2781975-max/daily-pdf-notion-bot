// verify-pdf-url.mjs – confirm which URL pattern gives the real PDF bytes
import axios from 'axios';

const BASE = 'https://www.tnpscthervupettagam.com';
const today = new Date();
const dd   = String(today.getDate()).padStart(2, '0');
const mm   = String(today.getMonth() + 1).padStart(2, '0');
const yyyy = today.getFullYear();

const candidates = [
  `${BASE}/uploads/downloads/${yyyy}/${mm}/${dd}-daily-current-affairs.pdf`,
  `${BASE}/uploads/downloads/current-affairs-${dd}-${mm}-${yyyy}.pdf`,
  `${BASE}/uploads/downloads/${yyyy}-${mm}-${dd}-tnpsc-daily-current-affairs.pdf`,
  `${BASE}/assets/downloads/${yyyy}/${mm}/${dd}.pdf`,
];

const headers = {
  'Referer': BASE,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
};

for (const url of candidates) {
  try {
    const r = await axios.get(url, { headers, responseType: 'arraybuffer', timeout: 30000, maxRedirects: 5 });
    const buf = Buffer.from(r.data);
    const magic = buf.subarray(0, 4).toString();
    const isPdf = magic === '%PDF';
    console.log(`${isPdf ? '✅ REAL PDF' : '⚠️  NOT PDF'}: ${url}`);
    console.log(`   Size: ${(buf.length / 1024).toFixed(1)} KB | magic: ${JSON.stringify(magic)} | Content-Type: ${r.headers['content-type']}\n`);
    if (isPdf) break; // stop at first real one
  } catch (e) {
    console.log(`❌ ${url}: ${e.message}\n`);
  }
}
