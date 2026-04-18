/**
 * API Response wrapper - theo chuẩn backend NodeJS
 * { result: { responseCode: '00', message: string }, data: T }
 */
export interface ApiResponse<T = any> {
  result: {
    responseCode: string;
    message: string;
  };
  data?: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}
