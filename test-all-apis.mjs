import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { Client as NotionClient } from '@notionhq/client';
import 'dotenv/config';

async function testAll() {
  console.log('--------------------------------------------------');
  console.log('🔍 TESTING ALL INTEGRATED APIS AND SERVICES...');
  console.log('--------------------------------------------------\n');

  // 1. TELEGRAM BOT API
  try {
    const res = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    if (res.data.ok) {
      console.log(`✅ TELEGRAM BOT API: WORKING (Bot Name: @${res.data.result.username})`);
    } else {
      console.log(`❌ TELEGRAM BOT API: FAILED (${res.data.description})`);
    }
  } catch (err) {
    console.log(`❌ TELEGRAM BOT API: FAILED (${err.message})`);
  }

  // 2. GEMINI AI API
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: 'Respond with the word SUCCESS',
    });
    console.log(`✅ GEMINI AI API: WORKING (Response: "${response.text.trim()}")`);
  } catch (err) {
    console.log(`❌ GEMINI AI API: FAILED (${err.message})`);
  }

  // 3. NOTION API & PAGE ACCESS
  try {
    const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
    const page = await notion.pages.retrieve({ page_id: process.env.NOTION_YEAR_PAGE_ID });
    const title = page.properties.title?.title?.[0]?.plain_text || 'Untitled Page';
    console.log(`✅ NOTION API: WORKING (Page Found: "${title}")`);
  } catch (err) {
    console.log(`❌ NOTION API: FAILED (${err.message})`);
  }

  // 4. TNPSC PDF WEBSITE DOWNLOADER
  try {
    const pdfUrl = 'https://www.tnpscthervupettagam.com/assets/home/media/general/doc/26_October_01_-_English.pdf';
    const res = await axios.get(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'arraybuffer'
    });
    const isPdf = Buffer.from(res.data).subarray(0, 4).toString() === '%PDF';
    if (isPdf) {
      console.log(`✅ PDF WEBSITE API: WORKING (Downloaded October PDF, Size: ${Math.round(res.data.length / 1024)} KB)`);
    } else {
      console.log(`❌ PDF WEBSITE API: FAILED (Response was not a valid PDF)`);
    }
  } catch (err) {
    console.log(`❌ PDF WEBSITE API: FAILED (${err.message})`);
  }

  console.log('\n--------------------------------------------------');
}

testAll();
