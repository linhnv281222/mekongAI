-- Check if CNC Features exists in both tables
SELECT 'prompt_templates' as table_name, id, key, name 
FROM mekongai.prompt_templates 
WHERE key ILIKE '%cnc%' OR key ILIKE '%features%' OR name ILIKE '%CNC%' OR name ILIKE '%features%';

SELECT 'knowledge_blocks' as table_name, id, key, name 
FROM mekongai.knowledge_blocks 
WHERE key ILIKE '%cnc%' OR key ILIKE '%features%' OR name ILIKE '%CNC%' OR name ILIKE '%features%';
