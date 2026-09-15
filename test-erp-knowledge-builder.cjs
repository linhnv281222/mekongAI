/**
 * Test ERP Knowledge Builder
 * Run: node test-erp-knowledge-builder.cjs
 */

require('dotenv').config();
const knowledgeBuilder = require('./src/services/erpKnowledgeBuilder.cjs');

async function testKnowledgeBuilder() {
  console.log('=== TEST ERP KNOWLEDGE BUILDER ===\n');

  try {
    // Test 1: Build all knowledge blocks
    console.log('1. Building all knowledge blocks from ERP...');
    const startTime = Date.now();
    const knowledgeBlocks = await knowledgeBuilder.buildAllKnowledgeBlocks();
    const elapsedTime = Date.now() - startTime;

    console.log(`✓ Built all knowledge blocks in ${elapsedTime}ms\n`);

    // Test 2: Check each block
    console.log('2. Checking knowledge blocks...');
    const blockNames = ['MATERIAL', 'SUPPLIERS', 'SHAPE', 'VNT_KNOWLEDGE', 'SURFACE', 'CUSTOMERS', 'EXCHANGE_RATES'];

    blockNames.forEach(name => {
      const content = knowledgeBlocks[name];
      const length = content ? content.length : 0;
      const hasError = content && content.includes('<!-- ERP Error');
      console.log(`  ${name}: ${length} chars ${hasError ? '❌ ERROR' : '✓'}`);
    });

    // Test 3: Show previews
    console.log('\n3. Knowledge block previews:\n');

    console.log('--- MATERIAL Preview (first 300 chars) ---');
    console.log(knowledgeBlocks.MATERIAL.substring(0, 300));
    console.log('...\n');

    console.log('--- SHAPE Preview (first 300 chars) ---');
    console.log(knowledgeBlocks.SHAPE.substring(0, 300));
    console.log('...\n');

    console.log('--- VNT_KNOWLEDGE Preview (first 500 chars) ---');
    console.log(knowledgeBlocks.VNT_KNOWLEDGE.substring(0, 500));
    console.log('...\n');

    // Test 4: Test caching
    console.log('4. Testing cache...');
    console.log('Cache stats before:', knowledgeBuilder.getCacheStats());

    const startTime2 = Date.now();
    const cachedBlocks = await knowledgeBuilder.buildAllKnowledgeBlocks();
    const elapsedTime2 = Date.now() - startTime2;

    console.log(`✓ Second call (cached) took ${elapsedTime2}ms`);
    console.log('Cache stats after:', knowledgeBuilder.getCacheStats());

    // Test 5: Get specific block
    console.log('\n5. Testing getKnowledgeBlock()...');
    const materialBlock = await knowledgeBuilder.getKnowledgeBlock('MATERIAL');
    console.log(`✓ Got MATERIAL block: ${materialBlock.length} chars`);

    // Test 6: Clear cache
    console.log('\n6. Testing cache clear...');
    knowledgeBuilder.clearCache();
    console.log('✓ Cache cleared');
    console.log('Cache stats after clear:', knowledgeBuilder.getCacheStats());

    console.log('\n=== ALL TESTS PASSED ===');

    // Show summary
    console.log('\n📊 SUMMARY:');
    console.log(`- First load time: ${elapsedTime}ms`);
    console.log(`- Cached load time: ${elapsedTime2}ms`);
    console.log(`- Speed improvement: ${Math.round((1 - elapsedTime2/elapsedTime) * 100)}%`);
    console.log(`- Total knowledge blocks: ${blockNames.length}`);
    console.log(`- Total content size: ${blockNames.reduce((sum, name) => sum + (knowledgeBlocks[name]?.length || 0), 0)} chars`);

    // Show raw data stats
    if (knowledgeBlocks._RAW_DATA) {
      console.log('\n📈 RAW DATA STATS:');
      const raw = knowledgeBlocks._RAW_DATA;
      console.log(`- Materials: ${raw.materials?.length || 0}`);
      console.log(`- Suppliers: ${raw.suppliers?.length || 0}`);
      console.log(`- Shapes: ${raw.shapes?.length || 0}`);
      console.log(`- Processes: ${raw.processes?.length || 0}`);
      console.log(`- Operations: ${raw.operations?.length || 0}`);
      console.log(`- Customers: ${raw.customers?.length || 0}`);
      console.log(`- All Materials List: ${raw.allMaterialsList?.length || 0}`);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testKnowledgeBuilder();
