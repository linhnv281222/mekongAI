export interface ApiResult {
  responseCode: string;
  message: string;
  ok: boolean;
}

/** Phản hồi chuẩn (không danh sách phân trang) */
export interface ApiResponse<T> {
  result: ApiResult;
  data: T | null;
}

/** Danh sách có phân trang */
export interface ApiListResponse<T> {
  result: ApiResult;
  data: T[];
  dataCount: number;
}

/** Node cây năm/tháng theo created_at (API /meta/date-tree) */
export interface InvoiceDateTreeYear {
  year: number;
  months: number[];
}
