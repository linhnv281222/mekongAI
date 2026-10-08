import {
  AfterViewChecked,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { TreeNode } from 'primeng/api';

import { MekongAiService } from '../../../services/mekong-ai/mekong-ai.service';
import { EmailRow } from '../../../models/mekong-ai/email.model';
import {
  KnowledgeBlock,
  UiCell,
  UiRow,
  UiSchema,
} from '../../../models/mekong-ai/prompt.model';
import { TableResizeService } from '../../../services/mekong-ai/table-resize.service';
import { DrawingLine, drawingToLine } from '../../../shared/utils/drawing.util';
import {
  collectSchemaKeys,
  fmtDDMM,
  fmtDDMMHHmm,
  humanizeClassifyKey,
  inferExtraFieldType,
  mergeAgentIntoInbox,
  parseHanGiaoToDate,
  resolveClassifyValue,
  truthyClassify
} from '../../../shared/utils/email.util';
import { buildEmailTree, filterEmailsByNode } from '../../../shared/utils/tree.util';
import { DemoV3Service } from '../../../services/mekong-ai/demo-v3.service';
import { DrawingVersion, VersionService } from '../../../services/mekong-ai/version.service';
import {
  QuotationData,
  Material,
  MachiningProcess,
  ProductVolume,
} from '../../../models/mekong-ai/quotation.model';

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
  stt: 36,
  ma_ban_ve: 70,
  so_luong: 50,
  hinh_dang: 70,
  xlbm: 80,
  hrc: 70,
  vat_lieu: 75,
  kich_thuoc: 30,
  dung_sai_chung: 90,
  so_be_mat_cnc: 50,
  dung_sai_chat_nhat: 90,
  co_gdt: 50,
  ma_quy_trinh: 65,
  ghi_chu: 105,
};

type ViewTab = 0 | 1 | 2 | 3;
type SplitMode = 'normal' | 'fullLeft' | 'fullRight';

@Component({
  selector: 'app-demo-v3',
  templateUrl: './demo-v3.component.html',
  styleUrls: ['./demo-v3.component.css', './version-panel.css'],
})
export class DemoV3Component implements OnInit, OnDestroy, AfterViewChecked {
  // ── State ─────────────────────────────────────────────────
  emails: EmailRow[] = [];
  activeEmail: EmailRow | null = null;
  searchQuery = '';
  inboxHint = '';
  classifyUiSchema: UiSchema | null = null;
  debugModalOpen = false;
  initialLoading = true;

  // Tree view state
  emailTree: TreeNode[] = [];
  selectedTreeNode: TreeNode | null = null;
  useTreeView = false;

  // Market data from vnt-markets knowledge block (dynamic)
  marketRows: KnowledgeBlock['rows'] = [];

  // Right panel
  currentTab: ViewTab = 0;
  drawingLines: DrawingLine[] = [];
  modifiedDrawingFields: Set<string> = new Set();
  processing = false;
  progress = 0;
  previewData: Uint8Array | null = null;
  previewName: string | null = null;
  previewLoading = false;
  previewPage = 1;
  saving = false;
  pushingErp = false;

  // Quotation data for 4 tabs
  quotationData: QuotationData = {
    general_info: {
      type: '',
      quoting_status: '',
      format: '',
      language: '',
      created_date: undefined,
      creator: '',
      request_time: undefined,
      quote_deadline: undefined,
      has_transport: false,
      transport_method: '',
      surface_treatment: false,
      material: 0,
      vat: false,
      discount: 0,
      vat_value: 0,
      quotation_currency: '',
      exchange_rate: 0,
      lot_number: 0,
      quantity_for_min_price: 0,
      company_code: '',
      company_name: '',
      company_tax: '',
      company_email: '',
      company_contact: '',
      company_phone: '',
      company_fax: '',
      company_address: '',
      company_language: '',
      customer_code: '',
      customer_name: '',
      phone_number: '',
      fax_number: '',
      staff_in_charge: '',
      vietnamese_address: '',
      email: '',
      tax_code: '',
      representative: '',
      unit: '',
      customer_note: '',
      internal_note: '',
      email_content: '',
    },
    materials: [],
    special_machining: {
      wc: false,
      gf: false,
      lf: false,
      han: false,
      cayren: false,
      dongpin: false,
      tool: false,
    },
    machining_coefficients: {},
    product_volumes: [{}],
    product_weight_summary: {},
    machining_processes: [],
  };

  // Version tracking
  drawingVersions: Map<number, DrawingVersion[]> = new Map();
  currentVersionType: 'ai_extracted' | 'user_draft' | 'approved' = 'ai_extracted';
  showVersionHistory = false;
  selectedDrawingIndex: number | null = null;

