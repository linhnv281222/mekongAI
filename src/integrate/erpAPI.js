import fs from "fs";
import path from "path";
import fetch, { Blob, FormData } from "node-fetch";
import { erpCfg } from "../libs/config.js";

const DEFAULT_SSO_URL =
	"https://sso.xfactory.vn/auth/realms/fcim_cloud/protocol/openid-connect/token";

let accessToken = erpCfg.bearerToken || "";
let tokenExpiresAt = erpCfg.bearerToken ? Number.MAX_SAFE_INTEGER : 0;

function trimSlash(value) {
	return String(value || "").replace(/\/+$/, "");
}

function qs(params = {}) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== "") {
			search.set(key, String(value));
		}
	}
	const result = search.toString();
	return result ? `?${result}` : "";
}

function mdmUrl(pathname) {
	const base = trimSlash(erpCfg.baseUrl);
	const origin = new URL(`${base}/`).origin;
	return `${origin}/mdm-v2/api${pathname}`;
}

async function loginErp({ force = false } = {}) {
	if (!force && accessToken && Date.now() < tokenExpiresAt - 30_000) {
		return accessToken;
	}
	if (!erpCfg.username || !erpCfg.password) {
		if (accessToken) return accessToken;
		throw new Error("Thiếu ERP_USERNAME/ERP_PASSWORD để đăng nhập Keycloak");
	}

	const body = new URLSearchParams({
		grant_type: "password",
		client_id: process.env.ERP_CLIENT_ID || "fcim-cloud",
		username: erpCfg.username,
		password: erpCfg.password,
	});
	const response = await fetch(erpCfg.loginUrl || DEFAULT_SSO_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok || !data.access_token) {
		throw new Error(`ERP đăng nhập thất bại: ${JSON.stringify(data)}`);
	}
	accessToken = data.access_token;
	tokenExpiresAt = Date.now() + Number(data.expires_in || 300) * 1000;
	return accessToken;
}

export { loginErp };

async function request(url, { method = "GET", body, headers = {}, retry = true } = {}) {
	const token = await loginErp();
	if (!token) {
		throw new Error("ERP request thiếu access token");
	}
	const requestHeaders = {
		Accept: "application/json",
		Authorization: `Bearer ${token}`,
		...headers,
	};
	if (body !== undefined && !(body instanceof FormData)) {
		requestHeaders["Content-Type"] = "application/json";
	}
	const response = await fetch(url, {
		method,
		headers: requestHeaders,
		body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
	});
	if (response.status === 401 && retry && erpCfg.username && erpCfg.password) {
		await loginErp({ force: true });
		return request(url, { method, body, headers, retry: false });
	}
	const text = await response.text();
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = text;
	}
	if (!response.ok) {
		const detail = typeof data === "string" ? data : JSON.stringify(data);
		throw new Error(`ERP ${method} ${url} (${response.status}): ${detail}`);
	}
	return data;
}

function qsApi(pathname) {
	return `${trimSlash(erpCfg.baseUrl)}${pathname}`;
}

export const erpApi = {
	get: (pathname, options) => request(qsApi(pathname), options),
	post: (pathname, body, options = {}) => request(qsApi(pathname), { ...options, method: "POST", body }),
	put: (pathname, body, options = {}) => request(qsApi(pathname), { ...options, method: "PUT", body }),
};

// ─── Chặng 1: Master data và quotation header ──────────────────────────────

export const getCustomerColumns = () => request(mdmUrl("/columns/customer"));
export const searchCustomers = (filter = {}) => request(mdmUrl("/dynamic-tables/customer/search"), { method: "POST", body: filter });
export const searchQuotationConfig = (filter = { code: "VAT_QUOTATION" }) => request(mdmUrl("/v2/dynamic-tables/config/search"), { method: "POST", body: filter });
export const getExchangeRate = () => erpApi.get("/exchange-rate");
export const searchOperations = (filter = { operation_group: "VC" }) => request(mdmUrl("/dynamic-tables/operation/search"), { method: "POST", body: filter });
export const searchMaterialTypes = (filter = {}) => request(mdmUrl("/dynamic-tables/material_type/search"), { method: "POST", body: filter });
export const getQuotaClassify = () => request(mdmUrl("/params/columns/mdm_quotation_sheet/quota_classify"));
export const getTerms = (languageId = "en") => erpApi.get(`/terms/get-all-by-language-id${qs({ languageId })}`);

