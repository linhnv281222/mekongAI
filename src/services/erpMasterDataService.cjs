/**
 * ERP Master Data Service
 * Fetches dynamic master data from ERP system to replace static knowledge blocks
 */

const axios = require('axios');

const ERP_BASE_URL = process.env.ERP_BASE_URL || 'http://dev.apifcim.facenet.vn';
const ERP_USERNAME = process.env.ERP_USERNAME || 'admin@vnt.vn';
const ERP_PASSWORD = process.env.ERP_PASSWORD || 'Facenet@123';
const ERP_CLIENT_ID = process.env.ERP_CLIENT_ID || 'fcim_cloud';
const ERP_LOGIN_URL = process.env.ERP_LOGIN_URL || 'https://sso.xfactory.vn/auth/realms/fcim_cloud/protocol/openid-connect/token';

// Token cache
let cachedToken = null;
let tokenExpiry = null;

// Standard search request body template
const createSearchBody = (filter = {}) => ({
  common: '',
  filter,
  pageNumber: 0,
  pageSize: 0,
  searchOptions: [],
  sortOrder: 'DESC',
  sortProperty: 'index'
});

/**
 * Get access token from Keycloak
 */
async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('username', ERP_USERNAME);
    params.append('password', ERP_PASSWORD);
    params.append('grant_type', 'password');
    params.append('client_id', ERP_CLIENT_ID);

    const response = await axios.post(ERP_LOGIN_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);

    console.log('[ERP] Access token obtained, expires in:', response.data.expires_in, 'seconds');
    return cachedToken;
  } catch (error) {
    console.error('[ERP] Failed to get access token:', error.message);
    throw new Error(`ERP authentication failed: ${error.message}`);
  }
}

// Create axios instance with default config
const erpClient = axios.create({
  baseURL: ERP_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Add auth interceptor - get fresh token for each request
erpClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Fetch material types master data
 * Replaces {{MATERIAL}} knowledge block
 */
async function getMaterialTypes() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/material_type/search',
      createSearchBody()
    );

    const materials = response.data?.data || response.data || [];

    // Transform to format expected by prompt
    return materials.map(m => ({
      code: m.material_type_code,
      name: m.material_type_name,
      density: m.density,
      description: m.description,
      is_xlbm: m.is_xlbm,
      operation_code: m.operation_code
    }));
  } catch (error) {
    console.error('[ERP] getMaterialTypes error:', error.message);
    throw new Error(`Failed to fetch material types: ${error.message}`);
  }
}

/**
 * Fetch supplier master data
 * For nhà_cung_cap field
 */
async function getSuppliers() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/supplier/search',
      createSearchBody()
    );

    const suppliers = response.data?.data || response.data || [];

    return suppliers.map(s => ({
      code: s.supplier_code,
      name: s.supplier_name,
      type: s.supplier_type,
      address_1: s.address_1,
      address_2: s.address_2,
      phone: s.phone_number,
      email: s.email,
      tax_number: s.tax_number
    }));
  } catch (error) {
    console.error('[ERP] getSuppliers error:', error.message);
    throw new Error(`Failed to fetch suppliers: ${error.message}`);
  }
}

/**
 * Fetch shape master data
 * Replaces {{SHAPE}} knowledge block
 */
async function getShapes() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/shape/search',
      createSearchBody()
    );

    const shapes = response.data?.data || response.data || [];

    return shapes.map(s => ({
      name: s.shape_name,
      formula: s.formula,
      formula_note: s.formula_note
    }));
  } catch (error) {
    console.error('[ERP] getShapes error:', error.message);
    throw new Error(`Failed to fetch shapes: ${error.message}`);
  }
}

/**
 * Format material types for prompt template
 */
