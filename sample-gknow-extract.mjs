import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

async function sampleExtract() {
  const url = 'https://gknow.in/durga-e-auto-scheme-2026-1300-pink-electric-autos/';
  console.log(`Fetching article: ${url}...`);
  const res = await axios.get(url, { headers: HEADERS });
  const $ = cheerio.load(res.data);
  $('script, style, nav, footer, iframe, header, form, noscript').remove();
  const text = ($('article').text() || $('main').text() || $('body').text()).replace(/\s+/g, ' ').trim();
  console.log('\n--- EXTRACTED ARTICLE TEXT FROM G KNOW ---');
  console.log(text.slice(0, 1000));
}

sampleExtract();
