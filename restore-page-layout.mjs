import { Client } from '@notionhq/client';
import 'dotenv/config';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const rootId = process.env.NOTION_YEAR_PAGE_ID;

async function restorePageLayout() {
  console.log('🔄 Restoring clean layout for 2026, 2027, and 2028...');

  const r = await notion.blocks.children.list({ block_id: rootId });

  // Delete everything after Schemes divider to rebuild clean section order
  const idx2026 = r.results.findIndex(b => b.type === 'heading_1' && b.heading_1.rich_text[0]?.text.content === '2026');
  if (idx2026 !== -1) {
    const toDelete = r.results.slice(idx2026);
    for (const b of toDelete) {
      try {
        await notion.blocks.delete({ block_id: b.id });
      } catch (e) {}
    }
  }

  // 1. 2026 SECTION
  console.log('📌 Restoring 2026 Section...');
  await notion.blocks.children.append({
    block_id: rootId,
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: '2026' } }] },
      },
      { object: 'block', type: 'divider', divider: {} },
    ],
  });

  const year2026PageIds = [
    '3dabdc8a-71e0-8082-a154-f459616a4249', // Jan
    '3dabdc8a-71e0-8013-8a7e-e3e9a0456090', // Feb
    '3dabdc8a-71e0-80b3-a779-d2d3370d8277', // March
    '3dabdc8a-71e0-808c-9935-def63eec789b', // April
    '3dabdc8a-71e0-80d8-be24-e47f436afa6a', // May
    '3dabdc8a-71e0-804c-8d90-c8a736478c99', // June
    '3dabdc8a-71e0-8061-afeb-fc54447fc221', // July
    '3dabdc8a-71e0-80cb-95cd-c0216a71efa9', // August
    '3dabdc8a-71e0-8071-8173-f9ac2e7bb7e8', // September
    '3dabdc8a-71e0-80e0-80a6-c80424f614ee', // October
    '3dabdc8a-71e0-8066-b7d6-fef4ef83c9c4', // Nov
    '3dabdc8a-71e0-80fc-ad20-fdb5b0838fc9', // December
  ];

  for (const pageId of year2026PageIds) {
    try {
      await notion.blocks.children.append({
        block_id: rootId,
        children: [{ object: 'block', type: 'link_to_page', link_to_page: { page_id: pageId } }],
      });
    } catch (e) {}
  }

  // 2. 2027 SECTION
  console.log('📌 Restoring 2027 Section...');
  await notion.blocks.children.append({
    block_id: rootId,
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: '2027' } }] },
      },
      { object: 'block', type: 'divider', divider: {} },
    ],
  });

  const year2027PageIds = [
    '3dabdc8a-71e0-80f1-af15-de4cd7c36eb9', // Jan
    '3dabdc8a-71e0-800f-91f6-f4ddc51d07da', // Feb
    '3dabdc8a-71e0-8088-af41-f8ef173246db', // March
    '3dabdc8a-71e0-80e9-944a-c6a99da95717', // April
    '3dabdc8a-71e0-800c-90b9-ded1dc2134e6', // May
    '3dabdc8a-71e0-804e-8219-ec2e8eb9fc78', // June
    '3dabdc8a-71e0-8042-8aa8-c8f6b4a57fab', // July
    '3dabdc8a-71e0-800c-a22f-c2b00821c1d1', // August
    '3dabdc8a-71e0-8096-a939-e338dab45323', // September
    '3dabdc8a-71e0-8062-9da2-fed65c782741', // October
    '3dabdc8a-71e0-806b-b32c-efa6f3b780df', // Nov
    '3dabdc8a-71e0-80e8-8a6d-e297fea9b1cf', // December
  ];

  for (const pageId of year2027PageIds) {
    try {
      await notion.blocks.children.append({
        block_id: rootId,
        children: [{ object: 'block', type: 'link_to_page', link_to_page: { page_id: pageId } }],
      });
    } catch (e) {}
  }

  // 3. 2028 SECTION
  console.log('📌 Restoring 2028 Section...');
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

  for (const mName of monthNames) {
    const p = await notion.pages.create({
      parent: { page_id: rootId },
      properties: { title: { title: [{ text: { content: mName } }] } },
    });
    await notion.blocks.children.append({
      block_id: rootId,
      children: [{ object: 'block', type: 'link_to_page', link_to_page: { page_id: p.id } }],
    });
  }

  console.log('✅ ALL YEAR SECTIONS (2026, 2027, 2028) RESTORED CLEANLY!');
}

restorePageLayout().catch(console.error);
