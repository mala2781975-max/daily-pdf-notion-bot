import { Client } from '@notionhq/client';
import 'dotenv/config';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const rootId = process.env.NOTION_YEAR_PAGE_ID;

async function buildGrid2028() {
  console.log('🧹 Cleaning up old 2028 blocks...');
  const r = await notion.blocks.children.list({ block_id: rootId });
  
  // Find all 2028 heading and subsequent blocks to clean up
  const idx = r.results.findIndex(b => b.type === 'heading_1' && b.heading_1.rich_text[0]?.text.content === '2028');
  if (idx !== -1) {
    const toDelete = r.results.slice(idx);
    for (const b of toDelete) {
      try {
        await notion.blocks.delete({ block_id: b.id });
      } catch (e) {
        console.log('Skipped delete:', b.id, e.message);
      }
    }
  }

  console.log('🏗️ Creating 2028 Heading & Divider...');
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

  const monthRows = [
    ['Jan', 'Feb', 'March', 'April', 'May'],
    ['June', 'July', 'August', 'September', 'October'],
    ['Nov', 'December'],
  ];

  console.log('📊 Building 5-Column Grid Layout for 2028...');

  for (const row of monthRows) {
    const colChildren = row.map(() => ({
      object: 'block',
      type: 'column',
      column: { children: [] },
    }));

    const colListRes = await notion.blocks.children.append({
      block_id: rootId,
      children: [
        {
          object: 'block',
          type: 'column_list',
          column_list: { children: colChildren },
        },
      ],
    });

    const colListId = colListRes.results[0].id;
    const cols = await notion.blocks.children.list({ block_id: colListId });

    for (let i = 0; i < row.length; i++) {
      const colId = cols.results[i].id;
      const monthTitle = row[i];
      await notion.pages.create({
        parent: { page_id: colId },
        properties: { title: { title: [{ text: { content: monthTitle } }] } },
      });
      console.log(`  ✅ Added month page "${monthTitle}" into Column ${i + 1}`);
    }
  }

  console.log('🎉 2028 5-Column Grid Layout Completed Successfully!');
}

buildGrid2028().catch(console.error);
