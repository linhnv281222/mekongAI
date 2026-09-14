const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin',
  database: 'mechanical_ai'
});

async function getCurrentPrompt() {
  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Get current active prompt
    const result = await client.query(`
      SELECT pt.name, pv.version, pv.content
      FROM prompt_templates pt
      JOIN prompt_versions pv ON pt.id = pv.template_id
      WHERE pt.name = 'gemini-drawing' AND pv.is_active = true
      ORDER BY pv.version DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('✗ No active prompt found');
      return;
    }

    const row = result.rows[0];
    console.log(`\n✓ Found active prompt: ${row.name} v${row.version}`);
    console.log(`Content length: ${row.content.length} characters\n`);

    // Save to file
    const outputPath = path.join(__dirname, 'current-prompt.txt');
    fs.writeFileSync(outputPath, row.content, 'utf8');
    console.log(`✓ Saved to: ${outputPath}`);

  } catch (err) {
    console.error('✗ Error:', err.message);
  } finally {
    await client.end();
  }
}

getCurrentPrompt();
