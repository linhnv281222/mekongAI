import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MekongAiService } from 'src/app/pages/mekong-ai/mekong-ai.service';
import { MessageService } from 'primeng/api';

interface ViewState {
  type: 'overview' | 'prompt' | 'knowledge';
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
}

interface TestVariable {
  name: string;
  value: string;
}

@Component({
  selector: 'app-admin-prompts',
  templateUrl: './admin-prompts.component.html',
  styleUrls: ['./admin-prompts.component.css']
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
  selectedModel: string = 'claude';
  fileMode: boolean = false;

  // Test panel state
  showTestPanel: boolean = false;
  testVariables: TestVariable[] = [];
  testOutput: string = '';
  isRunningTest: boolean = false;

  // PrimeNG options
  aiModelOptions = [
    { label: 'Claude', value: 'claude' },
    { label: 'Gemini', value: 'gemini' }
  ];
  promptVersionOptions: { label: string; value: number }[] = [];
  availableVariables: string[] = [];

  // Labels mapping
  promptLabelsVi: { [key: string]: string } = {
    'drawing-system': 'Phân tích bản vẽ — Prompt hệ thống',
    'drawing-correction': 'Sửa kết quả phân tích — Prompt hệ thống',
    'email-classify': 'Phân loại email — Prompt',
    'gemini-drawing': 'Phân tích bản vẽ (Gemini) — Prompt',
  };

  knowledgeLabelsVi: { [key: string]: string } = {
    'vnt-materials': 'Bảng quy đổi vật liệu VNT',
    'vnt-heat-treat': 'Bảng xử lý nhiệt VNT',
    'vnt-surface': 'Bảng xử lý bề mặt VNT',
    'vnt-shapes': 'Bảng phân loại hình dạng VNT',
    'vnt-knowledge': 'Kiến thức nội bộ VNT (Gemini)',
  };

  promptDescVi: { [key: string]: string } = {
    'drawing-system': 'Prompt hệ thống chính cho Claude Sonnet 4.6 — phân tích bản vẽ',
    'drawing-correction': 'Prompt hệ thống cho chỉnh sửa kết quả phân tích qua chat',
    'email-classify': 'Prompt phân loại email đến (Haiku)',
    'gemini-drawing': 'Prompt phân tích bản vẽ dự phòng bằng Gemini 2.5',
  };

  knowledgeDescVi: { [key: string]: string } = {
    'vnt-materials': 'Quy đổi tiêu chuẩn vật liệu (DIN/AISI/JIS) sang mã JIS nội bộ VNT',
    'vnt-heat-treat': 'Ký hiệu xử lý nhiệt (JP/EN/FR) sang tên tiếng Việt VNT',
    'vnt-surface': 'Ký hiệu xử lý bề mặt (JP/EN) sang tên tiếng Việt VNT',
    'vnt-shapes': 'Phân loại phôi và hướng gia công',
    'vnt-knowledge': 'Tóm tắt kiến thức cho bộ phân tích Gemini dự phòng',
  };

  varToKb: { [key: string]: string } = {
    'MATERIAL': 'vnt-materials',
    'HEAT_TREAT': 'vnt-heat-treat',
    'SURFACE': 'vnt-surface',
    'SHAPE': 'vnt-shapes',
    'VNT_KNOWLEDGE': 'vnt-knowledge',
  };

  knowledgeVars = new Set(['MATERIAL', 'HEAT_TREAT', 'SURFACE', 'SHAPE', 'VNT_KNOWLEDGE']);

  kbVarLabels: { [key: string]: string } = {
    'MATERIAL': 'Bảng quy đổi mã vật liệu quốc tế → mã VNT',
    'HEAT_TREAT': 'Bảng ký hiệu xử lý nhiệt → tên tiếng Việt VNT',
    'SURFACE': 'Bảng ký hiệu xử lý bề mặt → tên tiếng Việt VNT',
    'SHAPE': 'Bảng phân loại hình dạng phôi & phương án gia công',
    'VNT_KNOWLEDGE': 'Bảng lượng riêng, mã vật liệu, hình dạng, mã qui trình',
  };

  // Sample values for test panel
  sampleValues: { [key: string]: string } = {
    'DRAWING_SCHEMA': '{\\n  "ban_ve": { "ma_ban_ve": "string" }\\n}',
    'VNT_MAT': 'NHOM: AlCu4MgSi→A2017 | AL6061→A6061\\nTHEP: S45C→S45C',
    'VNT_NHIET': 'NHIET TOAN PHAN: 焼入れ焼戻し→Nhiệt toàn phần [HRC...]',
    'VNT_BM': 'ANOD NHOM: 白アルマイト→Anod trang',
    'VNT_HINH': 'Phi tron dac→Tien CNC',
    'VNT_KNOWLEDGE': 'BANGLUONGRIENG: A2017=2.8\\nVATLIEU: AL6061→A6061',
    'emailFrom': 'tanaka@example.jp',
    'emailSubject': '見積依頼 — 精密部品見積もり',
    'emailAttachments': 'drawing.pdf',
    'emailBody': 'いつもお世話になっております。\\n見積依頼いたします。',
    'CURRENT_JSON': '{"ban_ve":{"ma_ban_ve":"BV-001"}}',
    'USER_REQUEST': 'Đổi vật liệu thành SUS304',
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
        this.mekongAiService.getAiProviderConfig()
      ]);

      this.prompts = templates.map(t => ({
        id: t.key,
        name: this.labelVi(t.key, t.name),
        version: t.active_version ? `v${t.active_version}` : '—',
        active: !!t.active_version,
        variables: t.variables || [],
        description: this.descVi(t.key, t.description || ''),
        active_version: t.active_version,
      }));

      this.knowledgeItems = knowledgeList.map(k => ({
        id: k.key,
        name: this.labelVi(k.key, k.name),
        active: !!k.updated_at,
        updatedAt: k.updated_at ? new Date(k.updated_at) : new Date(),
        content: k.content || '',
        format: k.format as 'text' | 'table' || 'text',
        headers: k.headers || ['Nhóm', 'Mã gốc', 'Mã VNT', 'Ghi chú'],
        rows: k.rows || [],
        updated_at: k.updated_at,
      }));

      // Initialize kbNames map
      this.kbNames = {};
      for (const kb of this.knowledgeItems) {
        this.kbNames[kb.id] = kb.name;
      }

      if (config) {
        this.selectedModel = config.provider === 'gemini' ? 'gemini' : 'claude';
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
    this.testOutput = '';

    const tpl = this.prompts.find(t => t.id === key);
    if (!tpl) return;

    // Load versions
    const versions = await this.mekongAiService.getPromptVersions(key);
    this.promptVersions = versions;
    this.promptVersionOptions = versions.map(v => {
      const star = v.is_active ? ' ★ đang chạy' : '';
      const note = v.note ? v.note : 'không ghi chú';
      const by = v.created_by || 'admin';
      return {
        label: `v${v.version} — ${note} (${by})${star}`,
        value: v.version
      };
    });

    // Determine content — follow gốc logic: ưu tiên active_version
    let content = '';
    if (tpl.active_version) {
      const activeRow = versions.find(v => v.version === tpl.active_version);
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
      } catch { /* silent */ }
    }

    this.editorContent = content;
    this.selectedNote = '';
    this.testVariables = [];

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
    for (const v of this.availableVariables) {
      const kbKey = this.varToKb[v];
      if (kbKey) {
        const kb = this.knowledgeItems.find(k => k.id === kbKey);
        this.kbNames[v] = kb?.name || kbKey;
      }
    }

    // Set computed properties
    this.currentPromptName = this.labelVi(key, tpl.name);
    this.currentPromptDesc = this.descVi(key, tpl.description || '');
    this.runtimeVersionLabel = tpl.active_version
      ? `Runtime đang dùng: v${tpl.active_version} · ${versions.length} phiên bản trong CSDL`
      : `Runtime: tệp mặc định · ${versions.length} phiên bản trong CSDL`;
  }

  showKnowledge(key: string): void {
    this.currentView = { type: 'knowledge', key };
    this.currentPromptKey = key;
    this.selectedKnowledgeKey = key;

    const kb = this.knowledgeItems.find(k => k.id === key);
    if (!kb) return;

    this.selectedKnowledgeName = this.labelVi(key, kb.name);
    this.selectedKnowledgeDesc = this.descVi(key, '');
    this.knowledgeHeaders = kb.headers ? [...kb.headers] : ['Nhóm', 'Mã gốc', 'Mã VNT', 'Ghi chú'];
    this.knowledgeRows = kb.rows ? [...kb.rows] : [];

    if (kb.updatedAt) {
      this.knowledgeUpdatedAt = kb.updatedAt;
      this.knowledgeUpdatedAtFormatted = this.formatDate(kb.updatedAt);
    } else {
      this.knowledgeUpdatedAt = null;
      this.knowledgeUpdatedAtFormatted = '';
    }
  }

  // Variable detection
  detectVars(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  }

  detectVarType(name: string): 'knowledge' | 'schema' | 'prompt' {
    if (this.knowledgeVars.has(name)) return 'knowledge';
    if (['DRAWING_SCHEMA', 'CURRENT_JSON', 'USER_REQUEST', 'emailFrom', 'emailSubject', 'emailBody', 'emailAttachments'].includes(name)) {
      return 'schema';
    }
    return 'prompt';
  }

  getKbForVar(varName: string): KnowledgeItem | undefined {
    const kbKey = this.varToKb[varName];
    return kbKey ? this.knowledgeItems.find(k => k.id === kbKey) : undefined;
  }

  getSampleValue(v: string): string {
    return this.sampleValues[v] || `Ví dụ cho {{${v}}}`;
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
    const row = this.promptVersions.find(v => v.version === this.selectedVersion);
    if (row) {
      this.editorContent = row.content || '';
    }
    // Re-detect variables cho version mới
    this.availableVariables = this.detectVars(this.editorContent);
    // Rebuild kbNames
    this.kbNames = {};
    for (const v of this.availableVariables) {
      const kbKey = this.varToKb[v];
      if (kbKey) {
        const kb = this.knowledgeItems.find(k => k.id === kbKey);
        this.kbNames[v] = kb?.name || kbKey;
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
    const tpl = this.prompts.find(t => t.id === this.currentPromptKey);
    return this.selectedVersion !== tpl?.active_version;
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
        this.showToast(`Đã lưu thay đổi cho v${this.selectedVersion}`, 'success');
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
      note = activate ? 'Phiên bản mới (kích hoạt)' : 'Phiên bản mới (bản nháp)';
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
        this.showToast(`Đã tạo v${result?.version || ''} (chưa kích hoạt)`, 'success');
      }
    } catch (e: any) {
      this.showToast('Tạo phiên bản thất bại: ' + e.message, 'error');
    }
  }

  async activateVersion(): Promise<void> {
    if (!this.currentPromptKey || this.selectedVersion === null) return;

    try {
      await this.mekongAiService.activatePromptVersion(this.currentPromptKey, this.selectedVersion);
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);
      this.showToast(`Đang dùng v${this.selectedVersion} cho runtime`, 'success');
    } catch (e: any) {
      this.showToast('Kích hoạt thất bại: ' + e.message, 'error');
    }
  }

  async deleteVersion(): Promise<void> {
    if (!this.currentPromptKey || this.selectedVersion === null) return;
    if (!confirm(`Xóa vĩnh viễn phiên bản v${this.selectedVersion}? Thao tác không hoàn tác.`)) return;

    try {
      await this.mekongAiService.deletePromptVersion(this.currentPromptKey, this.selectedVersion);
      await this.loadAll();
      await this.showPrompt(this.currentPromptKey);
      this.showToast(`Đã xóa phiên bản v${this.selectedVersion}`, 'success');
    } catch (e: any) {
      this.showToast('Xóa thất bại: ' + e.message, 'error');
    }
  }

  // Test panel
  toggleTestPanel(): void {
    this.showTestPanel = !this.showTestPanel;
    if (this.showTestPanel) {
      this.buildTestVariables();
    }
  }

  private buildTestVariables(): void {
    const vars = this.detectVars(this.editorContent);
    this.testVariables = vars.map(v => ({
      name: v,
      value: this.getSampleValue(v)
    }));
    this.testOutput = '';
  }

  async runTest(): Promise<void> {
    if (!this.currentPromptKey) return;
    this.isRunningTest = true;
    this.testOutput = '';

    const variables: { [key: string]: string } = {};
    for (const tv of this.testVariables) {
      variables[tv.name] = tv.value;
    }

    try {
      const result = await this.mekongAiService.testPrompt(this.currentPromptKey, variables);
      this.testOutput = result?.content || '(trống)';
    } catch (e: any) {
      this.testOutput = 'Lỗi: ' + e.message;
    } finally {
      this.isRunningTest = false;
    }
  }

  // Knowledge table methods
  addKnowledgeRow(): void {
    this.knowledgeRows.push({ group: '', from: '', to: '', note: '' });
  }

  deleteKnowledgeRow(index: number): void {
    this.knowledgeRows.splice(index, 1);
  }

  selectAllRows: boolean = false;

  toggleSelectAll(): void {
    this.selectAllRows = !this.selectAllRows;
  }

  get isAllSelected(): boolean {
    return this.knowledgeRows.length > 0 && this.knowledgeRows.every(r => (r as any)._selected);
  }

  get selectedRowCount(): number {
    return this.knowledgeRows.filter(r => (r as any)._selected).length;
  }

  deleteSelectedRows(): void {
    if (this.selectedRowCount === 0) {
      this.showToast('Chọn ít nhất 1 dòng để xóa', 'warn');
      return;
    }
    if (!confirm(`Xóa ${this.selectedRowCount} dòng đã chọn?`)) return;
    this.knowledgeRows = this.knowledgeRows.filter(r => !(r as any)._selected);
    // Reset selectAll state
    const remaining = this.knowledgeRows.filter(r => (r as any)._selected);
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
        content: textContent
      });

      await this.loadAll();
      this.showKnowledge(this.selectedKnowledgeKey);
      this.showToast('Đã lưu: ' + this.selectedKnowledgeKey, 'success');
    } catch (e: any) {
      this.showToast('Lưu thất bại: ' + e.message, 'error');
    }
  }

  kbGetCellVal(row: KnowledgeRow, colIndex: number): string {
    switch (colIndex) {
      case 0: return row.group || '';
      case 1: return row.from || '';
      case 2: return row.to || '';
      default: return row.note || '';
    }
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
    for (const r of rows) {
      const vals = [
        r.group || '',
        r.from || '',
        r.to || '',
        r.note || ''
      ];
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
    lines.push(this.knowledgeHeaders.join(','));
    for (const row of this.knowledgeRows) {
      const vals = [
        `"${(row.group || '').replace(/"/g, '""')}"`,
        `"${(row.from || '').replace(/"/g, '""')}"`,
        `"${(row.to || '').replace(/"/g, '""')}"`,
        `"${(row.note || '').replace(/"/g, '""')}"`
      ];
      lines.push(vals.join(','));
    }

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
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
        const cols = trimmed.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        if (cols.length < 2) continue;
        this.knowledgeRows.push({
          group: cols[2] || '',
          from: cols[0] || '',
          to: cols[1] || '',
          note: cols[3] || ''
        });
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
      await this.mekongAiService.updateAiProvider(this.selectedModel);
      this.showToast(`Đã đổi sang ${this.selectedModel === 'gemini' ? 'Gemini' : 'Claude'}`, 'success');
    } catch (e: any) {
      this.showToast('Lỗi: ' + e.message, 'error');
    }
  }

  getProviderIcon(): string {
    return this.selectedModel === 'gemini' ? '☁' : '💬';
  }

  // Helpers
  formatDate(date: Date | string | undefined): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  getPromptVariables(key: string): string[] {
    const tpl = this.prompts.find(t => t.id === key);
    return tpl?.variables || [];
  }

  isKnowledgeVar(name: string): boolean {
    return this.knowledgeVars.has(name);
  }

  showToast(message: string, severity: 'success' | 'error' | 'warn' | 'info'): void {
    this.messageService.add({ severity, summary: message, life: 3500 });
  }
}
