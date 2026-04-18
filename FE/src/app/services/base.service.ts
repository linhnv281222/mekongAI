import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environment/environment';

@Injectable({
  providedIn: 'root',
})
export class BaseService {
  path = '';
  acceptLanguage = 'vi';

  constructor(private http: HttpClient) {
    this.path = environment.api_end_point.replace(/\/$/, '');
    const language = localStorage.getItem('language');
    this.acceptLanguage = language !== null ? language : 'vi';
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-language': this.acceptLanguage,
    });
  }

  private buildParams(
    query?: Record<string, string | number | boolean | null | undefined>,
  ): HttpParams {
    let params = new HttpParams();
    if (!query) {
      return params;
    }
    for (const key of Object.keys(query)) {
      const v = query[key];
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(key, String(v));
      }
    }
    return params;
  }

  private async parseBody<T>(response: HttpResponse<T>): Promise<T> {
    const body = response.body as T;
    if (response.status >= 200 && response.status < 300 && body !== null && body !== undefined) {
      return body;
    }
    throw new Error('Phản hồi không hợp lệ');
  }

  async getData<T = unknown>(url: string): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<T>(`${this.path}/${url}`, {
        headers: this.headers(),
        observe: 'response',
      }),
    );
    return this.parseBody(response);
  }

  async getDataQuery<T = unknown>(
    url: string,
    query?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<T>(`${this.path}/${url}`, {
        headers: this.headers(),
        params: this.buildParams(query),
        observe: 'response',
      }),
    );
    return this.parseBody(response);
  }

  async postData<T = unknown>(url: string, data: unknown): Promise<T> {
    const response = await firstValueFrom(
      this.http.post<T>(`${this.path}/${url}`, data, {
        headers: this.headers(),
        observe: 'response',
      }),
    );
    return this.parseBody(response);
  }

  async putData<T = unknown>(url: string, data: object): Promise<T> {
    const response = await firstValueFrom(
      this.http.put<T>(`${this.path}/${url}`, data, {
        headers: this.headers(),
        observe: 'response',
      }),
    );
    return this.parseBody(response);
  }

  async deleteData<T = unknown>(url: string): Promise<T> {
    const response = await firstValueFrom(
      this.http.delete<T>(`${this.path}/${url}`, {
        headers: this.headers(),
        observe: 'response',
      }),
    );
    return this.parseBody(response);
  }

  /**
   * POST body (JSON) → nhận response blob → trigger download file.
   * Dùng cho xuất Excel/PDF từ backend.
   */
  async downloadBlob(url: string, body: unknown): Promise<void> {
    const fullUrl = `${this.path}/${url}`;
    const response = await firstValueFrom(
      this.http.post(fullUrl, body, {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
          Accept:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/pdf, */*',
        }),
        responseType: 'blob',
        observe: 'response',
      }),
    );
    const contentDisposition = response.headers.get('Content-Disposition') ?? '';
    let fileName = `download_${Date.now()}.xlsx`;
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match) {
      fileName = match[1].replace(/['"]/g, '').trim();
    }
    const blobPart = response.body ?? new Blob();
    const blob = new Blob([blobPart], {
      type:
        response.body?.type ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  /**
   * POST body → nhận response blob (.docx) → trigger download file.
   * Dùng cho xuất Word từ backend.
   */
  async downloadDocBlob(url: string, body: unknown): Promise<void> {
    const fullUrl = `${this.path}/${url}`;
    const response = await firstValueFrom(
      this.http.post(fullUrl, body, {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
          Accept:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document, */*',
        }),
        responseType: 'blob',
        observe: 'response',
      }),
    );
    const contentDisposition = response.headers.get('Content-Disposition') ?? '';
    let fileName = `download_${Date.now()}.docx`;
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match) {
      fileName = match[1].replace(/['"]/g, '').trim();
    }
    const blobPart = response.body ?? new Blob();
    const blob = new Blob([blobPart], {
      type:
        response.body?.type ??
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  /**
   * GET → nhận response blob (.docx) → trigger download file.
   * Dùng cho xuất Word từ backend (GET route).
   */
  async downloadDocBlobGet(url: string): Promise<void> {
    const fullUrl = `${this.path}/${url}`;
    const response = await firstValueFrom(
      this.http.get(fullUrl, {
        headers: new HttpHeaders({
          Accept:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document, */*',
        }),
        responseType: 'blob',
        observe: 'response',
      }),
    );
    const contentDisposition = response.headers.get('Content-Disposition') ?? '';
    let fileName = `download_${Date.now()}.docx`;
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match) {
      fileName = match[1].replace(/['"]/g, '').trim();
    }
    const blobPart = response.body ?? new Blob();
    const blob = new Blob([blobPart], {
      type:
        response.body?.type ??
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }
}
