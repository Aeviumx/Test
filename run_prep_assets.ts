import { generateTestAssets } from './scripts/prepareTestAssets.ts';

async function main() {
  await generateTestAssets(process.cwd());
  console.log('--- ALL TEST ASSETS PREPARED ---');
}

main().catch((err) => {
  console.error('Error preparing test assets:', err);
  process.exit(1);
});
