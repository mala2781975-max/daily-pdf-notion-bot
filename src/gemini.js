import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config.js';
import { sleep } from './utils.js';

const ai = new GoogleGenAI({ apiKey: config.geminiKey });

const schema = {
  type: Type.OBJECT,
  properties: {
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['heading', 'points'],
      },
    },
    unreadable_pages: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['sections'],
};

const buildPrompt = ({ from, to, total, dateLabel }) => `
You are an expert Current Affairs content creator and rank-holding mentor for Indian Competitive Exams (TNPSC Group 1/2/4, UPSC Civil Services, SSC, State PSCs).
The attached PDF contains pages ${from}-${to} of ${total} of the daily current affairs document dated ${dateLabel}.

YOUR MISSION:
Extract all key news items and transform them into high-yield, memory-friendly, EXAM-FOCUSED study notes.

EXAM NOTE-MAKING RULES:
1. STRICT CURRENT AFFAIRS FOCUS:
   - Extract ONLY Current Affairs, Government Schemes, Polity, Economy, Science & Tech, Environment, International Events, and State News.
   - IGNORE old question papers, syllabus pages, exam timetables, or administrative notices.

2. CATEGORIZATION & HEADINGS:
   - Every section heading MUST start with an exam domain tag in square brackets if applicable, e.g.:
     "[POLITY & GOVERNANCE] ...", "[SCHEMES & PROGRAMMES] ...", "[SCIENCE & TECH] ...", 
     "[ECONOMY & BANKING] ...", "[INTERNATIONAL & SUMMITS] ...", "[ENVIRONMENT] ...",
     "[IMPORTANT DAYS & THEMES] ...", "[APPOINTMENTS & AWARDS] ...", "[TAMIL NADU SPECIFIC / STATE NEWS] ...".
   - Keep headings concise, professional, and clear (no markdown inside heading text).

2. BULLET POINTS FOR EASY MEMORIZATION:
   - Structure each bullet point with high clarity (active voice, short facts, clean bullet items).
   - Capture critical MCQ parameters whenever present:
     • Nodal Ministry / Department / Organization
     • Target Year / Budget Allocation / Launch Date
     • Location / Host City / Country / Headquarters
     • Related Constitutional Articles / Acts / Constitutional Bodies
     • Ranks / Indices / Released By
     • Theme of the Day / Slogan
   - Include a "💡 Exam Key Takeaway" or "📌 Core Fact" line for complex news items.

3. KEYWORD BOLDING FOR FAST SCANNING:
   - Wrap ALL high-yield exam keywords inside **double asterisks** for red bold text rendering in Notion:
     **names**, **schemes**, **ministries**, **places**, **dates**, **numbers**, **percentages**, **acts**, **articles**, **ranks**, **themes**, **awards**, **organizations**.

4. ACCURACY & CLEANLINESS:
   - Do NOT invent facts. Do NOT output marketing ads, page numbers, or header/footer noise.
   - If a page is blank/unreadable/corrupted within pages ${from}-${to}, include its original page number in "unreadable_pages".
   - Return valid JSON matching the schema only.
`;

const FALLBACK_MODELS = [
  config.geminiModel || 'gemini-2.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

export async function analyseBatch(batch, dateLabel) {
  const prompt = buildPrompt({ ...batch, dateLabel });
  let lastErr;

  for (const modelName of FALLBACK_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'application/pdf', data: batch.data.toString('base64') } },
                { text: prompt },
              ],
            },
          ],
          config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
        });
        const text = (res.text || '').replace(/```json|```/g, '').trim();
        const json = JSON.parse(text);
        return {
          sections: (json.sections || []).filter((s) => s.heading && s.points?.length),
          unreadable: json.unreadable_pages || [],
        };
      } catch (e) {
        lastErr = e;
        if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`⚠️ Model ${modelName} quota exhausted (429). Trying fallback model...`);
          break; // Switch to next model immediately on quota limit
        }
        await sleep(attempt * 4000);
      }
    }
  }
  throw new Error(`Gemini quota exhausted for pages ${batch.from}–${batch.to}. All models hit 429. Try again after the quota resets (~24h for free tier).`);
}

export async function analyseText(textContent, dateLabel, sourceUrl = '') {
  const prompt = `
You are an expert Current Affairs content creator and rank-holding mentor for Indian Competitive Exams (TNPSC, UPSC, SSC).
The text below was fetched from the web article URL: ${sourceUrl} (Date: ${dateLabel}).

YOUR MISSION:
Extract all key news items and transform them into high-yield, memory-friendly, EXAM-FOCUSED study notes.

EXAM NOTE-MAKING RULES:
1. STRICT CURRENT AFFAIRS FOCUS:
   - Extract ONLY Current Affairs, Government Schemes, Polity, Economy, Science & Tech, Environment, International Events, and State News.
   - IGNORE old question papers, syllabus pages, exam timetables, or administrative notices.

2. CATEGORIZATION & HEADINGS:
   - Every section heading MUST start with an exam domain tag in square brackets, e.g.:
     "[POLITY & GOVERNANCE] ...", "[SCHEMES & PROGRAMMES] ...", "[SCIENCE & TECH] ...", 
     "[ECONOMY & BANKING] ...", "[INTERNATIONAL & SUMMITS] ...", "[ENVIRONMENT] ...",
     "[IMPORTANT DAYS & THEMES] ...", "[APPOINTMENTS & AWARDS] ...", "[STATE NEWS] ...".

2. BULLET POINTS FOR EASY MEMORIZATION:
   - Capture critical MCQ parameters: Ministry, Budget, Launch Date, Location, Articles, Acts, Ranks.
   - Include a "💡 Exam Key Takeaway" or "📌 Core Fact" line for complex items.

3. KEYWORD BOLDING FOR FAST SCANNING:
   - Wrap ALL high-yield exam keywords in **double asterisks** for red bold text rendering in Notion:
     **names**, **schemes**, **ministries**, **places**, **dates**, **numbers**, **acts**, **articles**, **ranks**, **themes**.

4. Clean up navigation headers, footers, website ads, and unrelated boilerplate text.
Return JSON matching schema only.

WEB ARTICLE CONTENT:
${textContent.slice(0, 30000)}
`;

  let lastErr;
  for (const modelName of FALLBACK_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
        });
        const text = (res.text || '').replace(/```json|```/g, '').trim();
        const json = JSON.parse(text);
        return {
          sections: (json.sections || []).filter((s) => s.heading && s.points?.length),
          unreadable: [],
        };
      } catch (e) {
        lastErr = e;
        if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`⚠️ Model ${modelName} quota exhausted (429). Trying fallback model...`);
          break; // Switch to next model immediately on quota limit
        }
        await sleep(attempt * 4000);
      }
    }
  }
  throw new Error(`Gemini text analysis failed: ${lastErr?.message}`);
}
