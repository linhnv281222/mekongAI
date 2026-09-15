/**
 * Get all prompts from database
 * Usage: node scripts/get-prompts-from-db.cjs
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getPrompts() {
  try {
    console.log('📋 Fetching prompts from database...\n');

    // Get all prompt templates
    const templates = await pool.query(`
      SELECT pt.id, pt.key, pt.name, pt.description
      FROM prompt_templates pt
      ORDER BY pt.key
    `);

    console.log(`Found ${templates.rows.length} prompt templates:\n`);

    for (const template of templates.rows) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 Template: ${template.key}`);
      console.log(`   Name: ${template.name}`);
      console.log(`   Description: ${template.description}`);

      // Get active version
      const version = await pool.query(`
        SELECT pv.version, pv.content, pv.variables, pv.created_at
        FROM prompt_versions pv
        WHERE pv.template_id = $1 AND pv.is_active = true
        ORDER BY pv.version DESC
        LIMIT 1
      `, [template.id]);

      if (version.rows.length > 0) {
        const v = version.rows[0];
        console.log(`   Version: ${v.version}`);
        console.log(`   Variables: ${JSON.stringify(v.variables)}`);
        console.log(`   Content length: ${v.content.length} chars`);
        console.log(`   Content preview (first 200 chars):`);
        console.log(`   ${v.content.substring(0, 200).replace(/\n/g, '\n   ')}...`);
      } else {
        console.log(`   ⚠️  No active version`);
      }
      console.log();
    }

    // Get knowledge blocks
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📚 Knowledge Blocks:\n`);

    const knowledge = await pool.query(`
      SELECT key, name, description, format, content
      FROM knowledge_blocks
      ORDER BY key
    `);

    console.log(`Found ${knowledge.rows.length} knowledge blocks:\n`);

    for (const kb of knowledge.rows) {
      console.log(`- ${kb.key}: ${kb.name}`);
      console.log(`  Format: ${kb.format}`);
      console.log(`  Content length: ${kb.content?.length || 0} chars`);
      if (kb.content) {
        console.log(`  Preview: ${kb.content.substring(0, 100).replace(/\n/g, ' ')}...`);
      }
      console.log();
    }

    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

getPrompts();