function formatMaterialsForPrompt(materials) {
  const lines = ['# BẢNG VẬT LIỆU (Material Master Data từ ERP)', ''];

  materials.forEach(m => {
    lines.push(`## ${m.code} - ${m.name}`);
    lines.push(`- Khối lượng riêng: ${m.density} g/cm³`);
    if (m.description) {
      lines.push(`- Mô tả: ${m.description}`);
    }
    if (m.is_xlbm) {
      lines.push(`- Cần xử lý bề mặt: Có`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format suppliers for prompt template
 */
function formatSuppliersForPrompt(suppliers) {
  const lines = ['# DANH SÁCH NHÀ CUNG CẤP (Supplier Master Data từ ERP)', ''];

  suppliers.forEach(s => {
    lines.push(`## ${s.code} - ${s.name}`);
    if (s.type) {
      lines.push(`- Loại: ${s.type}`);
    }
    if (s.phone) {
      lines.push(`- SĐT: ${s.phone}`);
    }
    if (s.email) {
      lines.push(`- Email: ${s.email}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format shapes for prompt template
 */
function formatShapesForPrompt(shapes) {
  const lines = ['# BẢNG HÌNH DẠNG (Shape Master Data từ ERP)', ''];

  shapes.forEach(s => {
    lines.push(`## ${s.name}`);
    lines.push(`- Công thức: ${s.formula}`);
    if (s.formula_note) {
      lines.push(`- Ghi chú: ${s.formula_note}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Fetch technology process master data
 * Replaces part of {{VNT_KNOWLEDGE}} knowledge block
 */
async function getTechnologyProcesses() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/technology_process/search',
      createSearchBody()
    );

    const processes = response.data?.data || response.data || [];

    return processes.map(p => ({
      code: p.technology_process_code,
      name: p.technology_process_name,
      description: p.description,
      note: p.note
    }));
  } catch (error) {
    console.error('[ERP] getTechnologyProcesses error:', error.message);
    throw new Error(`Failed to fetch technology processes: ${error.message}`);
  }
}

/**
 * Fetch operations master data (transport, machining, etc)
 * For different operation groups: VC (vận chuyển), GC (gia công), QC, DG, etc
 */
async function getOperations(operationGroup = null) {
  try {
    const filter = operationGroup ? { operation_group: operationGroup } : {};

    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/operation/search',
      createSearchBody(filter)
    );

    const operations = response.data?.data || response.data || [];

    return operations.map(op => ({
      code: op.operation_code,
      name: op.operation_name,
      group: op.operation_group,
      description: op.description,
      part: op.part,
      count_unit: op.count_unit,
      price: op.price,
      price_unit: op.price_u,
      machining_time: op.machining_time,
      machining_time_unit: op.machining_time_u,
      min_price: op.min_price
    }));
  } catch (error) {
    console.error('[ERP] getOperations error:', error.message);
    throw new Error(`Failed to fetch operations: ${error.message}`);
  }
}

/**
 * Get specific material details by code
 */
async function getMaterialByCode(materialCode) {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/material/search',
      createSearchBody({ material_code: materialCode })
    );

    const materials = response.data?.data || response.data || [];
    if (materials.length === 0) return null;

    const m = materials[0];
    return {
      code: m.material_code,
      name: m.material_name,
      type: m.material_type,
      unit: m.unit,
      price: m.price,
      price_unit: m.price_u,
      min_price: m.min_price,
      min_price_unit: m.min_price_u,
      weight: m.weight,
      description: m.description
    };
  } catch (error) {
    console.error('[ERP] getMaterialByCode error:', error.message);
    return null;
  }
}

/**
 * Format technology processes for prompt
 */
function formatTechnologyProcessesForPrompt(processes) {
  const lines = ['# BẢNG QUY TRÌNH CÔNG NGHỆ (Technology Process từ ERP)', ''];

  processes.forEach(p => {
    lines.push(`## ${p.code} - ${p.name}`);
    if (p.description) {
      lines.push(`- Mô tả: ${p.description}`);
    }
    if (p.note) {
      lines.push(`- Ghi chú: ${p.note}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format operations for prompt
 */
function formatOperationsForPrompt(operations, groupName = 'Nguyên công') {
  const lines = [`# BẢNG ${groupName.toUpperCase()} (Operations từ ERP)`, ''];

  // Group by operation_group
  const grouped = {};
  operations.forEach(op => {
    const group = op.group || 'OTHER';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(op);
  });

  Object.keys(grouped).sort().forEach(group => {
    lines.push(`## Nhóm: ${group}`);
    grouped[group].forEach(op => {
      lines.push(`### ${op.code} - ${op.name}`);
      if (op.description) {
        lines.push(`- Mô tả: ${op.description}`);
      }
      if (op.part) {
        lines.push(`- Bộ phận: ${op.part}`);
      }
      if (op.price && op.price_unit) {
        lines.push(`- Đơn giá: ${op.price} ${op.price_unit}`);
      }
      if (op.machining_time && op.machining_time_unit) {
        lines.push(`- Thời gian: ${op.machining_time} ${op.machining_time_unit}`);
      }
      lines.push('');
    });
  });

  return lines.join('\n');
}

/**
 * Fetch customers master data
 */
async function getCustomers() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/customer/search',
      createSearchBody()
    );

    const customers = response.data?.data || response.data || [];

    return customers.map(c => ({
      code: c.customer_code,
      name: c.customer_name,
      type: c.customer_type,
      address_1: c.address_1,
      address_2: c.address_2,
      phone: c.phone_number,
      email: c.email,
      tax_number: c.tax_number,
      representative: c.representative,
      position: c.position
    }));
  } catch (error) {
    console.error('[ERP] getCustomers error:', error.message);
    throw new Error(`Failed to fetch customers: ${error.message}`);
  }
}

/**
 * Fetch exchange rates
 */
async function getExchangeRates() {
  try {
    const response = await erpClient.get('/qs/api/exchange-rate');
    const rawData = response.data || [];

    // Check if the data is wrapped in {data: [...]}
    if (rawData.data && Array.isArray(rawData.data)) {
      return rawData.data;
    }

    // Otherwise return as-is
    return Array.isArray(rawData) ? rawData : [];
  } catch (error) {
    console.error('[ERP] getExchangeRates error:', error.message);
    throw new Error(`Failed to fetch exchange rates: ${error.message}`);
  }
}

/**
 * Fetch configuration values
 * @param {string} configCode - Config code like 'VAT_QUOTATION'
 */
async function getConfig(configCode = null) {
  try {
    const filter = configCode ? { config_code: { value: configCode, operator: '=' } } : {};

    const response = await erpClient.post(
      '/mdm-v2/api/v2/dynamic-tables/config/search',
      createSearchBody(filter)
    );

    const configs = response.data?.data || response.data || [];

    return configs.map(c => ({
      code: c.config_code,
      value: c.config_value,
      description: c.description,
      type: c.config_type
    }));
  } catch (error) {
    console.error('[ERP] getConfig error:', error.message);
    throw new Error(`Failed to fetch config: ${error.message}`);
  }
}

/**
 * Fetch quota classifications
 */
async function getQuotaClassifications() {
  try {
    const response = await erpClient.get(
      '/mdm-v2/api/params/columns/mdm_quotation_sheet/quota_classify'
    );
    const rawData = response.data || [];

    // Check if the data is wrapped in {data: [...]}
    if (rawData.data && Array.isArray(rawData.data)) {
      return rawData.data;
    }

    // Otherwise return as-is
    return Array.isArray(rawData) ? rawData : [];
  } catch (error) {
    console.error('[ERP] getQuotaClassifications error:', error.message);
    throw new Error(`Failed to fetch quota classifications: ${error.message}`);
  }
}

/**
 * Fetch payment terms by language
 * @param {string} languageId - Language ID: 'vi', 'en', 'jp'
 */
async function getTermsByLanguage(languageId = 'vi') {
  try {
    const response = await erpClient.get(
      `/qs/api/terms/get-all-by-language-id?languageId=${languageId}`
    );
    return response.data || [];
  } catch (error) {
    console.error('[ERP] getTermsByLanguage error:', error.message);
    throw new Error(`Failed to fetch terms: ${error.message}`);
  }
}

/**
 * Fetch operations for specific technology process
 * @param {string} technologyProcessCode - Technology process code like 'QT544'
 */
async function getTechnologyProcessOperations(technologyProcessCode) {
  try {
    const response = await erpClient.post(
      '/qs/api/quotation-sheets/get-data-by-dynamic-table?tableName=technology_process_operation',
      { technology_process_code: technologyProcessCode }
    );

    const operations = response.data?.data || response.data || [];

    return operations.map(op => ({
      code: op.operation_code,
      name: op.operation_name,
      order: op.operation_order,
      group: op.operation_group,
      description: op.description,
      machining_time: op.machining_time,
      unit_price: op.operation_unit_price,
      count_unit: op.count_unit,
      min_price: op.min_price
    }));
  } catch (error) {
    console.error('[ERP] getTechnologyProcessOperations error:', error.message);
    throw new Error(`Failed to fetch technology process operations: ${error.message}`);
  }
}

/**
 * Fetch all materials (not filtered by type, since API doesn't support that filter)
 * Note: The /material/search endpoint returns all materials regardless of filter
 * Use this to get all materials, then filter client-side if needed
 */
async function getAllMaterials() {
  try {
    const response = await erpClient.post(
      '/mdm-v2/api/dynamic-tables/material/search',
      createSearchBody()
    );

    const materials = response.data?.data || response.data || [];

    return materials.map(m => ({
      code: m.material_code,
      name: m.material_name,
      type: m.material_type,
      unit: m.unit,
      price: m.price,
      price_unit: m.price_u,
      min_price: m.min_price,
      min_price_unit: m.min_price_u,
      weight: m.weight,
      description: m.description
    }));
  } catch (error) {
    console.error('[ERP] getAllMaterials error:', error.message);
    throw new Error(`Failed to fetch all materials: ${error.message}`);
  }
}

/**
 * Filter materials by type (client-side)
 * @param {Array} materials - Array of material objects
 * @param {string} materialType - Material type to filter by
 */
function filterMaterialsByType(materials, materialType) {
  if (!materialType) return materials;
  return materials.filter(m => m.type === materialType);
}

/**
 * Format customers for prompt
 */
function formatCustomersForPrompt(customers) {
  const lines = ['# DANH SÁCH KHÁCH HÀNG (Customer Master Data từ ERP)', ''];

  customers.forEach(c => {
    lines.push(`## ${c.code} - ${c.name}`);
    if (c.type) {
      lines.push(`- Loại: ${c.type}`);
    }
    if (c.phone) {
      lines.push(`- SĐT: ${c.phone}`);
    }
    if (c.email) {
      lines.push(`- Email: ${c.email}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format exchange rates for prompt
 */
function formatExchangeRatesForPrompt(rates) {
  const lines = ['# TỶ GIÁ TIỀN TỆ (Exchange Rates từ ERP)', ''];

  if (!rates || rates.length === 0) {
    lines.push('_Không có dữ liệu tỷ giá_');
    return lines.join('\n');
  }

  if (Array.isArray(rates)) {
    rates.forEach(rate => {
      const currency = rate.currencyCode || rate.currency || 'Unknown';
      const value = rate.exchangeRate || rate.applicableRate || rate.rate || 'N/A';
      const name = rate.currencyName ? ` (${rate.currencyName})` : '';
      lines.push(`- ${currency}${name}: ${value}`);
    });
  } else if (typeof rates === 'object') {
    Object.keys(rates).forEach(key => {
      lines.push(`- ${key}: ${rates[key]}`);
    });
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format materials by type for prompt
 */
function formatMaterialsByTypeForPrompt(materials, materialType) {
  const lines = [`# DANH SÁCH VẬT LIỆU ${materialType || 'TẤT CẢ'} (Materials từ ERP)`, ''];

  materials.forEach(m => {
    lines.push(`## ${m.code} - ${m.name}`);
    if (m.type) {
      lines.push(`- Loại: ${m.type}`);
    }
    if (m.price && m.price_unit) {
      lines.push(`- Đơn giá: ${m.price} ${m.price_unit}`);
    }
    if (m.min_price && m.min_price_unit) {
      lines.push(`- Giá tối thiểu: ${m.min_price} ${m.min_price_unit}`);
    }
    if (m.unit) {
      lines.push(`- Đơn vị: ${m.unit}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = {
  getMaterialTypes,
  getSuppliers,
  getShapes,
  getTechnologyProcesses,
  getOperations,
  getMaterialByCode,
  getCustomers,
  getExchangeRates,
  getConfig,
  getQuotaClassifications,
  getTermsByLanguage,
  getTechnologyProcessOperations,
  getAllMaterials,
  filterMaterialsByType,
  formatMaterialsForPrompt,
  formatSuppliersForPrompt,
  formatShapesForPrompt,
  formatTechnologyProcessesForPrompt,
  formatOperationsForPrompt,
  formatCustomersForPrompt,
  formatExchangeRatesForPrompt,
  formatMaterialsByTypeForPrompt,
};
