/**
 * ERP Knowledge Builder
 * Replaces static knowledge blocks with dynamic ERP master data
 *
 * Usage:
 *   const knowledgeVars = await buildAllKnowledgeBlocks();
 *   const prompt = render(template, knowledgeVars);
 */

const erpService = require('./erpMasterDataService.cjs');

// In-memory cache
let _cache = null;
let _cacheTime = null;
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Build all knowledge block variables from ERP
 * Returns object ready to be used with prompt template
 *
 * @returns {Promise<Object>} { MATERIAL: string, SHAPE: string, ... }
 */
async function buildAllKnowledgeBlocks() {
  // Check cache
  if (_cache && _cacheTime && Date.now() - _cacheTime < CACHE_TTL_MS) {
    console.log('[ERP Knowledge] Using cached data');
    return _cache;
  }

  console.log('[ERP Knowledge] Fetching fresh data from ERP...');

  try {
    // Fetch all master data in parallel
    const [
      materials,
      suppliers,
      shapes,
      processes,
      operations,
      customers,
      exchangeRates,
      allMaterialsList,
      classifications
    ] = await Promise.all([
      erpService.getMaterialTypes(),
      erpService.getSuppliers(),
      erpService.getShapes(),
      erpService.getTechnologyProcesses(),
      erpService.getOperations(),
      erpService.getCustomers(),
      erpService.getExchangeRates(),
      erpService.getAllMaterials(),
      erpService.getQuotaClassifications()
    ]);

    // Filter operations by group
    const surfaceOps = operations.filter(op => op.group === 'XLBM');
    const heatTreatOps = operations.filter(op => op.group === 'HRC');

    // Build knowledge blocks
    const knowledgeBlocks = {
      MATERIAL: erpService.formatMaterialsForPrompt(materials),
      SUPPLIERS: erpService.formatSuppliersForPrompt(suppliers),
      SHAPE: erpService.formatShapesForPrompt(shapes),
      VNT_KNOWLEDGE: buildVntKnowledge(processes, operations),
      SURFACE: erpService.formatOperationsForPrompt(
        surfaceOps,
        'Xử lý bề mặt (XLBM)'
      ),
      HEAT_TREAT: erpService.formatOperationsForPrompt(
        heatTreatOps,
        'Xử lý nhiệt (HRC)'
      ),
      CUSTOMERS: erpService.formatCustomersForPrompt(customers),
      EXCHANGE_RATES: erpService.formatExchangeRatesForPrompt(exchangeRates),
      MARKET: formatClassificationsForPrompt(classifications),

      // Additional data (not used in old template but available)
      _RAW_DATA: {
        materials,
        suppliers,
        shapes,
        processes,
        operations,
        customers,
        exchangeRates,
        allMaterialsList,
        classifications
      }
    };

    // Cache the result
    _cache = knowledgeBlocks;
    _cacheTime = Date.now();

    console.log('[ERP Knowledge] Data fetched and cached successfully');
    return knowledgeBlocks;

  } catch (error) {
    console.error('[ERP Knowledge] Failed to build knowledge blocks:', error.message);

    // Return empty blocks on error (graceful degradation)
    return {
      MATERIAL: '<!-- ERP Error: Could not fetch materials -->',
      SUPPLIERS: '<!-- ERP Error: Could not fetch suppliers -->',
      SHAPE: '<!-- ERP Error: Could not fetch shapes -->',
      VNT_KNOWLEDGE: '<!-- ERP Error: Could not fetch processes/operations -->',
      SURFACE: '<!-- ERP Error: Could not fetch surface treatments -->',
      HEAT_TREAT: '<!-- ERP Error: Could not fetch heat treatments -->',
      CUSTOMERS: '<!-- ERP Error: Could not fetch customers -->',
      EXCHANGE_RATES: '<!-- ERP Error: Could not fetch exchange rates -->',
      MARKET: '<!-- ERP Error: Could not fetch classifications -->',
      _RAW_DATA: null
    };
  }
}

/**
 * Build VNT_KNOWLEDGE block from technology processes and operations
 */
function buildVntKnowledge(processes, operations) {
  const lines = ['# KIẾN THỨC VỀ QUY TRÌNH CÔNG NGHỆ VÀ NGUYÊN CÔNG', ''];

  // Technology Processes
  lines.push('## QUY TRÌNH CÔNG NGHỆ (Technology Process)', '');
  processes.forEach(p => {
    lines.push(`### ${p.code} - ${p.name}`);
    if (p.description) {
      lines.push(`- Mô tả: ${p.description}`);
    }
    if (p.note) {
      lines.push(`- Ghi chú: ${p.note}`);
    }
    lines.push('');
  });

  // Operations grouped by type
  lines.push('## NGUYÊN CÔNG (Operations)', '');

  const grouped = {};
  operations.forEach(op => {
    const group = op.group || 'OTHER';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(op);
  });

  Object.keys(grouped).sort().forEach(group => {
    lines.push(`### Nhóm: ${group}`);
    grouped[group].forEach(op => {
      lines.push(`- **${op.code}**: ${op.name}`);
      if (op.description) {
        lines.push(`  - Mô tả: ${op.description}`);
      }
      if (op.price && op.price_unit) {
        lines.push(`  - Đơn giá: ${op.price} ${op.price_unit}`);
      }
    });
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format classifications (quota_classify) for prompt
 */
function formatClassificationsForPrompt(classifications) {
  const lines = ['# PHÂN LOẠI THỊ TRƯỜNG VÀ NGÀNH HÀNG (Market Classifications)', ''];

  if (!classifications || (!Array.isArray(classifications) && typeof classifications !== 'object')) {
    lines.push('_Không có dữ liệu phân loại_');
    return lines.join('\n');
  }

  // Handle array response
  if (Array.isArray(classifications)) {
    classifications.forEach(item => {
      if (typeof item === 'string') {
        lines.push(`- ${item}`);
      } else if (item.value) {
        const desc = item.description && item.description !== item.value ? ` (${item.description})` : '';
        lines.push(`- ${item.value}${desc}`);
      } else {
        lines.push(`- ${JSON.stringify(item)}`);
      }
    });
  }
  // Handle object response (key-value pairs)
  else if (typeof classifications === 'object') {
    Object.entries(classifications).forEach(([key, value]) => {
      lines.push(`- ${key}: ${value}`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Get specific knowledge block by name
 * @param {string} blockName - 'MATERIAL', 'SHAPE', etc.
 * @returns {Promise<string>}
 */
async function getKnowledgeBlock(blockName) {
  const allBlocks = await buildAllKnowledgeBlocks();
  return allBlocks[blockName] || '';
}

/**
 * Clear cache (force refresh on next call)
 */
function clearCache() {
  _cache = null;
  _cacheTime = null;
  console.log('[ERP Knowledge] Cache cleared');
}

/**
 * Get cache stats
 */
function getCacheStats() {
  return {
    isCached: !!_cache,
    cacheAge: _cacheTime ? Date.now() - _cacheTime : null,
    ttl: CACHE_TTL_MS,
    expiresIn: _cacheTime ? Math.max(0, CACHE_TTL_MS - (Date.now() - _cacheTime)) : null
  };
}

module.exports = {
  buildAllKnowledgeBlocks,
  getKnowledgeBlock,
  clearCache,
  getCacheStats
};
