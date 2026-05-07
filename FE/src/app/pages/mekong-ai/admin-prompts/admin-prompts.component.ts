import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MekongAiService } from 'src/app/pages/mekong-ai/mekong-ai.service';
import { MessageService } from 'primeng/api';

interface ViewState {
  type: 'overview' | 'prompt' | 'knowledge' | 'refdata';
  refTab?: 'materials' | 'operations' | 'processes' | 'coefficients';
  key?: string;
}

interface PromptItem {
  id: string;
  name: string;
  version: string;
  active: boolean;
  variables?: string[];
  description?: string;
  active_version?: number;
}

interface KnowledgeItem {
  id: string;
  name: string;
  active: boolean;
  updatedAt: Date;
  content: string;
  format?: 'text' | 'table';
  headers?: string[];
  rows?: KnowledgeRow[];
  updated_at?: string;
}

interface KnowledgeRow {
  group?: string;
  from?: string;
  to?: string;
  note?: string;
  _selected?: boolean;
  // vnt-markets fields
  market?: string;
  ten?: string;
  gioi_tien?: string;
  email?: string;
  ngon_ngu?: string;
  tien_te?: string;
  // vnt-materials / generic
  vat_lieu?: string;
  khoi_luong?: string;
  don_vi?: string;
}

@Component({
  selector: 'app-admin-prompts',
  templateUrl: './admin-prompts.component.html',
  styleUrls: ['./admin-prompts.component.css'],
})
export class AdminPromptsComponent implements OnInit {
  // State
  currentView: ViewState = { type: 'overview' };
  prompts: PromptItem[] = [];
  knowledgeItems: KnowledgeItem[] = [];
  promptVersions: any[] = [];
  currentPromptKey: string | null = null;
  editorContent: string = '';
  isDirty: boolean = false;
  selectedVersion: number | null = null;
  selectedNote: string = '';

  // Knowledge table state
  knowledgeRows: KnowledgeRow[] = [];
  knowledgeHeaders: string[] = ['Nhóm', 'Mã gốc', 'Mã VNT', 'Ghi chú'];
  selectedKnowledgeKey: string | null = null;
  selectedKnowledgeName: string = '';
  selectedKnowledgeDesc: string = '';
  knowledgeUpdatedAt: Date | null = null;
  knowledgeUpdatedAtFormatted: string = '';
  kbNames: { [key: string]: string } = {};

  // Computed properties
  currentPromptName: string = '';
  currentPromptDesc: string = '';
  runtimeVersionLabel: string = '';

  // UI state
  apiStatus: 'online' | 'offline' = 'online';
  selectedModel: string = 'claude-sonnet-4-7';
  fileMode: boolean = false;

  // Debug panel state
  showTestPanel: boolean = false;
  debugContent: string = ''; // textarea content
  debugFiles: File[] = []; // uploaded PDFs for drawing prompts (multi)
  debugResponse: string = ''; // AI response (data only, no payload)
  debugPayload: string = ''; // Request payload sent to AI
  isRunningAi: boolean = false;

