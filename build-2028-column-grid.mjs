import { Client } from '@notionhq/client';
import 'dotenv/config';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const rootId = process.env.NOTION_YEAR_PAGE_ID;

const ALL_MONTHS = new Set(['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'Nov', 'December']);

async function buildHorizontalGrid2028() {
  console.log('🧹 Cleaning up existing 2028 section & all month pages...');
  const r = await notion.blocks.children.list({ block_id: rootId });

  // Find index of 2028 heading and delete 2028 section blocks
  const idx = r.results.findIndex(b => b.type === 'heading_1' && b.heading_1.rich_text[0]?.text.content === '2028');
  if (idx !== -1) {
    const toDelete = r.results.slice(idx);
    for (const b of toDelete) {
      try {
        await notion.blocks.delete({ block_id: b.id });
      } catch (e) {}
    }
  }

  // Delete ALL existing month child pages to prevent duplicates on re-runs
  for (const b of r.results) {
    if (b.type === 'child_page' && (ALL_MONTHS.has(b.child_page.title) || b.child_page.title.startsWith('Test'))) {
      try {
        await notion.blocks.delete({ block_id: b.id });
        console.log(`  🗑️ Deleted existing page "${b.child_page.title}"`);
      } catch (e) {}
    }
  }

  console.log('🏗️ Creating Heading 1: 2028 & Divider...');
  await notion.blocks.children.append({
    block_id: rootId,
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: '2028' } }] },
      },
      { object: 'block', type: 'divider', divider: {} },
    ],
  });

  const allMonths = [
    'Jan', 'Feb', 'March', 'April', 'May',
    'June', 'July', 'August', 'September', 'October',
    'Nov', 'December',
  ];

  console.log('📋 Creating Month Pages in Vertical Layout...');

  // Creating child pages — Notion auto-displays them vertically.
  // Do NOT append link_to_page blocks separately or months will appear twice.
  for (const mName of allMonths) {
    const p = await notion.pages.create({
      parent: { page_id: rootId },
      properties: { title: { title: [{ text: { content: mName } }] } },
    });
    console.log(`  📄 Created page "${mName}" (${p.id})`);
  }

  console.log('🎉 2028 Vertical Layout Completed!');
}

buildHorizontalGrid2028().catch(console.error);
