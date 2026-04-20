import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from 'src/environment/environment';
import { Job } from '../models/job.model';
import { EmailRow } from '../models/email.model';
import { UiSchema } from '../models/prompt.model';
import { Drawing } from '../models/drawing.model';
import {
  mapJobRowToEmail,
  normalizeClassifyOutputFromJob,
  fmtDDMMHHmm,
} from '../utils/email.util';
import { drawingToLine, DrawingLine } from '../utils/drawing.util';

const JOBS_POLL_MS = 8000;

@Injectable({
  providedIn: 'root',
})
export class DemoV3Service implements OnDestroy {
  private readonly path = environment.api_end_point.replace(/\/$/, '');
  private destroy$ = new Subject<void>();
  private pollingSub?: Subscription;
  private previewLoadGen = 0;
  private currentPreviewFile = '';
  private previewBytesCache: Uint8Array | null = null;

  constructor(private http: HttpClient) {}

  // ── Polling ─────────────────────────────────────────────────

  startPolling(
    onJobs: (emails: EmailRow[]) => void,
    _onUpdate: (email: EmailRow) => void
  ): void {
    this.stopPolling();
    this.poll(onJobs);
    this.pollingSub = interval(JOBS_POLL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.poll(onJobs));
  }

  stopPolling(): void {
    this.pollingSub?.unsubscribe();
  }

  private async poll(onJobs: (emails: EmailRow[]) => void): Promise<void> {
    try {
      const data = await this.fetchJson<{ data: Job[] }>('/jobs');
      if (!data.data?.length) {
        onJobs([]);
        return;
      }
      const agentEmails = data.data.map((j) => mapJobRowToEmail(j));
      onJobs(agentEmails);
    } catch {
      // silent fail polling
    }
  }

  // ── Job detail ─────────────────────────────────────────────

  async loadJobDetail(jobId: number | string): Promise<Job | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<Job>(`${this.path}/jobs/${jobId}`, {
          headers: this.jsonHeaders(),
          observe: 'response',
        })
      );
      return response.body;
    } catch {
      return null;
    }
  }

  // ── Email row from job ───────────────────────────────────────

  buildFullEmailRow(job: Job, partial: EmailRow): EmailRow {
    return {
      ...partial,
      body: job.ghi_chu || (partial.classify_output as any)?.ghi_chu || '',
      attachments: job.attachments || [],
      date: fmtDDMMHHmm(job.created_at ?? partial.date),
      han_giao:
        job.han_giao != null && job.han_giao !== '' ? job.han_giao : null,
      hinh_thuc_giao: job.hinh_thuc_giao || null,
      xu_ly_be_mat: job.xu_ly_be_mat ?? null,
      vat_lieu_chung_nhan: job.vat_lieu_chung_nhan ?? null,
      classify_output: normalizeClassifyOutputFromJob(job),
      ten_kh: job.ten_cong_ty || job.sender || partial.ten_kh || '',
      drawings: job.drawings || [],
      _needLoad: false,
      // AI Debug payloads
      classify_ai_payload: job.classify_ai_payload ?? null,
      drawing_ai_payload: job.drawing_ai_payload ?? null,
    };
  }

  // ── Upload drawings ──────────────────────────────────────────

  async uploadAndAnalyzeDrawing(
    file: File,
    onProgress: (pct: number) => void,
    onLine: (line: DrawingLine) => void
  ): Promise<void> {
    onProgress(5);
    const form = new FormData();
    form.append('file', file);
    onProgress(20);

    try {
      const response = await firstValueFrom(
        this.http.post<{ results: Drawing[] }>(
          `${this.path}/drawings/batch`,
          form,
          {
            headers: new HttpHeaders({}),
            observe: 'response',
          }
        )
      );

      const results = response.body?.results || [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        onLine(drawingToLine(r, i));
        onProgress(Math.round(20 + ((i + 1) / results.length) * 75));
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      onProgress(100);
    } catch (err) {
      console.error('[DemoV3Service] uploadAndAnalyzeDrawing error', err);
      throw err;
    }
  }

  // ── Attachment preview ──────────────────────────────────────

  async loadAttachmentPreview(
    jobId: number | string,
    fileName: string
  ): Promise<{ b64: string; mime: string; ok: boolean } | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ b64: string; mime: string; ok: boolean }>(
          `${this.path}/jobs/${jobId}/attachment-preview`,
          { f: fileName },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
              Accept: 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response.body;
    } catch {
      return null;
    }
  }

  /** Decode base64 → Uint8Array */
  b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /** Load preview from Gmail attachment, returns decoded bytes and mime */
  async loadGmailAttachmentPreview(
    jobId: number | string,
    fileName: string
  ): Promise<{ bytes: Uint8Array; mime: string } | null> {
    const gen = ++this.previewLoadGen;
    const data = await this.loadAttachmentPreview(jobId, fileName);
    if (gen !== this.previewLoadGen) return null;
    if (!data?.ok || !data.b64) return null;
    const bytes = this.b64ToBytes(data.b64);
    this.currentPreviewFile = fileName;
    this.previewBytesCache = bytes;
    return { bytes, mime: data.mime };
  }

  getPreviewBytesCache(): Uint8Array | null {
    return this.previewBytesCache;
  }

  getCurrentPreviewFile(): string {
    return this.currentPreviewFile;
  }

  // ── Misc ───────────────────────────────────────────────────

  async loadInboxHint(): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ inboxEmail: string }>(`${this.path}/api/demo-hint`, {
          headers: this.jsonHeaders(),
          observe: 'response',
        })
      );
      return response.body?.inboxEmail || '';
    } catch {
      return '';
    }
  }

  async loadClassifyUiSchema(): Promise<UiSchema | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<UiSchema>(`${this.path}/api/email-classify-ui-schema`, {
          headers: this.jsonHeaders(),
          observe: 'response',
        })
      );
      const body = response.body;
      if (body && Array.isArray(body.generalRows)) return body;
      return null;
    } catch {
      return null;
    }
  }

  async pushToErp(jobId: number | string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.path}/jobs/${jobId}/push-erp`,
        {},
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
  }

  // ── Helpers ─────────────────────────────────────────────────

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await firstValueFrom(
      this.http.get<T>(`${this.path}${url}`, {
        headers: this.jsonHeaders(),
        observe: 'response',
      })
    );
    return response.body as T;
  }

  private jsonHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopPolling();
  }
}
