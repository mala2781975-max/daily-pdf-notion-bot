import { processAllMonitoredUrls } from './src/urlManager.js';

async function main() {
  console.log('🚀 === STARTING MULTI-URL MONITORED TEST ===');
  await processAllMonitoredUrls((msg) => console.log(`[BOT NOTIFY] ${msg}`));
  console.log('✅ === MULTI-URL MONITORED TEST COMPLETED ===');
}

main().catch((err) => {
  console.error('❌ TEST FAILED:', err.message);
  process.exit(1);
});
