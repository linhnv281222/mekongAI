/**
 * Update prompts to use ERP master data
 * Usage: node scripts/update-prompts-with-erp.cjs
 */

require('dotenv').config();
const { Pool } = require('pg');
const erpKnowledgeBuilder = require('../src/services/erpKnowledgeBuilder.cjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updatePrompts() {
  try {
    console.log('🔄 Updating prompts to use ERP master data...\n');

    // Step 1: Fetch ERP knowledge blocks
    console.log('1. Fetching ERP master data...');
    const erpBlocks = await erpKnowledgeBuilder.buildAllKnowledgeBlocks();
    console.log('✓ ERP data fetched\n');

    // Step 2: Get gemini-drawing prompt
    console.log('2. Getting gemini-drawing prompt from database...');
    const templateResult = await pool.query(`
      SELECT id FROM prompt_templates WHERE key = 'gemini-drawing'
    `);

    if (templateResult.rows.length === 0) {
      console.error('❌ Template gemini-drawing not found');
      process.exit(1);
    }

    const templateId = templateResult.rows[0].id;

    const versionResult = await pool.query(`
      SELECT version, content, variables
      FROM prompt_versions
      WHERE template_id = $1 AND is_active = true
      ORDER BY version DESC
      LIMIT 1
    `, [templateId]);

    if (versionResult.rows.length === 0) {
      console.error('❌ No active version found');
      process.exit(1);
    }

    const currentVersion = versionResult.rows[0];
    console.log(`✓ Current version: ${currentVersion.version}`);
    console.log(`✓ Variables: ${JSON.stringify(currentVersion.variables)}\n`);

    // Step 3: Replace static knowledge blocks with ERP data
    console.log('3. Replacing knowledge blocks with ERP data...');

    let newContent = currentVersion.content;

    // Check what knowledge blocks are actually in the prompt
    const hasVNTKnowledge = newContent.includes('{{VNT_KNOWLEDGE}}');
    const hasMaterial = newContent.includes('{{MATERIAL}}');
    const hasShape = newContent.includes('{{SHAPE}}');
    const hasSurface = newContent.includes('{{SURFACE}}');
    const hasHeatTreat = newContent.includes('{{HEAT_TREAT}}');

    console.log(`   Checking variables:`);
    console.log(`   - VNT_KNOWLEDGE: ${hasVNTKnowledge ? '✓ Found' : '✗ Not found'}`);
    console.log(`   - MATERIAL: ${hasMaterial ? '✓ Found' : '✗ Not found'}`);
    console.log(`   - SHAPE: ${hasShape ? '✓ Found' : '✗ Not found'}`);
    console.log(`   - SURFACE: ${hasSurface ? '✓ Found' : '✗ Not found'}`);
    console.log(`   - HEAT_TREAT: ${hasHeatTreat ? '✓ Found' : '✗ Not found'}`);
    console.log();

    // Note: We DON'T replace the variables themselves
    // We need to keep {{VARIABLE}} placeholders for runtime replacement
    // But we need to ensure the system uses erpKnowledgeBuilder when rendering

    console.log('⚠️  IMPORTANT: Prompt variables are kept as placeholders.');
    console.log('   The actual replacement happens at runtime via erpKnowledgeBuilder.\n');

    // Step 4: Update knowledge blocks in database
    console.log('4. Updating knowledge_blocks table with ERP instructions...');

    // Update vnt-materials
    await pool.query(`
      UPDATE knowledge_blocks
      SET content = $1, format = 'text', updated_at = NOW()
      WHERE key = 'vnt-materials'
    `, [`<!-- DYNAMIC: Loaded from ERP via erpKnowledgeBuilder.getKnowledgeBlock('MATERIAL') -->
${erpBlocks.MATERIAL}`]);
    console.log('   ✓ Updated vnt-materials');

    // Update vnt-shapes
    await pool.query(`
      UPDATE knowledge_blocks
      SET content = $1, format = 'text', updated_at = NOW()
      WHERE key = 'vnt-shapes'
    `, [`<!-- DYNAMIC: Loaded from ERP via erpKnowledgeBuilder.getKnowledgeBlock('SHAPE') -->
${erpBlocks.SHAPE}`]);
    console.log('   ✓ Updated vnt-shapes');

    // Update vnt-surface
    await pool.query(`
      UPDATE knowledge_blocks
      SET content = $1, format = 'text', updated_at = NOW()
      WHERE key = 'vnt-surface'
    `, [`<!-- DYNAMIC: Loaded from ERP via erpKnowledgeBuilder.getKnowledgeBlock('SURFACE') -->
${erpBlocks.SURFACE}`]);
    console.log('   ✓ Updated vnt-surface');

    // Update vnt-knowledge
    await pool.query(`
      UPDATE knowledge_blocks
      SET content = $1, format = 'text', updated_at = NOW()
      WHERE key = 'vnt-knowledge'
    `, [`<!-- DYNAMIC: Loaded from ERP via erpKnowledgeBuilder.getKnowledgeBlock('VNT_KNOWLEDGE') -->
${erpBlocks.VNT_KNOWLEDGE}`]);
    console.log('   ✓ Updated vnt-knowledge');

    console.log('\n✅ Database updated with ERP data');
    console.log('\n📊 Summary:');
    console.log(`   - MATERIAL: ${erpBlocks.MATERIAL.length} chars`);
    console.log(`   - SHAPE: ${erpBlocks.SHAPE.length} chars`);
    console.log(`   - SURFACE: ${erpBlocks.SURFACE.length} chars`);
    console.log(`   - VNT_KNOWLEDGE: ${erpBlocks.VNT_KNOWLEDGE.length} chars`);

    console.log('\n🔧 Next steps:');
    console.log('   1. Update promptStore.js to use erpKnowledgeBuilder');
    console.log('   2. Test drawing analysis with new dynamic data');
    console.log('   3. Set up cron job to refresh ERP data periodically');

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updatePrompts();