export async function prepareQuotationMasterData(filters = {}) {
	const [company, customers, vat, exchangeRate, operations, materials, quotaClassify, terms] = await Promise.all([
		getCustomerColumns(),
		searchCustomers(filters.customer),
		searchQuotationConfig(filters.vat || { code: "VAT_QUOTATION" }),
		getExchangeRate(),
		searchOperations(filters.operation || { operation_group: "VC" }),
		searchMaterialTypes(filters.material),
		getQuotaClassify(),
		getTerms(filters.languageId || "en"),
	]);
	return { company, customers, vat, exchangeRate, operations, materials, quotaClassify, terms };
}

export function buildQuotationHeader(emailData = {}, classify = {}, master = {}) {
	const language = { vi: "Tiếng Việt", en: "Tiếng Anh", ja: "Tiếng Nhật" }[classify.ngon_ngu] || "Tiếng Nhật";
	const currency = { vi: "VND", en: "USD", ja: "JPY" }[classify.ngon_ngu] || "VND";
	return {
		id: null,
		quota_code: null,
		is_active: true,
		sign_status: "0",
		status: "0",
		type: "Gia công",
		quoting_status: "Mới tạo",
		format: "Kinh tế",
		language,
		lot_number: classify.lot_number || 1,
		quantity_for_min_price: classify.quantity_for_min_price || 10,
		creator: erpCfg.username || "sale_ai@vnt.vn",
		created_date: new Date().toISOString(),
		request_time: emailData.date ? new Date(emailData.date).toISOString() : new Date().toISOString(),
		vat: master.vat_value == null ? null : Boolean(master.vat_value),
		vat_value: master.vat_value ?? 8,
		exchange_rate: master.exchange_rate ?? 160.28,
		quotation_currency: master.quotation_currency || currency,
		company_code: master.company_code ?? 1,
		customer_code: master.customer_code ?? 64,
		transport_method: master.transport_method ?? null,
		has_transport: Boolean(classify.hinh_thuc_giao),
		surface_treatment: classify.xu_ly_be_mat === true,
		unit: "PCS",
		term: master.term || JSON.stringify([]),
		assignment: null,
		_agent_note: `Mekong AI — ${emailData.senderEmail || ""} — ${emailData.subject || ""}`,
	};
}

export const createQuotationSheet = (payload) => erpApi.post("/quotation-sheets/create", payload);

// ─── Chặng 2: F1 ───────────────────────────────────────────────────────────

export async function importDrawingPdf({ pdfPath, filename = path.basename(pdfPath), fileField = "files" }) {
	const form = new FormData();
	form.append(fileField, new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), path.basename(filename));
	console.log(`[importDrawingPdf] Uploading PDF to ERP: ${filename}, size=${fs.statSync(pdfPath).size} bytes`);
    return erpApi.post("/split-pdf-multiple/cache", form);
}

export const insertQuotationItems = (quotaCode, items) => erpApi.post(`/quotation-items/insert-pdf/cache${qs({ quotaCode })}`, items);
export const getQuotationItems = (quotaCode) => erpApi.get(`/quotation-items/quota-code/${encodeURIComponent(quotaCode)}`);
export const batchAnalyzeQuotationItems = (quotaCode, ids) => erpApi.put(`/quotation-sheets/batch/${encodeURIComponent(quotaCode)}`, { ids, status: 1 });
export const updateBlueprintCode = (items) => erpApi.post("/quotation-items/update-blueprint-code", items);
export const saveQuotationBlueprint = (items) => erpApi.post("/quotation-items/save-quotation-blueprint", items);

// ─── Chặng 3: F3 ───────────────────────────────────────────────────────────