  // Selected drawing for material tab (F3)
  selectedDrawingForMaterial: number = 0;

  // Column resize — widths from localStorage
  colWidths: Record<string, number> = {};
  private readonly TABLE_KEY = 'demo3_bv';
  private readonly COL_KEYS = ['stt', 'ma_ban_ve', 'so_luong', 'hinh_dang', 'xlbm', 'hrc', 'vat_lieu', 'kich_thuoc', 'ma_quy_trinh', 'ghi_chu', 'dung_sai'];
  // Splitter full-width toggle
  splitMode: SplitMode = 'normal';

  splitterPanelSizes: number[] = [70, 30];

  updateSplitterSizes(): void {
    switch (this.splitMode) {
      case 'fullLeft':
        this.splitterPanelSizes = [100, 0];
        break;
      case 'fullRight':
        this.splitterPanelSizes = [0, 100];
        break;
      default:
        this.splitterPanelSizes = [70, 30];
    }
  }

  // Guide panel
  guideExpanded = sessionStorage.getItem('v3guideExpanded') === '1';
  toastCopy = false;

  // AI Debug - request & response payloads from agent
  aiDebugInfo: {
    classifyRequest: object | null;
    drawingRequest: object | null;
    classifyResponse: object | null;
    drawingResponse: object | null;
  } = {
    classifyRequest: null,
    drawingRequest: null,
    classifyResponse: null,
    drawingResponse: null,
  };

  // ── Lifecycle ─────────────────────────────────────────────

  constructor(
    private svc: DemoV3Service,
    private mekongSvc: MekongAiService,
    private versionSvc: VersionService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private tableResizeSvc: TableResizeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.colWidths = this.tableResizeSvc.load(this.TABLE_KEY);
    await this.loadConfig();

    this.svc.startPolling(
      (agentEmails: EmailRow[]) => {
        this.emails = mergeAgentIntoInbox(agentEmails, this.emails);
        this.rebuildTree();
        if (this.activeEmail?.id) {
          const refreshed = this.emails.find(
            (e) => e.id === this.activeEmail!.id
          );
          if (refreshed) this.activeEmail = refreshed;
        }
        this.initialLoading = false;
        this.cdr.markForCheck();
      },
      (updatedEmail: EmailRow) => {
        this.cdr.markForCheck();
      }
    );

    setTimeout(() => {
      this.initialLoading = false;
      this.cdr.markForCheck();
    }, 8000);

    const jobId = this.route.snapshot.queryParamMap.get('job');
    if (jobId) {
      await this.openJobFromUrl(jobId);
    }
  }

  ngOnDestroy(): void {
    this.svc.stopPolling();
  }

