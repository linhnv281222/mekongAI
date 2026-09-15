# ERP Master Data Integration Guide

## Tổng quan

Hệ thống đã được thiết kế lại để thay thế các knowledge blocks tĩnh bằng master data động từ ERP.

## Các API đã implement

### 1. Material Types (Vật liệu)
**API:** `POST /mdm-v2/api/dynamic-tables/material_type/search`
**Thay thế:** `{{MATERIAL}}` knowledge block
**Trả về:**
- `material_type_code`: Mã vật liệu (VD: SUS, TITAN, NHÔM)
- `material_type_name`: Tên vật liệu
- `density`: Khối lượng riêng (g/cm³)
- `description`: Mô tả
- `is_xlbm`: Cần xử lý bề mặt hay không

### 2. Suppliers (Nhà cung cấp)
**API:** `POST /mdm-v2/api/dynamic-tables/supplier/search`
**Mục đích:** Cung cấp thông tin nhà cung cấp cho trường `nha_cung_cap`
**Trả về:**
- `supplier_code`: Mã nhà cung cấp
- `supplier_name`: Tên nhà cung cấp
- `supplier_type`: Loại nhà cung cấp
- `phone_number`, `email`, `address_1`, `address_2`
- `tax_number`: Mã số thuế

### 3. Shapes (Hình dạng)
**API:** `POST /mdm-v2/api/dynamic-tables/shape/search`
**Thay thế:** `{{SHAPE}}` knowledge block
**Trả về:**
- `shape_name`: Tên hình dạng (VD: Hình tấm, Hình tròn xoay)
- `formula`: Công thức tính thể tích
- `formula_note`: Ghi chú công thức

## Cấu hình

### 1. Environment Variables (.env)
```env
# ERP Master Data API
ERP_BASE_URL=http://dev.apifcim.facenet.vn
ERP_TOKEN=<bearer_token>
```

### 2. Lấy Token
Dùng Keycloak OAuth2:
```bash
POST https://sso.xfactory.vn/auth/realms/fcim_cloud/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

username=admin@vnt.vn
password=Facenet@123
grant_type=password
client_id=fcim_cloud
```

Response:
```json
{
  "access_token": "eyJhbGci...",
  "expires_in": 3600,
  "refresh_token": "..."
}
```

## Testing

### Chạy test
```bash
node test-erp-integration.js
```

### Kết quả mong đợi
```
=== TEST ERP MASTER DATA INTEGRATION ===

1. Testing Material Types API...
✓ Fetched 10 materials
Sample: [
  {
    code: 'SUS',
    name: 'INOX',
    density: 8,
    description: null,
    is_xlbm: false,
    operation_code: null
  },
  ...
]
✓ Generated prompt block (1234 chars)

2. Testing Suppliers API...
✓ Fetched 50 suppliers
...

3. Testing Shapes API...
✓ Fetched 5 shapes
...

=== ALL TESTS PASSED ===
```

## Service API

### getMaterialTypes()
```javascript
const { getMaterialTypes, formatMaterialsForPrompt } = require('./src/services/erpMasterDataService');

const materials = await getMaterialTypes();
// Returns: Array of material objects

const promptBlock = formatMaterialsForPrompt(materials);
// Returns: Formatted string for AI prompt
```

### getSuppliers()
```javascript
const { getSuppliers, formatSuppliersForPrompt } = require('./src/services/erpMasterDataService');

const suppliers = await getSuppliers();
const promptBlock = formatSuppliersForPrompt(suppliers);
```

### getShapes()
```javascript
const { getShapes, formatShapesForPrompt } = require('./src/services/erpMasterDataService');

const shapes = await getShapes();
const promptBlock = formatShapesForPrompt(shapes);
```

## Prompt Template Integration

### Trước (Knowledge blocks tĩnh)
```
{{MATERIAL}}
{{SURFACE}}
{{HEAT_TREAT}}
{{SHAPE}}
{{VNT_KNOWLEDGE}}
{{FEATURES}}
{{MARKET}}
```

### Sau (Dynamic master data)
```javascript
const materials = await erpService.getMaterialTypes();
const suppliers = await erpService.getSuppliers();
const shapes = await erpService.getShapes();

const prompt = basePrompt
  .replace('{{MATERIAL}}', formatMaterialsForPrompt(materials))
  .replace('{{SUPPLIERS}}', formatSuppliersForPrompt(suppliers))
  .replace('{{SHAPE}}', formatShapesForPrompt(shapes));
```

## Next Steps

1. ✅ **DONE:** Implement Material Types, Suppliers, Shapes APIs
2. **TODO:** Implement remaining APIs:
   - Technology Process (Quy trình công nghệ)
   - Operations (Nguyên công)
   - Heat Treatment (Xử lý nhiệt)
   - Surface Treatment (Xử lý bề mặt)
3. **TODO:** Update prompt template to use dynamic data
4. **TODO:** Update drawing analysis pipeline
5. **TODO:** Add caching layer for master data (TTL: 1 hour)

## Error Handling

Service handles errors gracefully:
- Network timeout: 10 seconds
- Retry logic: TBD
- Fallback: Return empty array (will need static fallback later)

## API Rate Limits

- Unknown at this time
- Monitor in production
- Consider caching strategy

## Architecture Notes

- Service file: `src/services/erpMasterDataService.js`
- Test file: `test-erp-integration.js`
- No changes to database schema needed
- Master data fetched on-demand during drawing analysis
