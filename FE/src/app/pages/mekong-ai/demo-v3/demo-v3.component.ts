import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { DemoV3Service } from './demo-v3.service';
import { MekongAiService } from '../mekong-ai.service';
import { EmailRow } from '../models/email.model';
import { UiSchema, UiCell, UiRow, KnowledgeBlock } from '../models/prompt.model';
import { DrawingLine } from '../utils/drawing.util';
import { drawingToLine } from '../utils/drawing.util';
import {
  mapJobRowToEmail,
  mergeAgentIntoInbox,
  normalizeClassifyOutputFromJob,
  fmtDDMMHHmm,
  fmtDDMM,
  resolveClassifyValue,
  collectSchemaKeys,
  truthyClassify,
  inferExtraFieldType,
  humanizeClassifyKey,
  toDateInputValue,
  parseHanGiaoToDate,
} from '../utils/email.util';

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
  stt: 38,
  ma_ban_ve: 140,
  so_luong: 55,
  hinh_dang: 80,
  dung_sai: 80,
  vat_lieu: 80,
  kich_thuoc: 100,
  ma_quy_trinh: 80,
  ghi_chu: 130,
  danh_gia: 60,
};

type ViewTab = 0 | 1;
type SplitMode = 'normal' | 'fullLeft' | 'fullRight';

@Component({
  selector: 'app-demo-v3',
  templateUrl: './demo-v3.component.html',
  styleUrls: ['./demo-v3.component.css'],
})
export class DemoV3Component implements OnInit, OnDestroy {
  // ── State ─────────────────────────────────────────────────
  emails: EmailRow[] = [];
  activeEmail: EmailRow | null = null;
  searchQuery = '';
  inboxHint = '';
  classifyUiSchema: UiSchema | null = null;
  debugModalOpen = false;

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
  ghiChu = '';
  hanBaoGia: Date | null = null;
  coVanChuyen: boolean | null = null;
  xuLyBeMat: boolean | null = null;

  // Column resize
  colWidths: Record<string, number> = {};
  private resizeState: {
    colKey: string;
    startX: number;
    startWidth: number;
  } | null = null;
  private boundMouseMove: ((event: MouseEvent) => void) | null = null;
  private boundMouseUp: (() => void) | null = null;

  // Splitter full-width toggle
  splitMode: SplitMode = 'normal';

  get splitterPanelSizes(): number[] {
    switch (this.splitMode) {
      case 'fullLeft': return [100, 0];
      case 'fullRight': return [0, 100];
      default: return [60, 40];
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
  } = { classifyRequest: null, drawingRequest: null, classifyResponse: null, drawingResponse: null };

  // ── Lifecycle ─────────────────────────────────────────────

  constructor(
    private svc: DemoV3Service,
    private mekongSvc: MekongAiService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadConfig();

    this.svc.startPolling(
      (agentEmails: EmailRow[]) => {
        this.emails = mergeAgentIntoInbox(agentEmails, this.emails);
        if (this.activeEmail?.id) {
          const refreshed = this.emails.find(
            e => e.id === this.activeEmail!.id
          );
          if (refreshed) this.activeEmail = refreshed;
        }
        this.cdr.markForCheck();
      },
      (updatedEmail: EmailRow) => {
        this.cdr.markForCheck();
      }
    );

    const jobId = this.route.snapshot.queryParamMap.get('job');
    if (jobId) {
      await this.openJobFromUrl(jobId);
    }
  }

  ngOnDestroy(): void {
    this.svc.stopPolling();
    this.removeResizeListeners();
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
    const marketKb = kbList.find(kb => kb.key === 'vnt-markets');
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
    // Load tab thong tin chung fields
    this.ghiChu = job.ghi_chu || '';
    this.hanBaoGia = parseHanGiaoToDate(job.han_bao_gia || null);
    this.coVanChuyen = job.co_van_chuyen ?? (full.classify_output as any)?.co_van_chuyen ?? null;
    this.xuLyBeMat = job.xu_ly_be_mat ?? (full.classify_output as any)?.xu_ly_be_mat ?? null;
    this.cdr.markForCheck();
  }

  // ── Mailbox ───────────────────────────────────────────────

  get filteredEmails(): EmailRow[] {
    if (!this.searchQuery) return this.emails;
    const query = this.searchQuery.toLowerCase();
    return this.emails.filter(
      (emailItem) =>
        emailItem.from.toLowerCase().includes(query) ||
        (emailItem.subject || '').toLowerCase().includes(query)
    );
  }

  get unreadCount(): number {
    return this.emails.filter((emailItem) => emailItem.unread).length;
  }

  onEmailClick(emailItem: EmailRow): void {
    this.selectEmail(emailItem);
  }

  async selectEmail(emailItem: EmailRow): Promise<void> {
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
      // Load tab thong tin chung fields
      this.ghiChu = job.ghi_chu || '';
      this.hanBaoGia = parseHanGiaoToDate(job.han_bao_gia || null);
      this.coVanChuyen = job.co_van_chuyen ?? (full.classify_output as any)?.co_van_chuyen ?? null;
      this.xuLyBeMat = job.xu_ly_be_mat ?? (full.classify_output as any)?.xu_ly_be_mat ?? null;
    } else if (this.activeEmail?.drawings?.length) {
      this.loadDrawingLines();
      this.ghiChu = emailItem.ghi_chu || (emailItem.classify_output as any)?.ghi_chu || '';
      this.coVanChuyen = emailItem.co_van_chuyen ?? (emailItem.classify_output as any)?.co_van_chuyen ?? null;
      this.xuLyBeMat = emailItem.xu_ly_be_mat ?? (emailItem.classify_output as any)?.xu_ly_be_mat ?? null;
    }

    this.cdr.markForCheck();
  }

