/**
 * Run all pending migrations and update prompts
 * Usage: node run-migrations.js
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mechanical_ai',
  user: 'postgres',
  password: 'admin',
});

async function runMigration(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Running migration: ${fileName}`);
  console.log('='.repeat(80));

  try {
    await pool.query(sql);
    console.log(`✓ ${fileName} completed successfully`);
  } catch (error) {
    console.error(`✗ ${fileName} failed:`, error.message);
    throw error;
  }
}

async function updatePrompt(name, description, content, category = 'prompt') {
  // Step 1: Upsert prompt_templates
  const templateSql = `
    INSERT INTO prompt_templates (key, name, description, created_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (key)
    DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      updated_at = NOW()
    RETURNING id;
  `;

  // Step 2: Insert new version into prompt_versions
  const versionSql = `
    INSERT INTO prompt_versions (template_id, version, content, variables, is_active, created_at)
    VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions WHERE template_id = $1), $2, $3, true, NOW())
    RETURNING version;
  `;

  // Step 3: Deactivate old versions
  const deactivateSql = `
    UPDATE prompt_versions
    SET is_active = false
    WHERE template_id = $1 AND version < $2;
  `;

  // Extract variables from content
  const variables = [...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];

  try {
    // Insert/update template
    const templateResult = await pool.query(templateSql, [name, name, description]);
    const templateId = templateResult.rows[0].id;

    // Insert new version - convert variables array to JSON string
    const versionResult = await pool.query(versionSql, [templateId, content, JSON.stringify(variables)]);
    const version = versionResult.rows[0].version;

    // Deactivate old versions
    await pool.query(deactivateSql, [templateId, version]);

    console.log(`✓ Updated prompt: ${name} (v${version})`);
  } catch (error) {
    console.error(`✗ Failed to update prompt ${name}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('DATABASE MIGRATION & PROMPT UPDATE');
  console.log('='.repeat(80));

  try {
    // Test connection
    const testResult = await pool.query('SELECT NOW()');
    console.log('✓ Database connected:', testResult.rows[0].now);

    // Run migrations
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 1: Running migrations');
    console.log('─'.repeat(80));

    const migrationFiles = [
      'migrations/add-erp-fields.sql',
    ];

    for (const file of migrationFiles) {
      const fullPath = path.join(__dirname, file);
      if (fs.existsSync(fullPath)) {
        await runMigration(fullPath);
      } else {
        console.log(`⚠ Skipping ${file} (not found)`);
      }
    }

    // Update prompts
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 2: Updating prompts');
    console.log('─'.repeat(80));

    const promptFiles = [
      {
        name: 'gemini-drawing',
        description: 'Drawing Analysis — Gemini Prompt với ERP fields',
        file: 'src/prompts/defaults/gemini-drawing-full.txt',
        category: 'prompt',
      },
    ];

    for (const prompt of promptFiles) {
      const fullPath = path.join(__dirname, prompt.file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        await updatePrompt(prompt.name, prompt.description, content, prompt.category);
      } else {
        console.log(`⚠ Skipping prompt ${prompt.name} (file not found)`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✓ ALL MIGRATIONS & UPDATES COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('✗ MIGRATION FAILED');
    console.error('='.repeat(80));
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