  // PrimeNG options
  aiModelOptions = [
    { label: 'Gemini 3.1 Pro', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash-preview' },
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4', value: 'claude-haiku-4-5' },
  ];
  promptVersionOptions: { label: string; value: number }[] = [];
  availableVariables: string[] = [];

  // Labels mapping
  promptLabelsVi: { [key: string]: string } = {
    'email-classify': 'Phân loại email — Prompt',
    'gemini-drawing': 'Phân tích bản vẽ (Gemini) — Prompt',
  };

  knowledgeLabelsVi: { [key: string]: string } = {
    'vnt-materials': 'Bảng quy đổi vật liệu VNT',
    'vnt-heat-treat': 'Xử lý nhiệt VNT',
    'vnt-surface': 'Xử lý bề mặt',
    'vnt-shapes': 'Bảng phân loại hình dạng VNT',
    'vnt-knowledge': 'Kiến thức nội bộ VNT (Gemini)',
  };

  promptDescVi: { [key: string]: string } = {
    'email-classify': 'Prompt phân loại email đến (Haiku)',
    'gemini-drawing': 'Prompt phân tích bản vẽ dự phòng bằng Gemini 2.5',
  };

  knowledgeDescVi: { [key: string]: string } = {
    'vnt-materials':
      'Bảng quy đổi mã vật liệu quốc tế sang mã VNT + bảng lượng riêng',
    'vnt-heat-treat': 'Bảng mã xử lý nhiệt Nhật Bản + tiêu chuẩn HRC VNT',
    'vnt-surface': 'Bảng mã xử lý bề mặt Nhật Bản + tiêu chuẩn độ dày anod',
    'vnt-shapes': 'Bảng phân loại hình dạng + phương án gia công VNT',
    'vnt-knowledge': 'Bảng lượng riêng vật liệu + mã qui trình VNT',
  };

  varToKb: { [key: string]: string } = {
    MATERIAL: 'vnt-materials',
    HEAT_TREAT: 'vnt-heat-treat',
    SURFACE: 'vnt-surface',
    SHAPE: 'vnt-shapes',
    VNT_KNOWLEDGE: 'vnt-knowledge',
  };

  knowledgeVars = new Set([
    'MATERIAL',
    'HEAT_TREAT',
    'SURFACE',
    'SHAPE',
    'VNT_KNOWLEDGE',
  ]);

  kbVarLabels: { [key: string]: string } = {
    MATERIAL: 'Bảng quy đổi vật liệu quốc tế → mã VNT',
    HEAT_TREAT: 'Bảng xử lý nhiệt Nhật Bản + tiêu chuẩn HRC',
    SURFACE: 'Bảng xử lý bề mặt Nhật Bản + độ dày anod',
    SHAPE: 'Bảng phân loại hình dạng + phương án gia công',
    VNT_KNOWLEDGE: 'Bảng lượng riêng + mã qui trình VNT',
  };

  // Sample values for test panel
  sampleValues: { [key: string]: string } = {
    DRAWING_SCHEMA: '{\\n  "ban_ve": { "ma_ban_ve": "string" }\\n}',
    MATERIAL: 'AlCu4MgSi→A2017 | AL6061→A6061\\nS45C→S45C',
    HEAT_TREAT: '焼入れ焼戻し→Nhiệt toàn phần | 浸炭焼入れ→Tôi cứng bề mặt',
    SURFACE: '白アルマイト→Anod trắng | 黒染め→Nhuộm đen',
    SHAPE: 'Đường kính ngoài→Tiện CNC ngoài | Mặt phẳng→Phay CNC mặt',
    VNT_KNOWLEDGE: 'A2017=2.8 g/cm³ | QT1xx→Tiện CNC',
    emailFrom: 'tanaka@example.jp',
    emailSubject: '見積依頼 — 精密部品見積もり',
    emailAttachments: 'drawing.pdf',
    emailBody: 'いつもお世話になっております。\\n見積依頼いたします。',
    CURRENT_JSON: '{"ban_ve":{"ma_ban_ve":"BV-001"}}',
    USER_REQUEST: 'Đổi vật liệu thành SUS304',
  };

  constructor(
    private mekongAiService: MekongAiService,
    private messageService: MessageService
  ) {}

  @ViewChild('csvInput') csvInput!: ElementRef;

  triggerImportCsv(): void {
    this.csvInput.nativeElement.click();
  }

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    try {
      const [templates, knowledgeList, config] = await Promise.all([
        this.mekongAiService.getPromptTemplates(),
        this.mekongAiService.getKnowledgeBlocks(),
        this.mekongAiService.getAiProviderConfig(),
      ]);

      this.prompts = templates.map((template) => ({
        id: template.key,
        name: this.labelVi(template.key, template.name),
        version: template.active_version ? `v${template.active_version}` : '—',
        active: !!template.active_version,
        variables: template.variables || [],
        description: this.descVi(template.key, template.description || ''),
        active_version: template.active_version,
      }));

      this.knowledgeItems = knowledgeList.map((knowledgeItem) => ({
        id: knowledgeItem.key,
        name: this.labelVi(knowledgeItem.key, knowledgeItem.name),
        active: !!knowledgeItem.updated_at,
        updatedAt: knowledgeItem.updated_at
          ? new Date(knowledgeItem.updated_at)
          : new Date(),
        content: knowledgeItem.content || '',
        format: (knowledgeItem.format as 'text' | 'table') || 'text',
        headers: knowledgeItem.headers || [
          'Nhóm',
          'Mã gốc',
          'Mã VNT',
          'Ghi chú',
        ],
        rows: knowledgeItem.rows || [],
        updated_at: knowledgeItem.updated_at,
      }));

      // Initialize kbNames map
      this.kbNames = {};
      for (const knowledgeBlock of this.knowledgeItems) {
        this.kbNames[knowledgeBlock.id] = knowledgeBlock.name;
      }

      if (config) {
        // Nếu config có model cụ thể thì dùng, không thì infer từ provider
        if (config.model && config.model.trim()) {
          this.selectedModel = config.model.trim();
        } else {
          this.selectedModel = config.provider === 'gemini' ? 'gemini-3.1-pro-preview' : 'claude-sonnet-4-7';
        }
      }
    } catch (e: any) {
      this.showToast('Không tải được cấu hình: ' + e.message, 'error');
    }
  }

