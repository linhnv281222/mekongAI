/**
 * ERP Master Data Service
 * Fetches master data from ERP API and provides caching
 */

import axios from 'axios';

class ErpMasterDataService {
  constructor() {
    this.baseUrl = process.env.ERP_BASE_URL || 'http://dev.apifcim.facenet.vn';
    this.token = null;
    this.tokenExpiry = null;
    this.cache = {
      transport_methods: { data: null, timestamp: 0 },
      materials: { data: null, timestamp: 0 },
      classifications: { data: null, timestamp: 0 },
      customers: { data: null, timestamp: 0 },
      technology_processes: { data: null, timestamp: 0 },
      exchange_rates: { data: null, timestamp: 0 },
      vat_configs: { data: null, timestamp: 0 },
      shapes: { data: null, timestamp: 0 }
    };
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Authenticate with Keycloak and get Bearer token
   */
  async authenticate() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await axios.post(
        'https://sso.xfactory.vn/auth/realms/fcim_cloud/protocol/openid-connect/token',
        new URLSearchParams({
          username: 'admin@vnt.vn',
          password: 'Facenet@123',
          grant_type: 'password',
          client_id: 'fcim_cloud'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.token = response.data.access_token;
      // Token expires in - set expiry to 80% of that time for safety
      const expiresIn = response.data.expires_in || 300;
      this.tokenExpiry = Date.now() + (expiresIn * 0.8 * 1000);

      return this.token;
    } catch (error) {
      console.error('ERP authentication failed:', error.message);
      throw new Error('Failed to authenticate with ERP API');
    }
  }

  /**
   * Make authenticated request to ERP API
   */
  async makeRequest(method, endpoint, data = null) {
    const token = await this.authenticate();
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const config = {
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`ERP API request failed [${method} ${endpoint}]:`, error.message);
      throw error;
    }
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cacheKey) {
    const cached = this.cache[cacheKey];
    if (!cached.data) return false;
    return Date.now() - cached.timestamp < this.cacheDuration;
  }

  /**
   * Get transport methods (Phương thức vận chuyển)
   * POST /mdm-v2/api/dynamic-tables/operation/search
   * Filter: operation_group = "VC"
   */
  async getTransportMethods() {
    if (this.isCacheValid('transport_methods')) {
      return this.cache.transport_methods.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/dynamic-tables/operation/search',
      {
        common: '',
        filter: { operation_group: 'VC' },
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.transport_methods = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.transport_methods.data;
  }

  /**
   * Get materials (Nguyên vật liệu)
   * POST /mdm-v2/api/dynamic-tables/material_type/search
   */
  async getMaterials() {
    if (this.isCacheValid('materials')) {
      return this.cache.materials.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/dynamic-tables/material_type/search',
      {
        common: '',
        filter: {},
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.materials = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.materials.data;
  }

  /**
   * Get quotation classifications (Phân loại báo giá)
   * GET /mdm-v2/api/params/columns/mdm_quotation_sheet/quota_classify
   */
  async getClassifications() {
    if (this.isCacheValid('classifications')) {
      return this.cache.classifications.data;
    }

    const data = await this.makeRequest(
      'GET',
      '/mdm-v2/api/params/columns/mdm_quotation_sheet/quota_classify'
    );

    this.cache.classifications = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.classifications.data;
  }

  /**
   * Get customers (Khách hàng)
   * POST /mdm-v2/api/dynamic-tables/customer/search
   */
  async getCustomers() {
    if (this.isCacheValid('customers')) {
      return this.cache.customers.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/dynamic-tables/customer/search',
      {
        common: '',
        filter: {},
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.customers = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.customers.data;
  }

  /**
   * Get technology processes (Quy trình công nghệ)
   * POST /mdm-v2/api/dynamic-tables/technology_process/search
   */
  async getTechnologyProcesses() {
    if (this.isCacheValid('technology_processes')) {
      return this.cache.technology_processes.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/dynamic-tables/technology_process/search',
      {
        common: '',
        filter: {},
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.technology_processes = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.technology_processes.data;
  }

  /**
   * Get exchange rates (Tỷ giá tiền tệ)
   * GET /qs/api/exchange-rate
   */
  async getExchangeRates() {
    if (this.isCacheValid('exchange_rates')) {
      return this.cache.exchange_rates.data;
    }

    const data = await this.makeRequest(
      'GET',
      '/qs/api/exchange-rate'
    );

    this.cache.exchange_rates = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.exchange_rates.data;
  }

  /**
   * Get VAT configurations (Cấu hình VAT)
   * POST /mdm-v2/api/v2/dynamic-tables/config/search
   */
  async getVatConfigs() {
    if (this.isCacheValid('vat_configs')) {
      return this.cache.vat_configs.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/v2/dynamic-tables/config/search',
      {
        common: '',
        filter: {
          config_code: {
            value: 'VAT_QUOTATION',
            operator: '='
          }
        },
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.vat_configs = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.vat_configs.data;
  }

  /**
   * Get shapes (Hình dạng vật liệu)
   * POST /mdm-v2/api/dynamic-tables/shape/search
   */
  async getShapes() {
    if (this.isCacheValid('shapes')) {
      return this.cache.shapes.data;
    }

    const data = await this.makeRequest(
      'POST',
      '/mdm-v2/api/dynamic-tables/shape/search',
      {
        common: '',
        filter: {},
        pageNumber: 0,
        pageSize: 0,
        searchOptions: [],
        sortOrder: 'DESC',
        sortProperty: 'index'
      }
    );

    this.cache.shapes = {
      data: data.data || data,
      timestamp: Date.now()
    };

    return this.cache.shapes.data;
  }

  /**
   * Fetch all master data at once
   */
  async getAllMasterData() {
    try {
      const [
        transportMethods,
        materials,
        classifications,
        customers,
        technologyProcesses,
        exchangeRates,
        vatConfigs,
        shapes
      ] = await Promise.all([
        this.getTransportMethods(),
        this.getMaterials(),
        this.getClassifications(),
        this.getCustomers(),
        this.getTechnologyProcesses(),
        this.getExchangeRates(),
        this.getVatConfigs(),
        this.getShapes()
      ]);

      return {
        transportMethods,
        materials,
        classifications,
        customers,
        technologyProcesses,
        exchangeRates,
        vatConfigs,
        shapes
      };
    } catch (error) {
      console.error('Failed to fetch all master data:', error);
      throw error;
    }
  }

  /**
   * Clear all caches
   */
  clearCache() {
    Object.keys(this.cache).forEach(key => {
      this.cache[key] = { data: null, timestamp: 0 };
    });
  }
}

export default new ErpMasterDataService();