export const getQuotationSheet = (quotaCode) => erpApi.get(`/quotation-sheets/${encodeURIComponent(quotaCode)}`);
export const searchSuppliers = (filter = {}) => request(mdmUrl("/dynamic-tables/supplier/search"), { method: "POST", body: filter });
export const searchShapes = (filter = {}) => request(mdmUrl("/dynamic-tables/shape/search"), { method: "POST", body: filter });
export const analyzeMaterialProcess = (payload) => erpApi.post("/quotation-items/analyze-material", payload);
export const replaceQuotationMaterial = (payload) => erpApi.post("/dynamic-tables/quotation_material/replace-batch", payload);
export const updateQuotationBlueprintF3 = (id, payload) => erpApi.put(`/quotation-items/update-data/${encodeURIComponent(id)}${qs({ tableName: "quotation_blueprint" })}`, payload);

// ─── Chặng 4: F4 ───────────────────────────────────────────────────────────

export const searchBlueprintAddition = (filter = {}) => request(mdmUrl("/dynamic-tables/quotation_blueprint_addition/search-equal"), { method: "POST", body: filter });
export const upsertQuotationVolumes = (records) => request(mdmUrl("/dynamic-tables/quotation_volume/batch-v2"), { method: "PUT", body: records });
export const updateQuotationBlueprintF4 = (id, payload) => erpApi.put(`/quotation-items/update-data/${encodeURIComponent(id)}${qs({ tableName: "quotation_blueprint" })}`, payload);

// ─── Chặng 5: F5 ───────────────────────────────────────────────────────────

export const searchTechnologyProcesses = (filter = {}) => request(mdmUrl("/dynamic-tables/technology_process/search"), { method: "POST", body: filter });
export const getTechnologyProcessOperations = (technologyProcessCode) => erpApi.post(`${"/quotation-sheets/get-data-by-dynamic-table"}${qs({ tableName: "technology_process_operation" })}`, { technology_process_code: technologyProcessCode });
export const replaceTechnologyProcessBlueprint = (internalCode, records) => request(`${mdmUrl("/dynamic-tables/technology_process_blueprint/replace-batch")}${qs({ columnName: "internal_code", columnValue: internalCode })}`, { method: "POST", body: records });
export const updateQuotationAdditionalData = (payload) => request(mdmUrl("/dynamic-tables/multi-batch"), { method: "POST", body: payload });
export const updateQuotationItemData = (id, payload) => erpApi.put(`/quotation-items/update-data/${encodeURIComponent(id)}`, payload);
export const syncQuotationItemFromTechnology = (internalCode) => erpApi.put(`/quotation-items/update-quotation-items-from-technology${qs({ internalCode })}`);

function extractImportedFiles(imported) {
	const value = imported?.data ?? imported?.rows ?? imported;
	if (Array.isArray(value)) return value;
	if (Array.isArray(value?.files)) return value.files;
	if (Array.isArray(value?.data)) return value.data;
	return [];
}

function getImportedFileName(file, index) {
	if (typeof file === "string") return file.replace(/\.pdf$/i, "");
	return file?.fileNameOld || file?.filename || file?.file_name || file?.name || `drawing_${index}`;
}

/**
 * Ghép dữ liệu từ header/upload/AI drawing thành payload F1 mà ERP yêu cầu.
 * f1.items được ưu tiên, còn các trường thiếu sẽ lấy từ dữ liệu drawing tương ứng.
 */
export function buildF1Items({ drawings = [], imported = null, items = [] } = {}) {
	const previousItems = Array.isArray(items) ? items : [];
	const importedFiles = extractImportedFiles(imported);
	const source = importedFiles.length ? importedFiles : previousItems.length ? previousItems : drawings;
	if (imported !== null && importedFiles.length === 0) {
		throw new Error("ERP import PDF không trả về danh sách fileNameOld cho bước F1");
	}

	return source.map((item, index) => {
		const drawing = drawings[index]?.data || drawings[index] || {};
		const importedFile = importedFiles[index];
		const previousItem = previousItems[index] || {};
		return {
			...previousItem,
			id: previousItem.id ?? index,
			fileNameOld:
				(importedFile ? getImportedFileName(importedFile, index) : null) ||
				previousItem.fileNameOld ||
				drawing.ma_ban_ve ||
				`drawing_${index}`,
			fileNameNew: previousItem.fileNameNew ?? drawing.ten_chi_tiet ?? drawing.ten_san_pham ?? null,
			totalFiles: source.length,
			ma_nvl: previousItem.ma_nvl ?? drawing.vat_lieu ?? drawing.ma_vat_lieu ?? null,
			so_luong: previousItem.so_luong ?? drawing.so_luong ?? 1,
			kl_phoi_kg: previousItem.kl_phoi_kg ?? drawing.kl_phoi_kg ?? drawing.klPhoiKg ?? 0,
			ma_quy_trinh: previousItem.ma_quy_trinh ?? drawing.ma_quy_trinh ?? null,
		};
	});
}

