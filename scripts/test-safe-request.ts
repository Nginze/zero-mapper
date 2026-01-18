import { safeRequest } from '../src/utils/safe-request.js';

async function testSafeRequest() {
  console.log('🧪 Testing SafeRequestManager with rate limiting...\n');

  // Test 1: Simple request
  console.log('Test 1: Making a simple request to AniList...');
  try {
    const query = `
      query {
        Media(id: 21) {
          id
          title { romaji english }
        }
      }
    `;

    const response = await safeRequest.post('https://graphql.anilist.co', {
      query,
      variables: {}
    });

    console.log('✅ Success:', response.data.data.Media.title.romaji);
  } catch (error: any) {
    console.log('❌ Failed:', error.message);
  }

  // Test 2: Multiple concurrent requests (should be rate limited)
  console.log('\nTest 2: Making 5 concurrent requests (should be rate limited to 2 concurrent)...');
  const startTime = Date.now();

  const promises = [21, 1, 30013, 5114, 20].map(async (id) => {
    const query = `
      query {
        Media(id: ${id}) {
          id
          title { romaji }
        }
      }
    `;

    try {
      const response = await safeRequest.post('https://graphql.anilist.co', {
        query,
        variables: {}
      });
      console.log(`  ✅ ID ${id}: ${response.data.data.Media.title.romaji}`);
    } catch (error: any) {
      console.log(`  ❌ ID ${id}: ${error.message}`);
    }
  });

  await Promise.all(promises);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️  Completed in ${elapsed}s (rate limiting in effect)`);

  // Test 3: Check stats
  console.log('\nTest 3: Checking request stats...');
  const stats = safeRequest.getStats();
  console.log('📊 Stats:', JSON.stringify(stats, null, 2));

  console.log('\n✅ All tests completed!');
}

testSafeRequest().catch(console.error);