  // Label helpers
  labelVi(key: string, fallback: string): string {
    return this.promptLabelsVi[key] || this.knowledgeLabelsVi[key] || fallback;
  }

  descVi(key: string, fallback: string): string {
    return this.promptDescVi[key] || this.knowledgeDescVi[key] || fallback;
  }

  // View methods
  showOverview(): void {
    this.currentView = { type: 'overview' };
    this.currentPromptKey = null;
    this.selectedKnowledgeKey = null;
  }

  async showPrompt(key: string): Promise<void> {
    this.currentView = { type: 'prompt', key };
    this.currentPromptKey = key;
    this.selectedKnowledgeKey = null;
    this.showTestPanel = false;

    const template = this.prompts.find((p) => p.id === key);
    if (!template) return;

    // Load versions
    const versions = await this.mekongAiService.getPromptVersions(key);
    this.promptVersions = versions;
    this.promptVersionOptions = versions.map((pv) => {
      const star = pv.is_active ? ' ★ đang chạy' : '';
      const note = pv.note ? pv.note : 'không ghi chú';
      const by = pv.created_by || 'admin';
      return {
        label: `v${pv.version} — ${note} (${by})${star}`,
        value: pv.version,
      };
    });

    // Determine content — follow gốc logic: ưu tiên active_version
    let content = '';
    if (template.active_version) {
      const activeRow = versions.find(
        (pv) => pv.version === template.active_version
      );
      content = activeRow?.content || '';
    }
    // Fallback: lấy version đầu tiên
    if (!content && versions.length > 0) {
      content = versions[0].content || '';
    }

    // Fallback: gọi testPrompt để lấy nội dung từ file
    if (!content) {
      try {
        const testResult = await this.mekongAiService.testPrompt(key, {});
        content = testResult?.content || '';
      } catch {
        /* silent */
      }
    }

    this.editorContent = content;
    this.selectedNote = '';

    if (this.promptVersionOptions.length > 0) {
      this.selectedVersion = this.promptVersionOptions[0].value;
      this.fileMode = false;
    } else {
      this.selectedVersion = null;
      this.fileMode = true;
    }

    // Detect variables
    this.availableVariables = this.detectVars(content);

    // Build kbNames map
    this.kbNames = {};
    for (const varName of this.availableVariables) {
      const kbKey = this.varToKb[varName];
      if (kbKey) {
        const knowledgeBlock = this.knowledgeItems.find(
          (kb) => kb.id === kbKey
        );
        this.kbNames[varName] = knowledgeBlock?.name || kbKey;
      }
    }

    // Set computed properties
    this.currentPromptName = this.labelVi(key, template.name);
    this.currentPromptDesc = this.descVi(key, template.description || '');
    this.runtimeVersionLabel = template.active_version
      ? `Runtime đang dùng: v${template.active_version} · ${versions.length} phiên bản trong CSDL`
      : `Runtime: tệp mặc định · ${versions.length} phiên bản trong CSDL`;
  }

  showKnowledge(key: string): void {
    this.currentView = { type: 'knowledge', key };
    this.currentPromptKey = key;
    this.selectedKnowledgeKey = key;

    const knowledgeBlock = this.knowledgeItems.find((kb) => kb.id === key);
    if (!knowledgeBlock) return;

    this.selectedKnowledgeName = this.labelVi(key, knowledgeBlock.name);
    this.selectedKnowledgeDesc = this.descVi(key, '');
    this.knowledgeHeaders = knowledgeBlock.headers
      ? [...knowledgeBlock.headers]
      : ['Nhóm', 'Mã gốc', 'Mã VNT', 'Ghi chú'];
    this.knowledgeRows = knowledgeBlock.rows ? [...knowledgeBlock.rows] : [];

    if (knowledgeBlock.updatedAt) {
      this.knowledgeUpdatedAt = knowledgeBlock.updatedAt;
      this.knowledgeUpdatedAtFormatted = this.formatDate(
        knowledgeBlock.updatedAt
      );
    } else {
      this.knowledgeUpdatedAt = null;
      this.knowledgeUpdatedAtFormatted = '';
    }
  }

