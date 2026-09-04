import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface DrawingVersion {
  id: number;
  job_id: number;
  drawing_index: number;
  version_type: 'ai_extracted' | 'user_draft' | 'approved' | 'erp_confirmed';
  data: Record<string, unknown>;
  source_model?: string;
  created_at: string;
  created_by?: string;
}

export interface FieldEvidence {
  id: number;
  version_id: number;
  field_name: string;
  page_number?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  source_text?: string;
  source_type?: string;
  confidence?: number;
}

export interface FeedbackEvent {
  id: number;
  job_id: number;
  drawing_index: number;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  change_type: string;
  created_at: string;
  created_by?: string;
}

export interface DiffResult {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

@Injectable({
  providedIn: 'root',
})
export class VersionService {
  private readonly path = environment.api_end_point.replace(/\/$/, '');

  constructor(private http: HttpClient) {}

  private jsonHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  }

  // Get all versions for a job
  async getJobVersions(jobId: number | string): Promise<DrawingVersion[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: DrawingVersion[] }>(
        `${this.path}/jobs/${jobId}/versions`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.data || [];
  }

  // Get version history for a specific drawing
  async getDrawingVersions(
    jobId: number | string,
    drawingIndex: number
  ): Promise<DrawingVersion[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: DrawingVersion[] }>(
        `${this.path}/jobs/${jobId}/drawings/${drawingIndex}/versions`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.data || [];
  }

  // Get latest version of a drawing (filter by type)
  async getLatestDrawingVersion(
    jobId: number | string,
    drawingIndex: number,
    versionType?: 'ai_extracted' | 'user_draft' | 'approved' | 'erp_confirmed'
  ): Promise<DrawingVersion | null> {
    const params = versionType ? `?version_type=${versionType}` : '';
    const response = await firstValueFrom(
      this.http.get<{ data: DrawingVersion }>(
        `${this.path}/jobs/${jobId}/drawings/${drawingIndex}/latest${params}`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.data || null;
  }

  // Save user draft for a drawing
  async saveDraft(
    jobId: number | string,
    drawingIndex: number,
    data: Record<string, unknown>,
    changedFields?: Record<string, { oldValue: unknown; newValue: unknown }>
  ): Promise<{ success: boolean; version?: DrawingVersion }> {
    const response = await firstValueFrom(
      this.http.post<{ success: boolean; version?: DrawingVersion }>(
        `${this.path}/jobs/${jobId}/drawings/${drawingIndex}/draft`,
        { data, changedFields },
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body || { success: false };
  }

  // Approve job (all drawings)
  async approveJob(
    jobId: number | string
  ): Promise<{ success: boolean; message?: string }> {
    const response = await firstValueFrom(
      this.http.post<{ success: boolean; message?: string }>(
        `${this.path}/jobs/${jobId}/approve`,
        {},
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body || { success: false };
  }

  // Diff two versions
  async diffVersions(
    jobId: number | string,
    drawingIndex: number,
    fromType: string,
    toType: string
  ): Promise<DiffResult[]> {
    const response = await firstValueFrom(
      this.http.get<{ diff: DiffResult[] }>(
        `${this.path}/jobs/${jobId}/drawings/${drawingIndex}/diff?from=${fromType}&to=${toType}`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.diff || [];
  }

  // Get feedback history for a job
  async getJobFeedback(jobId: number | string): Promise<FeedbackEvent[]> {
    const response = await firstValueFrom(
      this.http.get<{ feedback: FeedbackEvent[] }>(
        `${this.path}/jobs/${jobId}/feedback`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.feedback || [];
  }

  // Get field evidence for a drawing version
  async getFieldEvidence(
    jobId: number | string,
    drawingIndex: number,
    versionType?: string
  ): Promise<FieldEvidence[]> {
    const params = versionType ? `?version_type=${versionType}` : '';
    const response = await firstValueFrom(
      this.http.get<{ evidence: FieldEvidence[] }>(
        `${this.path}/jobs/${jobId}/drawings/${drawingIndex}/evidence${params}`,
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body?.evidence || [];
  }

  // Validate job before ERP push
  async validateJob(
    jobId: number | string
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const response = await firstValueFrom(
      this.http.post<{ valid: boolean; errors?: string[] }>(
        `${this.path}/jobs/${jobId}/validate`,
        {},
        {
          headers: this.jsonHeaders(),
          observe: 'response',
        }
      )
    );
    return response.body || { valid: false };
  }
}
