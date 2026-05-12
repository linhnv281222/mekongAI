import { Injectable } from '@angular/core';

const PREFIX = 'tbl_col_widths_';

@Injectable({ providedIn: 'root' })
export class TableResizeService {
  /** Lưu kích thước cột vào localStorage theo unique key */
  save(key: string, widths: Record<string, number>): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(widths));
    } catch {}
  }

  /** Đọc kích thước cột từ localStorage */
  load(key: string): Record<string, number> {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  /** Xoá kích thước đã lưu */
  clear(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  }

  /** Tên unique key cho mỗi bảng — dùng trong components */
  static key(...parts: string[]): string {
    return parts.join('__');
  }
}