  // Variable detection
  detectVars(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
  }

  detectVarType(name: string): 'knowledge' | 'schema' | 'prompt' {
    if (this.knowledgeVars.has(name)) return 'knowledge';
    if (
      [
        'DRAWING_SCHEMA',
        'CURRENT_JSON',
        'USER_REQUEST',
        'emailFrom',
        'emailSubject',
        'emailBody',
        'emailAttachments',
      ].includes(name)
    ) {
      return 'schema';
    }
    return 'prompt';
  }

  getKbForVar(varName: string): KnowledgeItem | undefined {
    const kbKey = this.varToKb[varName];
    return kbKey
      ? this.knowledgeItems.find((kb) => kb.id === kbKey)
      : undefined;
  }

  getSampleValue(varName: string): string {
    return this.sampleValues[varName] || `Ví dụ cho {{${varName}}}`;
  }

  // Actions
  markDirty(): void {
    this.isDirty = true;
  }

  insertVariable(varName: string): void {
    // Insert at cursor position — simplified: append to end
    this.editorContent = this.editorContent + '{{' + varName + '}}';
    this.markDirty();
  }

  async onVersionChange(): Promise<void> {
    if (this.selectedVersion === null) return;

    // Tìm version được chọn
    const selectedVersionRow = this.promptVersions.find(
      (pv) => pv.version === this.selectedVersion
    );
    if (selectedVersionRow) {
      this.editorContent = selectedVersionRow.content || '';
    }
    // Re-detect variables cho version mới
    this.availableVariables = this.detectVars(this.editorContent);
    // Rebuild kbNames
    this.kbNames = {};
    for (const varName of this.availableVariables) {
      const kbKey = this.varToKb[varName];
      if (kbKey) {
        const knowledgeBlock = this.knowledgeItems.find(
          (kb) => kb.id === kbKey
        );
        this.kbNames[varName] = knowledgeBlock?.name || kbKey;
      }
    }
  }

  // Version button sync
  canDeleteVersion(): boolean {
    if (this.fileMode || this.selectedVersion === null) return false;
    return this.promptVersions.length > 1;
  }

  canActivateVersion(): boolean {
    if (this.fileMode) return false;
    if (this.selectedVersion === null) return false;
    const template = this.prompts.find((p) => p.id === this.currentPromptKey);
    return this.selectedVersion !== template?.active_version;
  }