/** Chạy tuần tự các bước F1-F5 khi caller đã chuẩn bị payload cho từng bước. */
export async function runQuotationWorkflow({ header, drawing, f1, f3, f4, f5 }) {
	console.log("runQuotationWorkflow", { header, drawing, f1, f3, f4, f5 });
    const quote = await createQuotationSheet(header);
    console.log("Quotation created:", quote);
	const quotaCode = quote.quota_code || quote.data?.quota_code || (typeof quote.data === "string" ? quote.data : null);
	if (!quotaCode) throw new Error("ERP không trả về quota_code sau khi tạo phiếu báo giá");
    console.log("Tạo phiếu báo giá thành công Quota code:", quotaCode);
	const imported = drawing?.pdfPath ? await importDrawingPdf(drawing) : null;
    // console.log("Drawing PDF imported:", imported);
    // Lấy dữ liệu từ các bước trước và ghép thành payload F1.
    
	const f1Items = imported?.data;
    
    // buildF1Items({
	// 	drawings: f1?.drawings || drawing?.drawings || [],
	// 	imported,
	// 	items: f1?.items,
	// });
    console.log("Inserting quotation items for quotaCode:", quotaCode, "with items:", f1Items);
	const inserted = f1Items.length ? await insertQuotationItems(quotaCode, f1Items) : null;
	// const items = await getQuotationItems(quotaCode);
	// const itemList = Array.isArray(items) ? items : items.data || items.rows || [];

	const result = { quote, quotaCode, imported, f1Items, inserted };
    console.log("Workflow results:", { quote, quotaCode, imported, inserted });
	// if (f1?.analyze !== false && itemList.length > 0) {
	// 	result.f1Status = await batchAnalyzeQuotationItems(quotaCode, itemList.map((item) => item.id));
	// }
	// if (f1?.blueprintCode) result.blueprintCode = await updateBlueprintCode(f1.blueprintCode);
	// if (f1?.quotationBlueprint) result.quotationBlueprint = await saveQuotationBlueprint(f1.quotationBlueprint);
	// if (f3) result.f3 = await Promise.all((f3.items || []).map((item) => updateQuotationBlueprintF3(item.id, item.payload)));
	// if (f4?.volumes) result.volumes = await upsertQuotationVolumes(f4.volumes);
	// if (f4?.items) result.f4 = await Promise.all((f4.items || []).map((item) => updateQuotationBlueprintF4(item.id, item.payload)));
	// if (f5) {
	// 	if (f5.processes) result.processes = await Promise.all(f5.processes.map((item) => searchTechnologyProcesses(item)));
	// 	if (f5.operations) result.operations = await Promise.all(f5.operations.map((item) => getTechnologyProcessOperations(item)));
	// 	if (f5.blueprints) result.processBlueprints = await Promise.all(f5.blueprints.map((item) => replaceTechnologyProcessBlueprint(item.internalCode, item.records)));
	// 	if (f5.additionalData) result.additionalData = await updateQuotationAdditionalData(f5.additionalData);
	// 	if (f5.items) result.f5 = await Promise.all(f5.items.map((item) => updateQuotationItemData(item.id, item.payload)));
	// 	if (f5.syncCodes) result.synced = await Promise.all(f5.syncCodes.map(syncQuotationItemFromTechnology));
	// }
	return result;
}