  // ── Right panel: reset UI state ────────────────────────────

  resetRightPanel(): void {
    this.currentTab = 0;
    this.resetPreview();
    this.colWidths = {};
    this.drawingLines = [];
    this.modifiedDrawingFields = new Set();
    this.ghiChu = '';
    this.hanBaoGia = null;
    this.coVanChuyen = null;
    this.xuLyBeMat = null;
    this.splitMode = 'normal';
  }

  toggleSplitFull(mode: 'left' | 'right'): void {
    if (this.splitMode === (mode === 'left' ? 'fullLeft' : 'fullRight')) {
      this.splitMode = 'normal';
    } else {
      this.splitMode = mode === 'left' ? 'fullLeft' : 'fullRight';
    }
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

  onDrawingFieldChange(
    rowIndex: number,
    field: keyof DrawingLine,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    let value: string | number = input.value;
    if (input.type === 'number') {
      value = parseInt(input.value, 10) || 0;
    } else if (field === 'danh_gia') {
      value = parseInt(input.value, 10) as 0 | 1 | 99;
    }
    this.drawingLines = this.drawingLines.map((dl, idx) =>
      idx === rowIndex ? { ...dl, [field]: value } : dl
    );
    this.modifiedDrawingFields = new Set([
      ...this.modifiedDrawingFields,
      `${rowIndex}:${String(field)}`,
    ]);
  }

  isDrawingFieldModified(rowIndex: number, field: string): boolean {
    return this.modifiedDrawingFields.has(`${rowIndex}:${field}`);
  }

  // Column resize
  onResizeMouseDown(event: MouseEvent, colKey: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizeState = {
      colKey,
      startX: event.clientX,
      startWidth: this.getColWidth(colKey),
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    this.removeResizeListeners();
    this.boundMouseMove = this.onResizeMouseMove.bind(this);
    this.boundMouseUp = this.onResizeMouseUp.bind(this);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  private onResizeMouseMove(event: MouseEvent): void {
    if (!this.resizeState) return;
    const { colKey, startX, startWidth } = this.resizeState;
    const deltaX = event.clientX - startX;
    this.colWidths = {
      ...this.colWidths,
      [colKey]: Math.max(40, startWidth + deltaX),
    };
  }

  private onResizeMouseUp(): void {
    this.resizeState = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    this.removeResizeListeners();
  }

  private removeResizeListeners(): void {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
      this.boundMouseMove = null;
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
      this.boundMouseUp = null;
    }
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
    const filtered = (Array.isArray(drawings) ? drawings : [drawings]).map(({ id, data, filename }) => ({ id, data, filename }));
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
      const first = payloads.find(p => p != null);
      return first ? JSON.stringify(first, null, 2) : '(không có payload)';
    }
    return JSON.stringify(payloads, null, 2);
  }

  // ── ERP ──────────────────────────────────────────────────

  async pushErp(): Promise<void> {
    if (!this.activeEmail?.id) return;
    try {
      await this.svc.pushToErp(this.activeEmail.id);
      this.messageService.add({ severity: 'success', summary: 'Đã push ERP!' });
    } catch (err: unknown) {
      const error = err as Error;
      this.messageService.add({
        severity: 'error',
        summary: 'Push ERP thất bại',
        detail: error?.message,
      });
    }
  }

  // ── Tab ─────────────────────────────────────────────────

  setTab(tab: ViewTab): void {
    this.currentTab = tab;
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

  // ── Market tag ────────────────────────────────────────────

  getMarketTag(market: string | null | undefined): {
    label: string;
    cls: string;
  } {
    const code = market || '';
    if (!code || !this.marketRows?.length) {
      return { label: '?', cls: 't-skip' };
    }
    const row = this.marketRows.find(
      r => (r as any)['market'] === code || String((r as any)['market'] || '').toLowerCase() === code.toLowerCase()
    );
    const label = row ? String((row as any)['ten'] || code) : code;
    const cls = `t-${code.toLowerCase()}`;
    return { label, cls };
  }

  marketSeverity(
    market: string | null | undefined
  ): 'info' | 'warning' | 'success' | 'secondary' {
    const sevMap: Record<string, 'info' | 'warning' | 'success' | 'secondary'> = {};
    for (const row of this.marketRows ?? []) {
      const code = String((row as any)['market'] || '');
      if (code === 'VN') sevMap[code] = 'info';
      else if (code === 'JP') sevMap[code] = 'warning';
      else if (code === 'US') sevMap[code] = 'success';
      else if (code === 'EU') sevMap[code] = 'secondary';
    }
    return sevMap[market || ''] || 'secondary';
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
        ly_giai_qt: dl.ly_giai_qt,
        note: dl.note,
        danh_gia: dl.danh_gia,
      },
    }));

    const d = this.hanBaoGia;
    const hanBaoGiaValue = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : undefined;

    const ok = await this.svc.savePhieu(
      this.activeEmail.id,
      drawings,
      {
        ghi_chu: this.ghiChu,
        han_bao_gia: hanBaoGiaValue,
        co_van_chuyen: this.coVanChuyen,
        xu_ly_be_mat: this.xuLyBeMat,
      }
    );

    this.saving = false;
    this.cdr.markForCheck();

    if (ok) {
      this.messageService.add({
        severity: 'success',
        summary: 'Đã lưu phiếu',
        life: 2000,
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Lưu thất bại',
        life: 3000,
      });
    }
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
}