  // Save prompt
  async savePromptChanges(): Promise<void> {
    if (!this.currentPromptKey || !this.editorContent.trim()) {
      this.showToast('Nội dung không được để trống', 'warn');
      return;
    }

    try {
      if (this.fileMode || this.selectedVersion === null) {
        await this.mekongAiService.createPromptVersion(
          this.currentPromptKey,
          this.editorContent,
          this.selectedNote || 'Phiên bản mới',
          false
        );
        this.showToast('Đã tạo phiên bản mới', 'success');
      } else {
        await this.mekongAiService.updatePromptVersion(
          this.currentPromptKey,
          this.selectedVersion,
          this.editorContent,
          this.selectedNote || ''
        );
        this.showToast(
          `Đã lưu thay đổi cho v${this.selectedVersion}`,
          'success'
        );
      }

      this.isDirty = false;
      this.selectedNote = '';
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);
    } catch (e: any) {
      this.showToast('Lưu thất bại: ' + e.message, 'error');
    }
  }

  async createNewVersion(activate: boolean): Promise<void> {
    if (!this.currentPromptKey || !this.editorContent.trim()) {
      this.showToast('Nội dung không được để trống', 'warn');
      return;
    }

    let note = this.selectedNote.trim();
    if (!note) {
      note = activate
        ? 'Phiên bản mới (kích hoạt)'
        : 'Phiên bản mới (bản nháp)';
    }

    try {
      const result = await this.mekongAiService.createPromptVersion(
        this.currentPromptKey,
        this.editorContent,
        note,
        activate
      );

      this.isDirty = false;
      this.selectedNote = '';
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);

      if (result?.activated) {
        this.showToast(`Đã tạo v${result.version} (đã kích hoạt)`, 'success');
      } else {
        this.showToast(
          `Đã tạo v${result?.version || ''} (chưa kích hoạt)`,
          'success'
        );
      }
    } catch (e: any) {
      this.showToast('Tạo phiên bản thất bại: ' + e.message, 'error');
    }
  }

  async activateVersion(): Promise<void> {
    if (!this.currentPromptKey || this.selectedVersion === null) return;

    try {
      await this.mekongAiService.activatePromptVersion(
        this.currentPromptKey,
        this.selectedVersion
      );
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);
      this.showToast(
        `Đang dùng v${this.selectedVersion} cho runtime`,
        'success'
      );
    } catch (e: any) {
      this.showToast('Kích hoạt thất bại: ' + e.message, 'error');
    }
  }

  async deleteVersion(): Promise<void> {
    if (!this.currentPromptKey || this.selectedVersion === null) return;
    if (
      !confirm(
        `Xóa vĩnh viễn phiên bản v${this.selectedVersion}? Thao tác không hoàn tác.`
      )
    )
      return;

    try {
      await this.mekongAiService.deletePromptVersion(
        this.currentPromptKey,
        this.selectedVersion
      );
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);
      this.showToast(`Đã xóa phiên bản v${this.selectedVersion}`, 'success');
    } catch (e: any) {
      this.showToast('Xóa thất bại: ' + e.message, 'error');
    }
  }

  // Debug panel
  toggleTestPanel(): void {
    this.showTestPanel = !this.showTestPanel;
    if (this.showTestPanel) {
      this.debugContent = '';
      this.debugFiles = [];
      this.debugResponse = '';
      this.debugPayload = '';
    }
  }

  isDrawingPrompt(): boolean {
    return this.currentPromptKey === 'gemini-drawing';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        if (!this.debugFiles.some(f => f.name === file.name && f.size === file.size)) {
          this.debugFiles.push(file);
        }
      }
      input.value = '';
    }
  }

  clearFile(): void {
    this.debugFiles = [];
  }

  removeFile(index: number): void {
    this.debugFiles.splice(index, 1);
  }

  async runAiTest(): Promise<void> {
    if (!this.currentPromptKey) return;

    // Validate
    if (this.isDrawingPrompt()) {
      if (!this.debugFiles.length) {
        this.showToast('Cần upload ít nhất 1 file PDF để debug', 'warn');
        return;
      }
    } else {
      if (!this.debugContent.trim()) {
        this.showToast('Cần nhập nội dung để debug', 'warn');
        return;
      }
    }

    this.isRunningAi = true;
    this.debugResponse = '';
    this.debugPayload = '';

    try {
      let result;
      if (this.isDrawingPrompt()) {
        result = await this.mekongAiService.debugPromptFile(
          this.currentPromptKey,
          this.debugFiles
        );
      } else {
        result = await this.mekongAiService.debugPrompt(
          this.currentPromptKey,
          this.debugContent
        );
      }

      // Drawing prompts: multi-file response
      if (this.isDrawingPrompt()) {
        const results = result?.results ?? [];
        const formatted = results.map((r: any) => ({
          filename: r.filename,
          success: r.success,
          data: r.data ?? null,
          error: r.error ?? null,
        }));
        this.debugResponse = JSON.stringify(formatted, null, 2);
        // Set payload panel from first file's request_payload
        const firstPayload = results[0]?.request_payload;
        if (firstPayload) {
          this.debugPayload = JSON.stringify(firstPayload, null, 2);
        }
        return;
      }

      // Text/chat prompts: single result
      // Extract request payload
      const aiResult = result?.result;
      if (aiResult) {
        const payload =
          (aiResult as any).request_payload ||
          (aiResult as any)._ai_request_payload ||
          null;
        if (payload) {
          this.debugPayload = JSON.stringify(payload, null, 2);
        }
      }

      // Extract response data
      if (result?.result) {
        const resultData = result.result;
        if (resultData?.success === false) {
          this.debugResponse = 'Lỗi: ' + (resultData.error || 'Không rõ lỗi');
        } else if (typeof resultData === 'object') {
          // Strip payload from display
          const {
            request_payload: _p,
            _ai_request_payload: _a,
            ...displayData
          } = resultData as any;
          this.debugResponse = JSON.stringify(displayData, null, 2);
        } else {
          this.debugResponse = String(resultData);
        }
      } else if (result?.error) {
        this.debugResponse = 'Lỗi: ' + result.error;
      } else {
        this.debugResponse = '(trống)';
      }
    } catch (e: any) {
      this.debugResponse = 'Lỗi: ' + e.message;
    } finally {
      this.isRunningAi = false;
    }
  }

  // Knowledge table methods
  addKnowledgeRow(): void {
    // Create empty row with all possible fields set to ''
    const row: KnowledgeRow = {
      group: '', from: '', to: '', note: '',
      market: '', ten: '', gioi_tien: '', email: '',
      ngon_ngu: '', tien_te: '',
      vat_lieu: '', khoi_luong: '', don_vi: '',
    };
    this.knowledgeRows.push(row);
  }

  deleteKnowledgeRow(index: number): void {
    this.knowledgeRows.splice(index, 1);
  }

  selectAllRows: boolean = false;

  toggleSelectAll(): void {
    this.selectAllRows = !this.selectAllRows;
  }

  get isAllSelected(): boolean {
    return (
      this.knowledgeRows.length > 0 &&
      this.knowledgeRows.every((row) => (row as any)._selected)
    );
  }

  get selectedRowCount(): number {
    return this.knowledgeRows.filter((row) => (row as any)._selected).length;
  }

  deleteSelectedRows(): void {
    if (this.selectedRowCount === 0) {
      this.showToast('Chọn ít nhất 1 dòng để xóa', 'warn');
      return;
    }
    if (!confirm(`Xóa ${this.selectedRowCount} dòng đã chọn?`)) return;
    this.knowledgeRows = this.knowledgeRows.filter(
      (row) => !(row as any)._selected
    );
    // Reset selectAll state
    const remaining = this.knowledgeRows.filter(
      (row) => (row as any)._selected
    );
    if (remaining.length === 0) {
      this.selectAllRows = false;
    }
  }

  async saveKnowledge(): Promise<void> {
    if (!this.selectedKnowledgeKey) return;

    const headers = [...this.knowledgeHeaders];
    const rows = [...this.knowledgeRows];
    const textContent = this.renderKbToText(headers, rows);

    try {
      await this.mekongAiService.saveKnowledgeBlock(this.selectedKnowledgeKey, {
        format: 'table',
        headers,
        rows,
        content: textContent,
      });

      await this.loadAll();
      this.showKnowledge(this.selectedKnowledgeKey);
      this.showToast('Đã lưu: ' + this.selectedKnowledgeKey, 'success');
    } catch (e: any) {
      this.showToast('Lưu thất bại: ' + e.message, 'error');
    }
  }

  // ── Header → field mapping cho knowledge table ─────────────────────────────────
  // Mỗi header name → field name trong KnowledgeRow
  private readonly HEADER_FIELD_MAP: { [header: string]: keyof KnowledgeRow } =
    {
      // generic / material / surface
      Nhóm: 'group',
      'Nhóm vật liệu': 'group',
      'Nhóm xử lý': 'group',
      'Loại phôi': 'group',
      'Mã gốc': 'from',
      'Mã gốc (quốc tế)': 'from',
      'Ký hiệu gốc': 'from',
      'Đặc điểm': 'from',
      'Ký hiệu Nhật': 'from',
      'Ký hiệu': 'from',
      'Mã VNT': 'to',
      'Kết quả VNT': 'to',
      'Phương án gia công': 'to',
      'Tên tiếng Việt': 'to',
      'Giá trị': 'to',
      'Ghi chú': 'note',
      // vnt-markets
      'Thị trường': 'market',
      'Tên': 'ten',
      'Giới tiền': 'gioi_tien',
      'Khu vực': 'gioi_tien',
      'Email': 'email',
      'Ngôn ngữ': 'ngon_ngu',
      'Đơn vị tiền tệ': 'tien_te',
      'Tiền tệ': 'tien_te',
      // vnt-materials
      'Khối lượng': 'khoi_luong',
      'Đơn vị': 'don_vi',
    };

  getKbCellVal(header: string, row: KnowledgeRow): string {
    const field = this.HEADER_FIELD_MAP[header] as
      | keyof KnowledgeRow
      | undefined;
    if (!field) return '';
    const val = row[field];
    return typeof val === 'string' ? val : '';
  }

  setKbCellVal(header: string, row: KnowledgeRow, value: string): void {
    const field = this.HEADER_FIELD_MAP[header] as
      | keyof KnowledgeRow
      | undefined;
    if (!field) return;
    (row as any)[field] = value;
  }

  onCellChange(rowIndex: number, colIndex: number, value: string): void {
    const row = this.knowledgeRows[rowIndex];
    if (!row) return;
    if (colIndex === 0) row.group = value;
    else if (colIndex === 1) row.from = value;
    else if (colIndex === 2) row.to = value;
    else row.note = value;
  }

  renderKbToText(headers: string[], rows: KnowledgeRow[]): string {
    if (!rows.length) return '';
    const lines: string[] = [];
    lines.push(headers.join(' | '));
    lines.push(headers.map(() => '---').join(' | '));
    for (const knowledgeRow of rows) {
      const vals = headers.map((h) => {
        const field = this.HEADER_FIELD_MAP[h];
        if (!field) return '';
        const val = (knowledgeRow as any)[field];
        return typeof val === 'string' ? val : '';
      });
      lines.push(vals.join(' | '));
    }
    return lines.join('\n');
  }

  exportCsv(): void {
    if (!this.knowledgeRows.length) {
      this.showToast('Không có dữ liệu để export', 'warn');
      return;
    }

    const lines: string[] = [];
    lines.push(this.knowledgeHeaders.map(h => `"${h}"`).join(','));
    for (const knowledgeRow of this.knowledgeRows) {
      const vals = this.knowledgeHeaders.map((h) => {
        const field = this.HEADER_FIELD_MAP[h];
        if (!field) return '""';
        const val = String((knowledgeRow as any)[field] || '').replace(/"/g, '""');
        return `"${val}"`;
      });
      lines.push(vals.join(','));
    }

    const blob = new Blob(['\ufeff' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.selectedKnowledgeKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`Đã export ${this.knowledgeRows.length} dòng`, 'success');
  }

  importCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = (text || '').split(/\r?\n/);
      let addedCount = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const cols = trimmed
          .split(',')
          .map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        if (cols.length < 2) continue;

        // Build row dynamically based on current headers
        const row: any = {};
        this.knowledgeHeaders.forEach((h, i) => {
          const field = this.HEADER_FIELD_MAP[h];
          if (field) row[field] = cols[i] || '';
        });
        this.knowledgeRows.push(row as KnowledgeRow);
        addedCount++;
      }
      this.showToast(`Đã thêm ${addedCount} dòng từ CSV`, 'success');
    };
    reader.readAsText(file);
    input.value = '';
  }

  // Inline header edit
  editingHeaderIndex: number | null = null;
  editingHeaderValue: string = '';

  startEditHeader(index: number, currentValue: string): void {
    this.editingHeaderIndex = index;
    this.editingHeaderValue = currentValue;
  }

  saveHeaderEdit(): void {
    if (this.editingHeaderIndex !== null) {
      this.knowledgeHeaders[this.editingHeaderIndex] = this.editingHeaderValue;
      this.editingHeaderIndex = null;
      this.editingHeaderValue = '';
    }
  }

  cancelHeaderEdit(): void {
    this.editingHeaderIndex = null;
    this.editingHeaderValue = '';
  }

  // Model
  async onModelChange(): Promise<void> {
    try {
      const model = this.selectedModel.trim();
      const provider = model.startsWith('gemini') ? 'gemini' : 'claude';
      await this.mekongAiService.updateAiProvider(provider, model);
      const display = this.aiModelOptions.find(o => o.value === model)?.label ?? model;
      this.showToast(`Đã đổi sang ${display}`, 'success');
    } catch (e: any) {
      this.showToast('Lỗi: ' + e.message, 'error');
    }
  }

  getProviderIcon(): string {
    return this.selectedModel.startsWith('gemini') ? '☁' : '💬';
  }

  // Helpers
  formatDate(date: Date | string | undefined): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  getPromptVariables(key: string): string[] {
    const template = this.prompts.find((p) => p.id === key);
    return template?.variables || [];
  }

  isKnowledgeVar(name: string): boolean {
    return this.knowledgeVars.has(name);
  }

  showToast(
    message: string,
    severity: 'success' | 'error' | 'warn' | 'info'
  ): void {
    this.messageService.add({ severity, summary: message, life: 3500 });
  }

  backToOverview(): void {
    this.currentView = { type: 'overview' };
  }
}
