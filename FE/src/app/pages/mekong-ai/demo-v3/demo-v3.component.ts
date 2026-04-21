import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';

import { DemoV3Service } from './demo-v3.service';
import { EmailRow } from '../models/email.model';
import { UiSchema, UiCell, UiRow } from '../models/prompt.model';
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
} from '../utils/email.util';

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
  stt: 38,
  ma_ban_ve: 160,
  so_luong: 70,
  hinh_dang: 90,
  dung_sai: 90,
  vat_lieu: 90,
  kich_thuoc: 110,
  ma_quy_trinh: 90,
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

  // Right panel
  currentTab: ViewTab = 0;
  drawingLines: DrawingLine[] = [];
  processing = false;
  progress = 0;
  previewSrc: SafeResourceUrl | null = null;
  previewName: string | null = null;
  previewLoading = false;
  previewPage = 1;

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
    private messageService: MessageService,
    private sanitizer: DomSanitizer,
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
    const [hint, schema] = await Promise.all([
      this.svc.loadInboxHint(),
      this.svc.loadClassifyUiSchema(),
    ]);
    this.inboxHint = hint;
    this.classifyUiSchema = schema;
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
    } else if (this.activeEmail?.drawings?.length) {
      this.loadDrawingLines();
    }

    this.cdr.markForCheck();
  }

  // ── Right panel: reset UI state ────────────────────────────

  resetRightPanel(): void {
    this.currentTab = 0;
    this.resetPreview();
    this.colWidths = {};
    this.drawingLines = [];
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

  onDrawingFieldChange(
    rowIndex: number,
    field: keyof DrawingLine,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const value =
      input.type === 'number' ? parseInt(input.value, 10) || 0 : input.value;
    this.drawingLines = this.drawingLines.map((drawingLine, index) =>
      index === rowIndex ? { ...drawingLine, [field]: value } : drawingLine
    );
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
    this.previewSrc = null;

    const localUrl = URL.createObjectURL(file);
    this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(localUrl);
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
    this.previewSrc = null;
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
    const blob = new Blob([result.bytes], { type: result.mime });
    const url = URL.createObjectURL(blob);
    this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.cdr.markForCheck();
  }

  async loadPdfPage(fileName: string, page: number): Promise<void> {
    if (!this.activeEmail?.id) return;
    const cached = this.svc.getPreviewBytesCache();
    const currentFile = this.svc.getCurrentPreviewFile();

    this.previewName = fileName;
    this.previewPage = page || 1;

    if (currentFile === fileName && cached) {
      const blob = new Blob([cached], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.cdr.markForCheck();
      return;
    }

    this.previewLoading = true;
    this.previewSrc = null;
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
    const blob = new Blob([result.bytes], { type: result.mime });
    const url = URL.createObjectURL(blob);
    this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.cdr.markForCheck();
  }

  private resetPreview(): void {
    if (this.previewSrc) {
      const urlStr = String(this.previewSrc);
      if (urlStr.startsWith('blob:')) URL.revokeObjectURL(urlStr);
    }
    this.previewSrc = null;
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
    if (!this.activeEmail) return '(khong co)';
    const classifyOutput = this.activeEmail.classify_output;
    return classifyOutput != null
      ? JSON.stringify(classifyOutput, null, 2)
      : '(khong co classify_output)';
  }

  get debugDrawingsRaw(): string {
    if (!this.activeEmail) return '(khong co)';
    const drawings = this.activeEmail.drawings;
    if (!drawings) return '(khong co drawings)';
    const filtered = (Array.isArray(drawings) ? drawings : [drawings]).map(({ id, data, filename }) => ({ id, data, filename }));
    return JSON.stringify(filtered, null, 2);
  }

  // AI Debug getters - request/response payloads
  get debugClassifyRequest(): string {
    const payload = this.aiDebugInfo.classifyRequest;
    if (!payload) return '(chua co payload)';
    return JSON.stringify(payload, null, 2);
  }

  get debugDrawingsRequest(): string {
    const payloads = this.aiDebugInfo.drawingRequest;
    if (!payloads) return '(chua co payload)';
    if (Array.isArray(payloads)) {
      // Show first drawing payload as example
      const first = payloads.find(p => p != null);
      return first ? JSON.stringify(first, null, 2) : '(khong co payload)';
    }
    return JSON.stringify(payloads, null, 2);
  }

  // ── ERP ──────────────────────────────────────────────────

  async pushErp(): Promise<void> {
    if (!this.activeEmail?.id) return;
    try {
      await this.svc.pushToErp(this.activeEmail.id);
      this.messageService.add({ severity: 'success', summary: 'Da push ERP!' });
    } catch (err: unknown) {
      const error = err as Error;
      this.messageService.add({
        severity: 'error',
        summary: 'Push ERP that bai',
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
}
