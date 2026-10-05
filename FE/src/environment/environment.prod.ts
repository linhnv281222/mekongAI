// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: true,

  /**
   * API endpoint cho backend server.
   *
   * Lưu ý:
   *  - Docker (server Linux): http://<IP-server>:3001
   *  - Electron portable: giữ nguyên IP server bên dưới
   *    Nếu cần thay đổi nhanh, sửa file .env.electron trong thư mục FE
   */
  api_end_point: 'http://103.82.27.132:3001',

  /** Mekong AI endpoint - NodeJS backend */
  mekong_ai_endpoint: 'http://103.82.27.132:3001',
};