  // ── Init ─────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    const [hint, schema, kbList] = await Promise.all([
      this.svc.loadInboxHint(),
      this.svc.loadClassifyUiSchema(),
      this.mekongSvc.getKnowledgeBlocks(),
    ]);
    this.inboxHint = hint;
    this.classifyUiSchema = schema;
    // Extract market rows from vnt-markets knowledge block
    const marketKb = kbList.find((kb) => kb.key === 'vnt-markets');
    this.marketRows = marketKb?.rows ?? [];
    this.cdr.markForCheck();
  }

  private async openJobFromUrl(jobId: string): Promise<void> {
    const job = await this.svc.loadJobDetail(jobId);
    if (!job) return;
    const partial: EmailRow = {
      id: job.id,
      from: job.sender || 'Agent',
      email: job.sender_email || '',
      subject: job.subject || '',
      preview: '',
      body: '',
      time: '',
      date: fmtDDMMHHmm(job.created_at),
      created_at: job.created_at,
      attachments: job.attachments || [],
      classify: job.classify || '',
      ngon_ngu: job.ngon_ngu || '',
      thi_truong: job.thi_truong || null,
      ten_kh: '',
      ma_khach_hang: null,
      han_giao: null,
      hinh_thuc_giao: null,
      co_van_chuyen: null,
      xu_ly_be_mat: null,
      vat_lieu_chung_nhan: null,
      classify_output: null,
      drawings: [],
      unread: false,
      _agent: true,
      _needLoad: true,
    };
    const full = this.svc.buildFullEmailRow(job, partial);
    this.emails = [
      full,
      ...this.emails.filter((emailItem) => emailItem.id !== full.id),
    ];
    this.activeEmail = full;
    this.loadDrawingLines();

    // Load version counts
    await this.loadAllVersionCounts();

    this.cdr.markForCheck();
  }

  // ── Mailbox ───────────────────────────────────────────────

  get filteredEmails(): EmailRow[] {
    let result = this.emails;

    // Apply tree filter if node selected
    if (this.useTreeView && this.selectedTreeNode) {
      result = filterEmailsByNode(result, this.selectedTreeNode);
    }

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(
        (emailItem) =>
          emailItem.from.toLowerCase().includes(query) ||
          (emailItem.subject || '').toLowerCase().includes(query)
      );
    }

    return result;
  }

  get unreadCount(): number {
    return this.emails.filter((emailItem) => emailItem.unread).length;
  }

  onEmailClick(emailItem: EmailRow): void {
    this.selectEmail(emailItem);
  }

  private async selectEmail(emailItem: EmailRow): Promise<void> {
    this.resetRightPanel();
    this.activeEmail = emailItem;
    this.cdr.markForCheck();

    if (emailItem.id) {
      const job = await this.svc.loadJobDetail(emailItem.id);
      if (!job) return;
      const full = this.svc.buildFullEmailRow(job, emailItem);
      this.emails = this.emails.map((email) =>
        email.id === emailItem.id ? full : email
      );
      this.activeEmail = full;
      this.loadDrawingLines();

      // Map email data to quotation form
      this.mapEmailToQuotation(full);

      // Load version counts for all drawings
      await this.loadAllVersionCounts();
    } else if (this.activeEmail?.drawings?.length) {
      this.loadDrawingLines();
    }

    this.cdr.markForCheck();
  }

  private mapEmailToQuotation(email: EmailRow): void {
    const classify = email.classify_output;

    // Reset quotation data
    this.quotationData = {
      general_info: {
        // Section 1 - Thông tin chung
        type: classify?.loai || '',
        quoting_status: '',
        format: classify?.hinh_thuc_giao || '',
        language: email.ngon_ngu || classify?.ngon_ngu || '',
        created_date: email.created_at ? new Date(email.created_at) : undefined,
        creator: email.from || '',
        request_time: email.created_at ? new Date(email.created_at) : undefined,
        quote_deadline: classify?.han_giao_hang ? this.parseDate(classify.han_giao_hang) :
                       (email.han_giao ? this.parseDate(email.han_giao) : undefined),
        has_transport: classify?.co_van_chuyen ?? false,
        transport_method: classify?.hinh_thuc_giao || '',
        surface_treatment: this.parseSurfaceTreatment(classify?.xu_ly_be_mat),
        material: 0,
        vat: false,
        discount: 0,
        vat_value: 0,
        quotation_currency: 'JPY',
        exchange_rate: 0,
        lot_number: 0,
        quantity_for_min_price: 0,

        // Section 2 - Thông tin công ty
        company_code: '',
        company_name: classify?.ten_cong_ty || '',
        company_tax: '',
        company_email: '',
        company_contact: '',
        company_phone: '',
        company_fax: '',
        company_address: '',
        company_language: email.ngon_ngu || classify?.ngon_ngu || '',

        // Section 3 - Thông tin khách hàng
        customer_code: email.ma_khach_hang || '',
        customer_name: email.ten_kh || email.from || '',
        phone_number: '',
        fax_number: '',
        staff_in_charge: '',
        vietnamese_address: '',
        email: email.email || '',
        tax_code: '',
        representative: '',

        // Section 4 - Ghi chú
        unit: '',
        customer_note: classify?.ghi_chu || email.ghi_chu || '',
        internal_note: '',
        email_content: email.body || '',
      },
      materials: [],
      special_machining: {
        wc: false,
        gf: false,
        lf: false,
        han: false,
        cayren: false,
        dongpin: false,
        tool: false,
      },
      machining_coefficients: {},
      product_volumes: [{}],
      product_weight_summary: {},
      machining_processes: [],
    };
  }

  private parseDate(dateStr: string | null | undefined): Date | undefined {
    if (!dateStr) return undefined;
    try {
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? undefined : parsed;
    } catch {
      return undefined;
    }
  }

  private parseSurfaceTreatment(value: boolean | string | null | undefined): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === 'có' || lower === 'yes';
    }
    return false;
  }

  private async loadAllVersionCounts(): Promise<void> {
    if (!this.activeEmail?.id || !this.drawingLines.length) return;

    try {
      for (let i = 0; i < this.drawingLines.length; i++) {
        const versions = await this.versionSvc.getDrawingVersions(
          this.activeEmail.id,
          i
        );
        this.drawingVersions.set(i, versions);
      }
      this.cdr.markForCheck();
    } catch (err) {
      // Silent fail
    }
  }

  // ── Right panel: reset UI state ────────────────────────────

  resetRightPanel(): void {
    this.currentTab = 0;
    this.resetPreview();
    this.drawingLines = [];
    this.modifiedDrawingFields = new Set();
    this.splitMode = 'normal';
  }

  toggleSplitFull(mode: 'left' | 'right'): void {
    if (this.splitMode === (mode === 'left' ? 'fullLeft' : 'fullRight')) {
      this.splitMode = 'normal';
    } else {
      this.splitMode = mode === 'left' ? 'fullLeft' : 'fullRight';
    }
    this.updateSplitterSizes();
  }

  private loadDrawingLines(): void {
    if (this.activeEmail?.drawings?.length) {
      this.drawingLines = this.activeEmail.drawings.map(
        (rawDrawing, rowIndex) =>
          drawingToLine(
            rawDrawing as Parameters<typeof drawingToLine>[0],
            rowIndex
          )
      );
      // Reset selected drawing to first one when loading new email
      this.selectedDrawingForMaterial = 0;
    }
  }

  // ── Drawing table ─────────────────────────────────────────

  get totalQuantity(): number {
    return this.drawingLines.reduce(
      (sum, drawingLine) =>
        sum + (parseInt(String(drawingLine.so_luong), 10) || 0),
      0
    );
  }

  getColWidth(key: string): number {
    return this.colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? 100;
  }

  async onDrawingFieldChange(
    rowIndex: number,
    field: keyof DrawingLine,
    event: Event
  ): Promise<void> {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    let value: string | number = input.value;
    if (input.type === 'number') {
      value = parseInt(input.value, 10) || 0;
    } else if (field === 'danh_gia') {
      value = parseInt(input.value, 10) as 0 | 1 | 99;
    }

    const oldValue = this.drawingLines[rowIndex][field];

    this.drawingLines = this.drawingLines.map((dl, idx) =>
      idx === rowIndex ? { ...dl, [field]: value } : dl
    );
    this.modifiedDrawingFields = new Set([
      ...this.modifiedDrawingFields,
      `${rowIndex}:${String(field)}`,
    ]);

    // Auto-save draft after field change (debounced in real implementation)
    if (this.activeEmail?.id) {
      await this.saveDraftForDrawing(rowIndex, field, oldValue, value);
    }
  }

  private async saveDraftForDrawing(
    rowIndex: number,
    field: string,
    oldValue: unknown,
    newValue: unknown
  ): Promise<void> {
    if (!this.activeEmail?.id) return;

    try {
      const drawingData = this.drawingLines[rowIndex];
      const data = {
        ...drawingData._raw,
        ma_ban_ve: drawingData.ma_ban_ve,
        vat_lieu: drawingData.vat_lieu,
        so_luong: drawingData.so_luong,
        xu_ly_be_mat: drawingData.xu_ly_be_mat,
        xu_ly_nhiet: drawingData.xu_ly_nhiet,
        dung_sai_chung: drawingData.dung_sai_chung,
        hinh_dang: drawingData.hinh_dang,
        kich_thuoc: drawingData.kich_thuoc,
        so_be_mat_cnc: drawingData.so_be_mat_cnc,
        dung_sai_chat_nhat: drawingData.dung_sai_chat_nhat,
        co_gdt: drawingData.co_gdt,
        ma_quy_trinh: drawingData.ma_quy_trinh,
        note: drawingData.note,
      };

      const changedFields = {
        [field]: { oldValue, newValue }
      };

      await this.versionSvc.saveDraft(
        this.activeEmail.id,
        rowIndex,
        data,
        changedFields
      );
    } catch (err) {
      console.error('[DemoV3] saveDraftForDrawing error', err);
    }
  }

  isDrawingFieldModified(rowIndex: number, field: string): boolean {
    return this.modifiedDrawingFields.has(`${rowIndex}:${field}`);
  }

  // Column resize — read widths directly from DOM after resize, save to localStorage
  private _resizeDirty = false;

  ngAfterViewChecked(): void {
    if (!this._resizeDirty) return;
    this._resizeDirty = false;
    setTimeout(() => {
      const tableEl = document.querySelector('.bv-tbl') as HTMLElement;
      if (!tableEl) return;
      const headers = tableEl.querySelectorAll('th[data-col-key]');
      const updated: Record<string, number> = {};
      headers.forEach((th) => {
        const key = th.getAttribute('data-col-key');
        if (!key) return;
        const w = (th as HTMLElement).offsetWidth;
        if (w > 0) updated[key] = w;
      });
      if (Object.keys(updated).length > 0) {
        this.colWidths = { ...this.colWidths, ...updated };
        this.tableResizeSvc.save(this.TABLE_KEY, this.colWidths);
      }
    }, 0);
  }

  markResizeDirty(): void {
    this._resizeDirty = true;
  }

  // ── File upload ────────────────────────────────────────────

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  triggerFileUpload(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.handleUpload(file);
    input.value = '';
  }

  private async handleUpload(file: File): Promise<void> {
    this.processing = true;
    this.progress = 0;
    this.previewData = null;

    const arrayBuffer = await file.arrayBuffer();
    this.previewData = new Uint8Array(arrayBuffer);
    this.previewName = file.name;
    this.previewPage = 1;
    this.cdr.markForCheck();

    try {
      await this.svc.uploadAndAnalyzeDrawing(
        file,
        (progressPercent: number) => {
          this.progress = progressPercent;
          this.cdr.markForCheck();
        },
        (drawingLine: DrawingLine) => {
          this.drawingLines = [...this.drawingLines, drawingLine];
          this.cdr.markForCheck();
        }
      );
      setTimeout(() => {
        this.processing = false;
        this.progress = 0;
        this.cdr.markForCheck();
      }, 500);
    } catch (err: unknown) {
      this.processing = false;
      this.progress = 0;
      const error = err as Error;
      this.messageService.add({
        severity: 'error',
        summary: 'Lỗi upload',
        detail: error?.message || 'Không upload được file',
      });
    }
    this.cdr.markForCheck();
  }

  // ── Attachment preview ─────────────────────────────────────

  async onSelectAttachment(
    attachment: string | { name: string }
  ): Promise<void> {
    if (!this.activeEmail?.id) return;
    const attachmentName =
      typeof attachment === 'string' ? attachment : attachment.name;
    this.previewName = attachmentName;
    this.previewPage = 1;
    this.previewLoading = true;
    this.previewData = null;
    this.cdr.markForCheck();

    const result = await this.svc.loadGmailAttachmentPreview(
      this.activeEmail.id,
      attachmentName
    );
    this.previewLoading = false;
    if (!result) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Không tải được file',
      });
      this.cdr.markForCheck();
      return;
    }
    this.previewData = result.bytes;
    this.cdr.markForCheck();
  }

  async loadPdfPage(fileName: string, page: number): Promise<void> {
    if (!this.activeEmail?.id) return;
    const cached = this.svc.getPreviewBytesCache();
    const currentFile = this.svc.getCurrentPreviewFile();

    this.previewName = fileName;
    this.previewPage = page || 1;

    if (currentFile === fileName && cached) {
      this.previewData = new Uint8Array(cached);
      this.cdr.markForCheck();
      return;
    }

    this.previewLoading = true;
    this.previewData = null;
    this.cdr.markForCheck();

    const result = await this.svc.loadGmailAttachmentPreview(
      this.activeEmail.id,
      fileName
    );
    this.previewLoading = false;
    if (!result) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Không tải được trang PDF',
      });
      this.cdr.markForCheck();
      return;
    }
    this.previewData = result.bytes;
    this.cdr.markForCheck();
  }

  private resetPreview(): void {
    this.previewData = null;
    this.previewName = null;
    this.previewLoading = false;
    this.previewPage = 1;
  }

  // ── Guide panel ───────────────────────────────────────────

  toggleGuide(): void {
    this.guideExpanded = !this.guideExpanded;
    sessionStorage.setItem('v3guideExpanded', this.guideExpanded ? '1' : '0');
  }

  async copyInboxEmail(event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.inboxHint) return;
    try {
      await navigator.clipboard.writeText(this.inboxHint);
      this.toastCopy = true;
      setTimeout(() => {
        this.toastCopy = false;
      }, 2200);
    } catch {
      /* ignore */
    }
  }

  // ── Debug ─────────────────────────────────────────────────

  toggleDebug(): void {
    this.debugModalOpen = !this.debugModalOpen;
    // Load AI debug info from activeEmail
    if (this.debugModalOpen && this.activeEmail) {
      this.aiDebugInfo = {
        classifyRequest: this.activeEmail.classify_ai_payload ?? null,
        drawingRequest: this.activeEmail.drawing_ai_payload ?? null,
        classifyResponse: this.activeEmail.classify_output ?? null,
        drawingResponse: this.activeEmail.drawings ?? null,
      };
    }
  }

  get debugClassifyRaw(): string {
    if (!this.activeEmail) return '(không có)';
    const classifyOutput = this.activeEmail.classify_output;
    return classifyOutput != null
      ? JSON.stringify(classifyOutput, null, 2)
      : '(không có classify_output)';
  }

  get debugDrawingsRaw(): string {
    if (!this.activeEmail) return '(không có)';
    const drawings = this.activeEmail.drawings;
    if (!drawings) return '(không có drawings)';
    const filtered = (Array.isArray(drawings) ? drawings : [drawings]).map(
      ({ id, data, filename }) => ({ id, data, filename })
    );
    return JSON.stringify(filtered, null, 2);
  }

  // AI Debug getters - request/response payloads
  get debugClassifyRequest(): string {
    const payload = this.aiDebugInfo.classifyRequest;
    if (!payload) return '(chưa có payload)';
    return JSON.stringify(payload, null, 2);
  }

  get debugDrawingsRequest(): string {
    const payloads = this.aiDebugInfo.drawingRequest;
    if (!payloads) return '(chưa có payload)';
    if (Array.isArray(payloads)) {
      // Show first drawing payload as example
      const first = payloads.find((p) => p != null);
      return first ? JSON.stringify(first, null, 2) : '(không có payload)';
    }
    return JSON.stringify(payloads, null, 2);
  }

  // ── ERP ──────────────────────────────────────────────────

  async pushErp(): Promise<void> {
    if (!this.activeEmail?.id) return;
    this.pushingErp = true;
    this.cdr.markForCheck();

    try {
      await this.svc.pushToErp(this.activeEmail.id);
      const job = await this.svc.loadJobDetail(this.activeEmail.id);
      if (job) {
        const updatedEmail = this.svc.buildFullEmailRow(job, this.activeEmail);
        this.emails = this.emails.map((email) =>
          email.id === updatedEmail.id ? updatedEmail : email
        );
        this.activeEmail = updatedEmail;
      }
      this.messageService.add({
        severity: 'success',
        summary: '✓ Đã push ERP!',
        life: 3000
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.messageService.add({
        severity: 'error',
        summary: 'Push ERP thất bại',
        detail: error?.message,
        life: 5000
      });
    } finally {
      this.pushingErp = false;
      this.cdr.markForCheck();
    }
  }

  // ── Tab ─────────────────────────────────────────────────

  setTab(tab: ViewTab): void {
    this.currentTab = tab;

    // Auto-load PDF preview when switching to F3 (Material), F4 (Product Volume), or F5 (Machining Process) tab
    if ((tab === 1 || tab === 2 || tab === 3) && this.drawingLines.length > 0) {
      const drawing = this.drawingLines[this.selectedDrawingForMaterial];
      if (drawing && drawing.filename && this.activeEmail?.id) {
        // Only load if preview is not already showing this file
        if (this.previewName !== drawing.filename) {
          this.onSelectAttachment(drawing.filename);
        }
      }
    }
  }

  // ── Schema rendering helpers ─────────────────────────────

  getSchemaRows(): UiRow[] {
    return this.classifyUiSchema?.generalRows || [];
  }

  getSchemaKeysSet(): Set<string> {
    return collectSchemaKeys(this.classifyUiSchema);
  }

  getCellAi(emailItem: EmailRow, cell: UiCell): boolean {
    const classifyOutput = emailItem.classify_output;
    if (cell.ai === true) return true;
    if (cell.ai === 'auto') {
      return !!(
        classifyOutput &&
        Object.prototype.hasOwnProperty.call(classifyOutput, cell.key) &&
        classifyOutput[cell.key] != null &&
        classifyOutput[cell.key] !== ''
      );
    }
    return false;
  }

  isSchemaCellVisible(emailItem: EmailRow, cell: UiCell): boolean {
    if (
      cell.showWhenKey &&
      !truthyClassify(resolveClassifyValue(emailItem, cell.showWhenKey, false))
    ) {
      return false;
    }
    return true;
  }

  resolveCellVal(emailItem: EmailRow, cell: UiCell): unknown {
    const defaultValue =
      cell.defaultValue !== undefined ? cell.defaultValue : undefined;
    return resolveClassifyValue(emailItem, cell.key, defaultValue);
  }

  extraFieldType(value: unknown): string {
    return inferExtraFieldType(value);
  }

  humanizeKey(key: string): string {
    return humanizeClassifyKey(key);
  }

  // ── Language tag ──────────────────────────────────────────

  getLangTag(languageCode: string | null | undefined): {
    label: string;
    cls: string;
  } {
    const languageMap: Record<string, [string, string]> = {
      ja: ['Nhat', 't-ja'],
      vi: ['Viet', 't-vi'],
      en: ['Anh', 't-en'],
    };
    const [label, cls] = languageMap[languageCode || ''] || ['?', 't-skip'];
    return { label, cls };
  }

  langTagSeverity(
    languageCode: string | null | undefined
  ): 'warning' | 'info' | 'danger' | 'secondary' {
    const severityMap: Record<
      string,
      'warning' | 'info' | 'danger' | 'secondary'
    > = { ja: 'warning', vi: 'info', en: 'danger' };
    return severityMap[languageCode || ''] || 'secondary';
  }

  // ── Misc helpers ──────────────────────────────────────────

  formatDeadline(deadlineDate: string | null): string {
    return fmtDDMM(deadlineDate);
  }

  get activeEmailId(): number | string | null {
    return this.activeEmail?.id || null;
  }

  loadPdfPageByLine(drawingLine: DrawingLine): void {
    const fileName = drawingLine.filename || this.previewName || '';
    this.loadPdfPage(fileName, drawingLine.page);
  }

  onPageChange(page: number): void {
    this.previewPage = page;
  }

  async savePhieu(): Promise<void> {
    if (!this.activeEmail?.id) return;
    this.saving = true;
    this.cdr.markForCheck();

    const drawings = this.drawingLines.map((dl) => ({
      id: dl.id,
      page: dl.page,
      fileIndex: dl.fileIndex,
      filename: dl.filename,
      data: {
        ...dl._raw,
        ma_ban_ve: dl.ma_ban_ve,
        vat_lieu: dl.vat_lieu,
        so_luong: dl.so_luong,
        xu_ly_be_mat: dl.xu_ly_be_mat,
        xu_ly_nhiet: dl.xu_ly_nhiet,
        dung_sai_chung: dl.dung_sai_chung,
        hinh_dang: dl.hinh_dang,
        kich_thuoc: dl.kich_thuoc,
        so_be_mat_cnc: dl.so_be_mat_cnc,
        dung_sai_chat_nhat: dl.dung_sai_chat_nhat,
        co_gdt: dl.co_gdt,
        ma_quy_trinh: dl.ma_quy_trinh,
        note: dl.note,
      },
    }));

    const ok = await this.svc.savePhieu(this.activeEmail.id, drawings, {});

    this.saving = false;
    this.cdr.markForCheck();

    if (ok) {
      this.messageService.add({
        severity: 'success',
        summary: 'Đã lưu phiếu',
        life: 2000,
      });
      // Clear modified markers after save
      this.modifiedDrawingFields.clear();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Lưu thất bại',
        life: 3000,
      });
    }
  }

  async approveJob(): Promise<void> {
    if (!this.activeEmail?.id) return;

    try {
      this.saving = true;
      this.cdr.markForCheck();

      const result = await this.versionSvc.approveJob(
        this.activeEmail.id,
        'web-user'
      );

      this.saving = false;
      this.cdr.markForCheck();

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Đã duyệt phiếu',
          detail: 'Tất cả drawings đã được chuyển sang trạng thái approved',
          life: 3000,
        });
        this.modifiedDrawingFields.clear();
        // Reload version counts after approval
        await this.loadAllVersionCounts();
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Duyệt thất bại',
          detail: result.message || 'Lỗi không xác định',
          life: 3000,
        });
      }
    } catch (err) {
      this.saving = false;
      this.cdr.markForCheck();
      const error = err as any;
      const errorDetail = error?.error?.message || error?.message || JSON.stringify(error);
      this.messageService.add({
        severity: 'error',
        summary: 'Duyệt thất bại',
        detail: errorDetail,
        life: 5000,
      });
    }
  }

  async loadVersionHistory(drawingIndex: number): Promise<void> {
    if (!this.activeEmail?.id) return;

    try {
      const versions = await this.versionSvc.getDrawingVersions(
        this.activeEmail.id,
        drawingIndex
      );
      this.drawingVersions.set(drawingIndex, versions);
      this.selectedDrawingIndex = drawingIndex;

      if (versions.length === 0) {
        this.messageService.add({
          severity: 'info',
          summary: 'Chưa có lịch sử thay đổi',
          detail: 'Bản vẽ này chưa có lịch sử chỉnh sửa',
          life: 3000,
        });
        return;
      }

      this.showVersionHistory = true;
      this.cdr.markForCheck();
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Không tải được lịch sử',
        life: 2000,
      });
    }
  }

  getVersionsForDrawing(drawingIndex: number): DrawingVersion[] {
    return this.drawingVersions.get(drawingIndex) || [];
  }

  getVersionCountForDrawing(drawingIndex: number): number {
    return this.drawingVersions.get(drawingIndex)?.length || 0;
  }

  getVersionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      ai_extracted: 'AI trích xuất',
      user_draft: 'Nháp của user',
      approved: 'Đã duyệt',
      erp_confirmed: 'Đã đẩy ERP',
    };
    return labels[type] || type;
  }

  getVersionTypeSeverity(
    type: string
  ): 'success' | 'info' | 'warning' | 'danger' | 'secondary' {
    const severities: Record<
      string,
      'success' | 'info' | 'warning' | 'danger' | 'secondary'
    > = {
      ai_extracted: 'info',
      user_draft: 'warning',
      approved: 'success',
      erp_confirmed: 'secondary',
    };
    return severities[type] || 'secondary';
  }

  trackByEmailId(index: number, emailItem: EmailRow): number | string {
    return emailItem.jobId || emailItem.id;
  }

  getAttachmentName(attachment: string | { name: string }): string {
    return typeof attachment === 'string' ? attachment : attachment.name;
  }

  getAttachmentList(): Array<string | { name: string }> {
    return this.activeEmail?.attachments || [];
  }

  isActiveAttachment(attachment: string | { name: string }): boolean {
    return this.previewName === this.getAttachmentName(attachment);
  }

  getKhachHang(): string {
    return this.activeEmail?.ten_kh || this.activeEmail?.from || '';
  }

  getEmail(): string {
    return this.activeEmail?.email || '';
  }

  getEmailBody(): string {
    return this.activeEmail?.body || '';
  }

  isRfq(emailItem: EmailRow | null): boolean {
    return emailItem?.classify === 'rfq';
  }

  getSourceLabel(source: string | null | undefined): string {
    if (source === 'email') return 'Email';
    if (source === 'chat') return 'Chat';
    return '';
  }

  getVersionDataString(data: Record<string, unknown>, key: string): string {
    const value = data[key];
    return value != null ? String(value) : '';
  }

  formatTokenCount(tokens: number): string {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  // ── Tree view methods ─────────────────────────────────────

  rebuildTree(): void {
    this.emailTree = buildEmailTree(this.emails);
  }

  onTreeNodeSelect(event: any): void {
    const node = event.node as TreeNode;
    this.selectedTreeNode = node;
    // Tree acts as filter - no need to auto-select email
    this.cdr.markForCheck();
  }

  toggleTreeView(): void {
    this.useTreeView = !this.useTreeView;
    if (this.useTreeView) {
      this.rebuildTree();
    } else {
      this.selectedTreeNode = null;
    }
  }

  // ── Quotation methods ─────────────────────────────────────

  onDrawingSelectionChange(event: any): void {
    // event.value is the selected DrawingLine object
    const selectedIndex = this.drawingLines.findIndex(d => d === event.value);
    if (selectedIndex >= 0) {
      this.selectedDrawingForMaterial = selectedIndex;
      this.loadMaterialDataForDrawing(selectedIndex);
    }
    this.cdr.markForCheck();
  }

  onDrawingSelectionChangeByIndex(index: number): void {
    this.selectedDrawingForMaterial = index;
    this.loadMaterialDataForDrawing(index);
    this.cdr.markForCheck();
  }

  private loadMaterialDataForDrawing(drawingIndex: number): void {
    if (!this.drawingLines || drawingIndex >= this.drawingLines.length) {
      return;
    }
    const drawing = this.drawingLines[drawingIndex];

    // Auto-load PDF preview when selecting a drawing
    if (drawing.filename && this.activeEmail?.id) {
      this.onSelectAttachment(drawing.filename);
    }
  }

  addMaterial(): void {
    const newMaterial: Material = {};
    this.quotationData.materials = this.quotationData.materials || [];
    this.quotationData.materials.push(newMaterial);
    this.cdr.markForCheck();
  }

  removeMaterial(index: number): void {
    if (this.quotationData.materials && index >= 0 && index < this.quotationData.materials.length) {
      this.quotationData.materials.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  addMachiningProcess(): void {
    const newProcess: MachiningProcess = {};
    this.quotationData.machining_processes = this.quotationData.machining_processes || [];
    this.quotationData.machining_processes.push(newProcess);
    this.cdr.markForCheck();
  }

  removeMachiningProcess(index: number): void {
    if (this.quotationData.machining_processes && index >= 0 && index < this.quotationData.machining_processes.length) {
      this.quotationData.machining_processes.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  // Helper methods for F3 material tab
  getMaterialType(drawing: DrawingLine): string {
    if (!drawing || !drawing.vat_lieu) return '—';
    // Extract material type from format like "SKD61 (Thép)"
    const match = drawing.vat_lieu.match(/\(([^)]+)\)/);
    return match ? match[1] : '—';
  }

  getMaterialCode(drawing: DrawingLine): string {
    if (!drawing || !drawing.vat_lieu) return '—';
    // Extract material code from format like "SKD61 (Thép)" or just "SKD61"
    const match = drawing.vat_lieu.match(/^([^\s(]+)/);
    return match ? match[1] : drawing.vat_lieu;
  }
}
