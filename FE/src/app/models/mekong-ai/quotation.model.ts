// Tab 1: Thông tin chung (General Info)
export interface GeneralInfo {
  // Section 1 - Thông tin chung
  type?: string;
  quoting_status?: string;
  format?: string;
  language?: string;
  created_date?: Date | string;
  creator?: string;
  request_time?: Date | string;
  quote_deadline?: Date | string;
  has_transport?: boolean;
  transport_method?: string;
  surface_treatment?: boolean;
  material?: number;
  vat?: boolean;
  discount?: number;
  vat_value?: number;
  quotation_currency?: string;
  exchange_rate?: number;
  lot_number?: number;
  quantity_for_min_price?: number;

  // Section 2 - Thông tin công ty
  company_code?: string;
  company_name?: string;
  company_tax?: string;
  company_email?: string;
  company_contact?: string;
  company_phone?: string;
  company_fax?: string;
  company_address?: string;
  company_language?: string;

  // Section 3 - Thông tin khách hàng
  customer_code?: string;
  customer_name?: string;
  phone_number?: string;
  fax_number?: string;
  staff_in_charge?: string;
  vietnamese_address?: string;
  email?: string;
  tax_code?: string;
  representative?: string;

  // Section 4 - Ghi chú
  unit?: string;
  customer_note?: string;
  internal_note?: string;
  email_content?: string;

  // Legacy fields (kept for backward compatibility)
  quota_code?: string;
  quotation_date?: string;
  delivery_time?: string;
  payment_term?: string;
  validity?: string;
  note?: string;
}

// Tab 2: Nguyên vật liệu (F3 - Materials)
export interface Material {
  // Thông tin cơ bản
  material_group?: string;
  material_code?: string;
  material_name?: string;
  material_price?: number;
  unit_price_min?: number;
  supplier?: string;
  shape?: string;
  density?: number;
  formula?: string;

  // Kích thước nguyên vật liệu
  length?: number;
  width?: number;
  height?: number;
  radius_max?: number;
  radius_min?: number;

  // Kích thước sản phẩm
  product_length?: number;
  product_width?: number;
  product_height?: number;
  product_radius_max?: number;
  product_radius_min?: number;

  // Các trường tính toán
  calculate?: number;
  total_price?: number;
  apply?: number;
  total_apply?: number;
  c_size?: number;
  c_number?: number;
  machining_machine?: number;
  milling_surface?: number;
}

// Biến số gia công đặc biệt (Special machining operations)
export interface SpecialMachining {
  wc?: boolean;
  gf?: boolean;
  lf?: boolean;
  han?: boolean;
  cayren?: boolean;
  dongpin?: boolean;
  tool?: boolean;
}

// Hệ số gia công (Machining coefficients)
export interface MachiningCoefficients {
  size_type?: string;
  size_coefficient?: number;
  mass_type?: string;
  mass_coefficient?: number;
  material_type?: string;
  material_coefficient?: number;
  welding_type?: string;
  welding_coefficient?: number;
  tolerance_type?: string;
  tolerance_coefficient?: number;
  shape_type?: string;
  shape_coefficient?: number;
  length_draw?: number;
  length_input?: number;
  proposed_process?: string;
}

// Tab 3: Khối lượng sản phẩm (F4 - Product Weight)
export interface ProductVolume {
  shape?: string;
  length?: number;
  width?: number;
  height?: number;
  radius_max?: number;
  radius_min?: number;
  density?: number;
  interface?: number;
  volume_child?: number;
  quotation_formula_type?: string;
}

export interface ProductWeightSummary {
  // Khối lượng
  product_weight?: number;
  add?: number;
  except?: number;
  actual_weight?: number;
  calculate_weight?: number;
  rounding_weight?: number;
  coefficient_weight?: number;

  // Thiết diện
  cross_section?: number;
  add_cross_section?: number;
  except_cross_section?: number;
  actual_cross_section?: number;
  calculate_cross_section?: number;
  rounding_cross_section?: number;
  coefficient_cross_section?: number;

  consume?: number;
  note?: string;
}

// Tab 4: Quy trình gia công (F5 - Machining Process)
export interface MachiningProcess {
  operation_code?: string;
  operation_order?: number;
  operation_unit_price?: number;
  machining_time?: number;
  operation_total_price?: number;
  qc?: string;
  employee_code?: string;
  employee_name?: string;
  department?: string;
  employee_group?: string;
  operation_time?: number;
  quotation_process_note?: string;
  technology_process_code?: string;
}

// Complete quotation data
export interface QuotationData {
  general_info: GeneralInfo;
  materials: Material[];
  special_machining: SpecialMachining;
  machining_coefficients: MachiningCoefficients;
  product_volumes: ProductVolume[];
  product_weight_summary: ProductWeightSummary;
  machining_processes: MachiningProcess[];
}
