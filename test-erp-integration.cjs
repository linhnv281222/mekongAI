/**
 * Test ERP Master Data Integration
 * Run: node test-erp-integration.js
 */

require('dotenv').config();
const erpService = require('./src/services/erpMasterDataService.cjs');

async function testERPIntegration() {
  console.log('=== TEST ERP MASTER DATA INTEGRATION (COMPLETE) ===\n');

  try {
    // Test 1: Material Types
    console.log('1. Testing Material Types API...');
    const materials = await erpService.getMaterialTypes();
    console.log(`✓ Fetched ${materials.length} materials`);
    console.log('Sample:', materials.slice(0, 2));

    const materialPrompt = erpService.formatMaterialsForPrompt(materials);
    console.log(`✓ Generated prompt block (${materialPrompt.length} chars)\n`);

    // Test 2: Suppliers
    console.log('2. Testing Suppliers API...');
    const suppliers = await erpService.getSuppliers();
    console.log(`✓ Fetched ${suppliers.length} suppliers`);
    console.log('Sample:', suppliers.slice(0, 2));

    const supplierPrompt = erpService.formatSuppliersForPrompt(suppliers);
    console.log(`✓ Generated prompt block (${supplierPrompt.length} chars)\n`);

    // Test 3: Shapes
    console.log('3. Testing Shapes API...');
    const shapes = await erpService.getShapes();
    console.log(`✓ Fetched ${shapes.length} shapes`);
    console.log('Sample:', shapes.slice(0, 2));

    const shapePrompt = erpService.formatShapesForPrompt(shapes);
    console.log(`✓ Generated prompt block (${shapePrompt.length} chars)\n`);

    // Test 4: Technology Processes
    console.log('4. Testing Technology Processes API...');
    const processes = await erpService.getTechnologyProcesses();
    console.log(`✓ Fetched ${processes.length} technology processes`);
    console.log('Sample:', processes.slice(0, 2));

    const processPrompt = erpService.formatTechnologyProcessesForPrompt(processes);
    console.log(`✓ Generated prompt block (${processPrompt.length} chars)\n`);

    // Test 5: Operations
    console.log('5. Testing Operations API...');
    const operations = await erpService.getOperations();
    console.log(`✓ Fetched ${operations.length} operations`);
    console.log('Sample:', operations.slice(0, 2));

    const operationPrompt = erpService.formatOperationsForPrompt(operations);
    console.log(`✓ Generated prompt block (${operationPrompt.length} chars)\n`);

    // Test 6: Operations by group (Transport)
    console.log('6. Testing Operations by Group (VC - Vận chuyển)...');
    const transportOps = await erpService.getOperations('VC');
    console.log(`✓ Fetched ${transportOps.length} transport operations`);
    console.log('Sample:', transportOps.slice(0, 1));

    // Test 7: Material by code
    console.log('\n7. Testing Get Material by Code (SUS304-CN)...');
    const material = await erpService.getMaterialByCode('SUS304-CN');
    if (material) {
      console.log('✓ Found material:', material);
    } else {
      console.log('⚠ Material not found (might not exist in ERP)');
    }

    // Test 8: Customers
    console.log('\n8. Testing Customers API...');
    const customers = await erpService.getCustomers();
    console.log(`✓ Fetched ${customers.length} customers`);
    console.log('Sample:', customers.slice(0, 2));

    const customerPrompt = erpService.formatCustomersForPrompt(customers);
    console.log(`✓ Generated prompt block (${customerPrompt.length} chars)\n`);

    // Test 9: Exchange Rates
    console.log('9. Testing Exchange Rates API...');
    const exchangeRates = await erpService.getExchangeRates();
    console.log('✓ Fetched exchange rates:', exchangeRates);

    const ratePrompt = erpService.formatExchangeRatesForPrompt(exchangeRates);
    console.log(`✓ Generated prompt block (${ratePrompt.length} chars)\n`);

    // Test 10: Config (VAT)
    console.log('10. Testing Config API (VAT_QUOTATION)...');
    const vatConfig = await erpService.getConfig('VAT_QUOTATION');
    console.log(`✓ Fetched ${vatConfig.length} config items`);
    if (vatConfig.length > 0) {
      console.log('Sample:', vatConfig[0]);
    }

    // Test 11: Quota Classifications
    console.log('\n11. Testing Quota Classifications API...');
    const classifications = await erpService.getQuotaClassifications();
    console.log('✓ Fetched classifications:', classifications);

    // Test 12: Payment Terms (Vietnamese)
    console.log('\n12. Testing Payment Terms API (Vietnamese)...');
    const termsVi = await erpService.getTermsByLanguage('vi');
    console.log(`✓ Fetched ${Array.isArray(termsVi) ? termsVi.length : 'N/A'} Vietnamese terms`);
    if (Array.isArray(termsVi) && termsVi.length > 0) {
      console.log('Sample:', termsVi.slice(0, 2));
    }

    // Test 13: Technology Process Operations
    console.log('\n13. Testing Technology Process Operations (QT544)...');
    try {
      const processOps = await erpService.getTechnologyProcessOperations('QT544');
      console.log(`✓ Fetched ${processOps.length} operations for QT544`);
      if (processOps.length > 0) {
        console.log('Sample:', processOps.slice(0, 2));
      }
    } catch (error) {
      console.log('⚠ No operations found for QT544 or API error:', error.message);
    }

    // Test 14: Materials by Type (INOX)
    console.log('\n14. Testing Materials by Type (INOX)...');
    const allMaterials = await erpService.getAllMaterials();
    console.log(`✓ Fetched ${allMaterials.length} total materials`);

    const inoxMaterials = erpService.filterMaterialsByType(allMaterials, 'INOX');
    console.log(`✓ Filtered ${inoxMaterials.length} INOX materials`);
    console.log('Sample:', inoxMaterials.slice(0, 2));

    const inoxPrompt = erpService.formatMaterialsByTypeForPrompt(inoxMaterials, 'INOX');
    console.log(`✓ Generated prompt block (${inoxPrompt.length} chars)\n`);

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('\n📊 SUMMARY:');
    console.log(`- Material Types: ${materials.length}`);
    console.log(`- Suppliers: ${suppliers.length}`);
    console.log(`- Shapes: ${shapes.length}`);
    console.log(`- Technology Processes: ${processes.length}`);
    console.log(`- Operations: ${operations.length}`);
    console.log(`- Customers: ${customers.length}`);
    console.log(`- All Materials: ${allMaterials.length}`);
    console.log(`- INOX Materials: ${inoxMaterials.length}`);

    // Show formatted output preview
    console.log('\n--- Material Prompt Preview ---');
    console.log(materialPrompt.substring(0, 300) + '...\n');

    console.log('--- Customer Prompt Preview ---');
    console.log(customerPrompt.substring(0, 300) + '...\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testERPIntegration();
