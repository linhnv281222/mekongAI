import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environment/environment';
import { Job } from './models/job.model';
import { Drawing } from './models/drawing.model';
import { PromptTemplate, PromptVersion, KnowledgeBlock, UiSchema } from './models/prompt.model';

/**
 * Mekong AI Service - Giao tiếp với NodeJS backend (port 3000)
 */
@Injectable({
  providedIn: 'root',
})
export class MekongAiService {
  mekongApiPath: string = environment.mekong_ai_endpoint;

  constructor(
    private http: HttpClient,
  ) {}

  // ==================== JOBS API ====================

  /**
   * Lấy danh sách jobs (Agent emails)
   * @returns Promise<Job[]>
   */
  async getJobs(): Promise<Job[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/jobs`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data || [];
      }
      return [];
    } catch (error: any) {
      console.error('Lỗi khi lấy danh sách jobs:', error);
      return [];
    }
  }

  /**
   * Lấy chi tiết 1 job
   * @param jobId - ID của job
   * @returns Promise<Job>
   */
  async getJobById(jobId: number | string): Promise<Job | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/jobs/${jobId}`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body;
      }
      return null;
    } catch (error: any) {
      console.error('Lỗi khi lấy chi tiết job:', error);
      return null;
    }
  }

  /**
   * Push job lên ERP
   * @param jobId - ID của job
   * @returns Promise<any>
   */
  async pushJobToErp(jobId: number | string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.mekongApiPath}/jobs/${jobId}/push-erp`, {}, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi push ERP:', error);
      throw error;
    }
  }

  // ==================== DRAWING API ====================

  /**
   * Upload và phân tích file PDF/ảnh bản vẽ
   * @param file - File cần upload
   * @returns Promise<Drawing[]>
   */
  async uploadAndAnalyzeDrawing(file: File): Promise<Drawing[]> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await firstValueFrom(
        this.http.post<any>(`${this.mekongApiPath}/drawings/batch`, formData, {
          headers: new HttpHeaders({
          }),
          observe: 'response',
        })
      );

      if (response?.status === 200 && response?.body) {
        return response.body.results || [];
      }
      return [];
    } catch (error: any) {
      console.error('Lỗi khi upload bản vẽ:', error);
      throw error;
    }
  }

  // ==================== ATTACHMENT PREVIEW ====================

  /**
   * Lấy preview file đính kèm (trả về base64)
   * @param jobId - ID của job
   * @param fileName - Tên file
   * @returns Promise<{ b64: string, mime: string, ok: boolean }>
   */
  async getAttachmentPreview(jobId: number | string, fileName: string): Promise<{ b64: string; mime: string; ok: boolean } | null> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(
          `${this.mekongApiPath}/jobs/${jobId}/attachment-preview`,
          { f: fileName },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      if (response?.status === 200 && response?.body) {
        return response.body;
      }
      return null;
    } catch (error: any) {
      console.error('Lỗi khi lấy preview attachment:', error);
      return null;
    }
  }

  // ==================== CHAT API ====================

  /**
   * Gửi tin nhắn chat
   * @param message - Nội dung tin nhắn
   * @param files - Danh sách file đính kèm (optional)
   * @returns Promise<{ reply: string, error?: string }>
   */
  async sendChatMessage(message: string, files: File[] = []): Promise<{ reply: string; error?: string }> {
    try {
      const formData = new FormData();
      if (message) {
        formData.append('message', message);
      }
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await firstValueFrom(
        this.http.post<any>(`${this.mekongApiPath}/chat/message`, formData, {
          headers: new HttpHeaders({
          }),
          observe: 'response',
        })
      );

      if (response?.status === 200 && response?.body) {
        return response.body;
      }
      return { reply: '', error: 'Không có phản hồi' };
    } catch (error: any) {
      console.error('Lỗi khi gửi chat:', error);
      return { reply: '', error: error.message || 'Lỗi kết nối' };
    }
  }

  // ==================== PROMPT ADMIN API ====================

  /**
   * Lấy danh sách prompt templates
   * @returns Promise<PromptTemplate[]>
   */
  async getPromptTemplates(): Promise<PromptTemplate[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/admin/prompts`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data || [];
      }
      return [];
    } catch (error: any) {
      console.error('Lỗi khi lấy prompts:', error);
      return [];
    }
  }

  /**
   * Lấy danh sách versions của 1 prompt
   * @param promptKey - Key của prompt
   * @returns Promise<PromptVersion[]>
   */
  async getPromptVersions(promptKey: string): Promise<PromptVersion[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/admin/prompts/${promptKey}/versions`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data || [];
      }
      return [];
    } catch (error: any) {
      console.error('Lỗi khi lấy prompt versions:', error);
      return [];
    }
  }

  /**
   * Cập nhật nội dung prompt version
   * @param promptKey - Key của prompt
   * @param version - Số version
   * @param content - Nội dung mới
   * @param note - Ghi chú
   * @returns Promise<any>
   */
  async updatePromptVersion(promptKey: string, version: number, content: string, note: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.put<any>(
          `${this.mekongApiPath}/admin/prompts/${promptKey}/versions/${version}`,
          { content, note, created_by: 'admin' },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi cập nhật prompt:', error);
      throw error;
    }
  }

  /**
   * Tạo version mới cho prompt
   * @param promptKey - Key của prompt
   * @param content - Nội dung
   * @param note - Ghi chú
   * @param activate - Có kích hoạt luôn không
   * @returns Promise<any>
   */
  async createPromptVersion(promptKey: string, content: string, note: string, activate: boolean): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(
          `${this.mekongApiPath}/admin/prompts/${promptKey}/versions`,
          { content, note, created_by: 'admin', activate },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi tạo prompt version:', error);
      throw error;
    }
  }

  /**
   * Kích hoạt prompt version
   * @param promptKey - Key của prompt
   * @param version - Số version
   * @returns Promise<any>
   */
  async activatePromptVersion(promptKey: string, version: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(
          `${this.mekongApiPath}/admin/prompts/${promptKey}/versions/${version}/activate`,
          {},
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi kích hoạt prompt:', error);
      throw error;
    }
  }

  /**
   * Xóa prompt version
   * @param promptKey - Key của prompt
   * @param version - Số version
   * @returns Promise<any>
   */
  async deletePromptVersion(promptKey: string, version: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.delete<any>(
          `${this.mekongApiPath}/admin/prompts/${promptKey}/versions/${version}`,
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi xóa prompt version:', error);
      throw error;
    }
  }

  /**
   * Test prompt với variables
   * @param promptKey - Key của prompt
   * @param variables - Variables cần substitute
   * @returns Promise<any>
   */
  async testPrompt(promptKey: string, variables: Record<string, string>): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post<any>(
          `${this.mekongApiPath}/admin/prompts/test`,
          { key: promptKey, variables },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data || response.body;
      }
      return null;
    } catch (error: any) {
      console.error('Lỗi khi test prompt:', error);
      throw error;
    }
  }

  // ==================== KNOWLEDGE API ====================

  /**
   * Lấy danh sách knowledge blocks
   * @returns Promise<KnowledgeBlock[]>
   */
  async getKnowledgeBlocks(): Promise<KnowledgeBlock[]> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/admin/prompts/knowledge/list`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data || [];
      }
      return [];
    } catch (error: any) {
      console.error('Lỗi khi lấy knowledge:', error);
      return [];
    }
  }

  /**
   * Lưu knowledge block
   * @param key - Key của knowledge
   * @param payload - Dữ liệu (string hoặc {format, headers, rows, content})
   * @returns Promise<any>
   */
  async saveKnowledgeBlock(key: string, payload: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.put<any>(
          `${this.mekongApiPath}/admin/prompts/knowledge/${key}`,
          payload,
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi lưu knowledge:', error);
      throw error;
    }
  }

  // ==================== CONFIG API ====================

  /**
   * Lấy cấu hình AI provider (claude/gemini)
   * @returns Promise<{ provider: string }>
   */
  async getAiProviderConfig(): Promise<{ provider: string } | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/admin/prompts/config`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.data;
      }
      return null;
    } catch (error: any) {
      console.error('Lỗi khi lấy config:', error);
      return null;
    }
  }

  /**
   * Cập nhật AI provider
   * @param provider - 'claude' hoặc 'gemini'
   * @returns Promise<any>
   */
  async updateAiProvider(provider: string): Promise<any> {
    try {
      const modelLegacy = provider === 'gemini' ? 'gemini-3.1-pro-preview' : 'claude-sonnet-4-6';
      const response = await firstValueFrom(
        this.http.put<any>(
          `${this.mekongApiPath}/admin/prompts/config`,
          { provider, model: modelLegacy },
          {
            headers: new HttpHeaders({
              'Content-Type': 'application/json',
            }),
            observe: 'response',
          }
        )
      );
      return response?.body;
    } catch (error: any) {
      console.error('Lỗi khi cập nhật provider:', error);
      throw error;
    }
  }

  // ==================== MISC API ====================

  /**
   * Lấy inbox email hint (địa chỉ nhận RFQ)
   * @returns Promise<string>
   */
  async getInboxEmailHint(): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/api/demo-hint`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return response.body.inboxEmail || '';
      }
      return '';
    } catch (error: any) {
      console.error('Lỗi khi lấy inbox hint:', error);
      return '';
    }
  }

  /**
   * Lấy UI schema cho form phân loại
   * @returns Promise<UiSchema>
   */
  async getEmailClassifyUiSchema(): Promise<UiSchema | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/api/email-classify-ui-schema`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body && Array.isArray(response.body.generalRows)) {
        return response.body;
      }
      return null;
    } catch (error: any) {
      console.error('Lỗi khi lấy UI schema:', error);
      return null;
    }
  }

  /**
   * Lấy hint inbox email cho demo
   * @returns Promise<{ inboxEmail: string }>
   */
  async getDemoHint(): Promise<{ inboxEmail: string }> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/api/demo-hint`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      if (response?.status === 200 && response?.body) {
        return { inboxEmail: response.body.inboxEmail || '' };
      }
      return { inboxEmail: '' };
    } catch (error: any) {
      console.error('Lỗi khi lấy demo hint:', error);
      return { inboxEmail: '' };
    }
  }

  /**
   * Kiểm tra health status
   * @returns Promise<boolean>
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`${this.mekongApiPath}/health`, {
          headers: new HttpHeaders({
            'Content-Type': 'application/json',
          }),
          observe: 'response',
        })
      );
      return response?.status === 200;
    } catch (error: any) {
      return false;
    }
  }
}
