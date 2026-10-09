import { Client } from '@notionhq/client';
import { config } from './config.js';
import { sleep } from './utils.js';

const notion = new Client({ auth: config.notionToken });

/* ---------- finding pages ---------- */

// Recursively collects child pages inside columns or blocks, ignoring archived items safely
async function collectChildPages(blockId) {
  const out = [];
  let cursor;
  try {
    do {
      const r = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
      for (const b of r.results) {
        if (b.type === 'child_page') {
          out.push({ id: b.id, title: b.child_page.title });
        } else if (b.type === 'link_to_page') {
          const pageId = b.link_to_page?.page_id;
          if (pageId) {
            try {
              const page = await notion.pages.retrieve({ page_id: pageId });
              if (!page.archived) {
                const title = page.properties.title?.title?.[0]?.plain_text || 'Untitled';
                out.push({ id: page.id, title });
              }
            } catch (e) {}
          }
        } else if ((b.type === 'column_list' || b.type === 'column') && b.has_children) {
          try {
            const sub = await collectChildPages(b.id);
            out.push(...sub);
          } catch (e) {}
        }
      }
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
  } catch (e) {}
  return out;
}

async function createPage(parentId, title) {
  const p = await notion.pages.create({
    parent: { page_id: parentId },
    properties: { title: { title: [{ text: { content: title } }] } },
  });
  return p.id;
}

/** Scopes month page search under a specific Heading 1 year section (e.g., 2026, 2027, 2028) */
async function collectYearScopedChildPages(rootPageId, yearStr) {
  const blocks = [];
  let cursor;
  try {
    do {
      const r = await notion.blocks.children.list({ block_id: rootPageId, start_cursor: cursor, page_size: 100 });
      blocks.push(...r.results);
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
  } catch (e) {}

  // Find heading_1 matching yearStr (e.g. "2026", "2027", "2028")
  const yearHeadingIndex = blocks.findIndex(
    (b) => b.type === 'heading_1' && b.heading_1.rich_text?.[0]?.plain_text?.trim() === yearStr
  );

  let targetBlocks = [];
  if (yearHeadingIndex !== -1) {
    // Collect blocks between this year's heading_1 and the next heading_1
    const nextHeadingIndex = blocks.findIndex(
      (b, idx) => idx > yearHeadingIndex && b.type === 'heading_1'
    );
    targetBlocks = blocks.slice(
      yearHeadingIndex,
      nextHeadingIndex !== -1 ? nextHeadingIndex : blocks.length
    );
  } else {
    // If year section doesn't exist yet, auto-create Heading 1 + Divider + Native Main Sub-Pages
    await notion.blocks.children.append({
      block_id: rootPageId,
      children: [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: { rich_text: [{ type: 'text', text: { content: yearStr } }] },
        },
        { object: 'block', type: 'divider', divider: {} },
      ],
    });

    const monthNames = [
      'Jan', 'Feb', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'Nov', 'December'
    ];

    for (const mName of monthNames) {
      await createPage(rootPageId, mName);
    }
    return collectChildPages(rootPageId);
  }

  const out = [];
  for (const b of targetBlocks) {
    if (b.type === 'child_page') {
      out.push({ id: b.id, title: b.child_page.title });
    } else if (b.type === 'link_to_page') {
      const pageId = b.link_to_page?.page_id;
      if (pageId) {
        try {
          const page = await notion.pages.retrieve({ page_id: pageId });
          if (!page.archived) {
            const title = page.properties.title?.title?.[0]?.plain_text || 'Untitled';
            out.push({ id: page.id, title });
          }
        } catch (e) {}
      }
    } else if ((b.type === 'column_list' || b.type === 'column') && b.has_children) {
      try {
        const sub = await collectChildPages(b.id);
        out.push(...sub);
      } catch (e) {}
    }
  }
  return out.length ? out : collectChildPages(rootPageId);
}

async function findOrCreateMonth(rootPageId, yearStr, matcher, defaultTitle) {
  const pages = await collectYearScopedChildPages(rootPageId, yearStr);
  const hit = pages.find(matcher);
  return hit ? hit.id : createPage(rootPageId, defaultTitle);
}

async function findOrCreateDate(monthId, matcher, defaultTitle) {
  let pages = [];
  try {
    pages = await collectChildPages(monthId);
  } catch (e) {}
  const hit = pages.find(matcher);
  return hit ? hit.id : createPage(monthId, defaultTitle);
}

/** Year Section (2026/2027/2028) -> Month page (Jan / March / October …) -> Date page */
export async function getOrCreateDatePage(d) {
  const rootId = config.notionYearPageId || config.notionRootPageId;
  const yearStr = d.format('YYYY');
  const m3 = d.format('MMM').toLowerCase(); // jan, feb, mar …

  const monthId = await findOrCreateMonth(
    rootId,
    yearStr,
    (p) => p.title.trim().toLowerCase().startsWith(m3),
    d.format('MMMM')
  );

  const dateTitle = d.format(config.dateTitleFormat);
  const dateId = await findOrCreateDate(monthId, (p) => p.title.trim() === dateTitle, dateTitle);
  return { pageId: dateId, url: `https://www.notion.so/${dateId.replaceAll('-', '')}` };
}

export async function pageHasContent(pageId) {
  try {
    const r = await notion.blocks.children.list({ block_id: pageId, page_size: 1 });
    return r.results.length > 0;
  } catch (e) {
    return false;
  }
}

/* ---------- building blocks ---------- */

// "**bold**" -> bold + red text; splits long text for Notion's 2000-char limit
function richText(md) {
  const parts = [];
  const push = (text, hl) => {
    for (let i = 0; i < text.length; i += 1900) {
      parts.push({
        type: 'text',
        text: { content: text.slice(i, i + 1900) },
        ...(hl ? { annotations: { bold: true, color: 'red' } } : {}),
      });
    }
  };
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(md))) {
    if (m.index > last) push(md.slice(last, m.index), false);
    push(m[1], true);
    last = re.lastIndex;
  }
  if (last < md.length) push(md.slice(last), false);
  return parts.length ? parts : [{ type: 'text', text: { content: ' ' } }];
}

function formatDateForMetadata(d) {
  if (!d) return '';
  const day = d.format('D');
  const month = d.format('MMM').toLowerCase();
  const year = d.format('YYYY');
  return `${day} - ${month} -${year}`;
}

function sectionsToBlocks(sections, meta = {}) {
  const blocks = [];
  const sourceText = meta.source || 'www.tnpscthervupettagam.com';
  const dateText = meta.date ? formatDateForMetadata(meta.date) : '';

  for (const s of sections) {
    // 1. Heading 1
    blocks.push({
      object: 'block',
      type: 'heading_1',
      heading_1: { rich_text: [{ type: 'text', text: { content: s.heading.replaceAll('**', '').slice(0, 1900) } }] },
    });

    // 2. Metadata subtitle: Source : ... Date : ...
    let metaLine = `Source : ${sourceText}`;
    if (dateText) {
      metaLine += `  Date : ${dateText}`;
    }

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: metaLine },
            annotations: { color: 'gray' },
          },
        ],
      },
    });

    // 3. Divider line
    blocks.push({
      object: 'block',
      type: 'divider',
      divider: {},
    });

    // 4. Bulleted List Items
    for (const p of s.points) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: richText(p) },
      });
    }
  }
  return blocks;
}

export async function appendSections(pageId, sections, meta = {}) {
  const blocks = sectionsToBlocks(sections, meta);
  for (let i = 0; i < blocks.length; i += 90) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 90) });
    await sleep(400); // stay under Notion's rate limit
  }
}

