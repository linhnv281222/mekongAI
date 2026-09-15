/**
 * Master Data Controller
 * Exposes ERP master data as REST endpoints
 */

import erpMasterDataService from '../services/erpMasterDataService.js';

/**
 * GET /api/master-data/transport-methods
 * Lấy danh sách phương thức vận chuyển
 */
async function getTransportMethods(req, res) {
  try {
    const data = await erpMasterDataService.getTransportMethods();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching transport methods:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/materials
 * Lấy danh sách nguyên vật liệu
 */
async function getMaterials(req, res) {
  try {
    const data = await erpMasterDataService.getMaterials();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/classifications
 * Lấy danh sách phân loại báo giá
 */
async function getClassifications(req, res) {
  try {
    const data = await erpMasterDataService.getClassifications();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching classifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/customers
 * Lấy danh sách khách hàng
 */
async function getCustomers(req, res) {
  try {
    const data = await erpMasterDataService.getCustomers();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/technology-processes
 * Lấy danh sách quy trình công nghệ
 */
async function getTechnologyProcesses(req, res) {
  try {
    const data = await erpMasterDataService.getTechnologyProcesses();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching technology processes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/exchange-rates
 * Lấy tỷ giá tiền tệ
 */
async function getExchangeRates(req, res) {
  try {
    const data = await erpMasterDataService.getExchangeRates();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/vat-configs
 * Lấy cấu hình VAT
 */
async function getVatConfigs(req, res) {
  try {
    const data = await erpMasterDataService.getVatConfigs();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching VAT configs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/shapes
 * Lấy danh sách hình dạng vật liệu
 */
async function getShapes(req, res) {
  try {
    const data = await erpMasterDataService.getShapes();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching shapes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/master-data/all
 * Lấy tất cả master data cùng lúc
 */
async function getAllMasterData(req, res) {
  try {
    const data = await erpMasterDataService.getAllMasterData();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching all master data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/master-data/clear-cache
 * Xóa cache của tất cả master data
 */
function clearCache(req, res) {
  try {
    erpMasterDataService.clearCache();
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

export default {
  getTransportMethods,
  getMaterials,
  getClassifications,
  getCustomers,
  getTechnologyProcesses,
  getExchangeRates,
  getVatConfigs,
  getShapes,
  getAllMasterData,
  clearCache
};
