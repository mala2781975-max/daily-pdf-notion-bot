import { Client } from '@notionhq/client';
import 'dotenv/config';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const rootId = process.env.NOTION_YEAR_PAGE_ID;

async function clean2028Section() {
  console.log('🧹 Cleaning up 2028 section completely...');
  const r = await notion.blocks.children.list({ block_id: rootId });
  
  const idx = r.results.findIndex(b => b.type === 'heading_1' && b.heading_1.rich_text[0]?.text.content === '2028');
  if (idx !== -1) {
    const toDelete = r.results.slice(idx);
    for (const b of toDelete) {
      try {
        await notion.blocks.delete({ block_id: b.id });
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

  const monthNames = [
    'Jan', 'Feb', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'Nov', 'December'
  ];

  console.log('📄 Creating 12 Native Main Sub-Pages for 2028...');
  for (const mName of monthNames) {
    const p = await notion.pages.create({
      parent: { page_id: rootId },
      properties: { title: { title: [{ text: { content: mName } }] } },
    });
    console.log(`  ✅ Created Native Main Page "${mName}" (${p.id})`);
  }

  console.log('🎉 2028 Main Sub-Pages Cleaned & Re-created Successfully!');
}

clean2028Section().catch(console.error);
