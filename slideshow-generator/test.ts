/**
 * Test Script - Run to verify everything works
 *
 * Usage: npx ts-node test.ts
 */

import { generateTargetAvoid, formatSlideshowPost, formatForDisplay } from './index';

async function testNFL() {
  console.log('='.repeat(50));
  console.log('TESTING NFL - Philadelphia Eagles');
  console.log('='.repeat(50));

  const result = await generateTargetAvoid({
    league: 'NFL',
    teams: ['phi'],
    count: 4,
  });

  console.log('\nGenerated at:', result.generatedAt);
  console.log('Players found:', result.players.length);
  console.log('\n' + formatSlideshowPost(result));
}

async function testNBA() {
  console.log('\n' + '='.repeat(50));
  console.log('TESTING NBA - Atlanta Hawks');
  console.log('='.repeat(50));

  const result = await generateTargetAvoid({
    league: 'NBA',
    teams: ['1'], // Hawks
    count: 4,
  });

  console.log('\nGenerated at:', result.generatedAt);
  console.log('Players found:', result.players.length);
  console.log('\n' + formatSlideshowPost(result));
}

async function testSoccer() {
  console.log('\n' + '='.repeat(50));
  console.log('TESTING SOCCER - Manchester United');
  console.log('='.repeat(50));

  const result = await generateTargetAvoid({
    league: 'SOCCER',
    teams: ['33'], // Man United
    count: 4,
  });

  console.log('\nGenerated at:', result.generatedAt);
  console.log('Players found:', result.players.length);
  console.log('\n' + formatSlideshowPost(result));
}

async function main() {
  console.log('\n🎯 SLIDESHOW GENERATOR - TEST SUITE\n');

  try {
    await testNFL();
    await testNBA();
    await testSoccer();

    console.log('\n' + '='.repeat(50));
    console.log('✅ ALL TESTS COMPLETED');
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
  }
}

main();
