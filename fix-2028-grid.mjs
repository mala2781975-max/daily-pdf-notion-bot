import { Client } from '@notionhq/client';
import 'dotenv/config';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const rootId = process.env.NOTION_YEAR_PAGE_ID;

async function fixGrid2028() {
  console.log('🧹 Cleaning up 2028 section...');
  const r = await notion.blocks.children.list({ block_id: rootId });
  
  const idx = r.results.findIndex(b => b.type === 'heading_1' && b.heading_1.rich_text[0]?.text.content === '2028');
  if (idx !== -1) {
    const toDelete = r.results.slice(idx);
    for (const b of toDelete) {
      try { await notion.blocks.delete({ block_id: b.id }); } catch (e) {}
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

  console.log('📊 Creating 1 Column List with 5 Columns...');
  const colListRes = await notion.blocks.children.append({
    block_id: rootId,
    children: [
      {
        object: 'block',
        type: 'column_list',
        column_list: {
          children: [
            { object: 'block', type: 'column', column: { children: [] } },
            { object: 'block', type: 'column', column: { children: [] } },
            { object: 'block', type: 'column', column: { children: [] } },
            { object: 'block', type: 'column', column: { children: [] } },
            { object: 'block', type: 'column', column: { children: [] } },
          ],
        },
      },
    ],
  });

  const colListId = colListRes.results[0].id;
  const cols = await notion.blocks.children.list({ block_id: colListId });
  const colIds = cols.results.map(c => c.id);

  // Column distribution matching 2026/2027 layout
  const colMonths = [
    ['Jan', 'June', 'Nov'],
    ['Feb', 'July', 'December'],
    ['March', 'August'],
    ['April', 'September'],
    ['May', 'October'],
  ];

  console.log('📄 Creating Month Pages inside each column...');
  for (let c = 0; c < 5; c++) {
    const colId = colIds[c];
    for (const mName of colMonths[c]) {
      const p = await notion.pages.create({
        parent: { page_id: colId },
        properties: { title: { title: [{ text: { content: mName } }] } },
      });
      console.log(`  ✅ Created page "${mName}" inside Column ${c + 1} (${p.id})`);
    }
  }

  console.log('🎉 2028 Native 5-Column Grid Layout Completed Successfully!');
}

fixGrid2028().catch(console.error);
