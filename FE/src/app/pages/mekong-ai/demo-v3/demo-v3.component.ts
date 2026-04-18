import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { MekongAiService } from '../mekong-ai.service';

// Types
interface Email {
  id?: number;
  jobId?: number;
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  date: string;
  attachments: (string | { name: string })[] | null;
  classify: string;
  ngon_ngu: string;
  ten_kh: string;
  han_giao: string | null;
  hinh_thuc_giao: string | null;
  xu_ly_be_mat: boolean | null;
  vat_lieu_chung_nhan: any;
  classify_output: any;
  drawings: Drawing[] | null;
  unread: boolean;
  _agent?: boolean;
  _needLoad?: boolean;
  created_at?: string;
}

interface Drawing {
  filename?: string;
  page?: number;
  raw?: string;
  data: {
    ma_ban_ve?: string;
    so_luong?: string | number;
    hinh_dang?: string;
    dung_sai?: string;
    vat_lieu?: string;
    kich_thuoc?: string;
    ma_quy_trinh?: string;
  };
}

interface DrawingLine {
  filename: string;
  page: number;
  raw: string;
  data: DrawingData;
}

interface DrawingData {
  ma_ban_ve: string;
  so_luong: string | number;
  hinh_dang: string;
  dung_sai: string;
  vat_lieu: string;
  kich_thuoc: string;
  ma_quy_trinh: string;
}

interface ClassifyUiSchema {
  generalRows?: any[];
}

@Component({
  selector: 'app-demo-v3',
  templateUrl: './demo-v3.component.html',
  styleUrls: ['./demo-v3.component.css'],
})
export class DemoV3Component implements OnInit, OnDestroy {
  // State
  emails: Email[] = [];
  selectedEmail: Email | null = null;
  activeTabIndex = 0;
  searchQuery = '';
  filteredEmails: Email[] = [];
  guideOpen = sessionStorage.getItem('v3guideExpanded') === '1';
  toastCopied = false;
  inboxEmail = '';
  classifyUiSchema: ClassifyUiSchema | null = null;
  debugModalOpen = false;

  // Drawings
  drawingLines: DrawingLine[] = [];
  prevDrawingsRef: any = null;

  // Preview
  previewName: string | null = null;
  previewSrc: SafeResourceUrl | null = null;
  previewLoading = false;
  previewPage = 1;
  previewLoadGen = 0;
  currentFileName: string | null = null;
  previewBytesRef: Uint8Array | null = null;
  selectedDrawingIdx = -1;

  // Upload
  processing = false;
  progress = 0;

  // Other
  vatValue = true;
  internalNote = '';
  unreadCount = 0;
  drawingCount = 0;

  // Computed values for radio buttons (toBoolean)
  private internalNotePrefix = 'Tạo tự động bởi Mekong AI — ';
  private pollInterval: any;
  private readonly POLL_MS = 8000;

  shippingOptions = [
    { label: '— Chọn —', value: '' },
    {
      label: 'FedEx International Economy',
      value: 'FedEx International Economy',
    },
    {
      label: 'FedEx International Priority',
      value: 'FedEx International Priority',
    },
    { label: 'DHL', value: 'DHL' },
    { label: 'Tự vận chuyển', value: 'Tự vận chuyển' },
  ];

  @ViewChild('hanGiaoInput') hanGiaoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('bvSplitRef') bvSplitRef!: ElementRef;

  constructor(
    private mekongService: MekongAiService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadInboxHint();
    this.loadClassifyUiSchema();
    this.startPolling();
    this.tickPoll(); // load immediately on init
    this.internalNote =
      this.internalNotePrefix + new Date().toLocaleString('vi-VN');
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.revokePreviewUrl();
  }

  // ── Polling /jobs ─────────────────────────────────────
  private startPolling() {
    this.pollInterval = setInterval(() => this.tickPoll(), this.POLL_MS);
    this.tickPoll(); // immediate first tick
  }

  private stopPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async tickPoll() {
    try {
      const jobs = await this.mekongService.getJobs();
      if (!jobs?.length) {
        this.emails = this.emails.filter((e) => !e._agent);
        this.unreadCount = this.emails.filter((e) => e.unread).length;
        this.filteredEmails = this.emails;
        this.cdr.detectChanges();
        return;
      }
      const agentEmails: Email[] = jobs.map(mapJobRowToEmail);
      this.emails = mergeAgentIntoInbox(agentEmails, this.emails);
      this.unreadCount = this.emails.filter((e) => e.unread).length;
      this.filteredEmails = this.emails;
      this.updateActiveEmail(agentEmails);
      this.cdr.detectChanges();
    } catch (e) {
      console.error('[mekong] poll error', e);
    }
  }

  private updateActiveEmail(agentEmails: Email[]) {
    if (!this.selectedEmail?.jobId) return;
    const fresh = agentEmails.find(
      (x) =>
        x.jobId === this.selectedEmail!.jobId || x.id === this.selectedEmail!.id
    );
    if (!fresh) return;
    if (this.selectedEmail._needLoad) {
      this.selectedEmail = fresh;
      return;
    }
    this.selectedEmail = {
      ...this.selectedEmail,
      preview: fresh.preview,
      time: fresh.time,
      date: fresh.date,
      unread: fresh.unread,
      classify_output: normalizeClassifyOutputFromJob({
        classify_output:
          fresh.classify_output != null
            ? fresh.classify_output
            : this.selectedEmail.classify_output,
        classify: fresh.classify ?? this.selectedEmail.classify,
        ngon_ngu: fresh.ngon_ngu ?? this.selectedEmail.ngon_ngu,
        han_giao: this.selectedEmail.han_giao,
        hinh_thuc_giao: this.selectedEmail.hinh_thuc_giao,
        xu_ly_be_mat: this.selectedEmail.xu_ly_be_mat,
        vat_lieu_chung_nhan:
          this.selectedEmail.vat_lieu_chung_nhan ??
          this.selectedEmail.classify_output?.vat_lieu_chung_nhan,
        ten_kh: this.selectedEmail.ten_kh,
        body: this.selectedEmail.body,
      }),
      attachments:
        fresh.attachments && fresh.attachments.length > 0
          ? fresh.attachments
          : this.selectedEmail.attachments,
    };
  }

  // ── Data loading ──────────────────────────────────────
  private async loadInboxHint() {
    const d = await this.mekongService.getDemoHint();
    this.inboxEmail = d.inboxEmail || '';
  }

  private async loadClassifyUiSchema() {
    const d = await this.mekongService.getEmailClassifyUiSchema();
    if (d && Array.isArray(d.generalRows)) this.classifyUiSchema = d;
  }

  // ── Date formatting helpers (date-fns) ─────────────────
  private formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      const date =
        typeof iso === 'string' && iso.includes('/')
          ? parseISO(iso)
          : new Date(iso);
      return format(date, 'dd/MM/yyyy HH:mm', { locale: vi });
    } catch {
      return '—';
    }
  }

  private formatDateOnly(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      const date =
        typeof iso === 'string' && iso.includes('/')
          ? parseISO(iso)
          : new Date(iso);
      return format(date, 'dd/MM/yyyy', { locale: vi });
    } catch {
      return '';
    }
  }

  // ── Email selection ───────────────────────────────────
  async selectEmail(email: Email) {
    if (email.jobId) {
      const job = await this.mekongService.getJobById(email.jobId);
      if (!job) return;
      const full: Email = {
        ...email,
        body: job.ghi_chu || '',
        attachments: job.attachments || [],
        date: job.created_at ? this.formatDate(job.created_at) : email.date,
        han_giao:
          job.han_giao != null && job.han_giao !== '' ? job.han_giao : null,
        hinh_thuc_giao: job.hinh_thuc_giao || null,
        xu_ly_be_mat: job.xu_ly_be_mat ?? null,
        vat_lieu_chung_nhan: job.vat_lieu_chung_nhan ?? null,
        classify_output: normalizeClassifyOutputFromJob(job),
        ten_kh: job.ten_cong_ty || email.from || '',
        drawings: (job.drawings || []) as Drawing[],
        _needLoad: false,
      };
      const idx = this.emails.findIndex((e) => e.id === email.id);
      if (idx !== -1) this.emails[idx] = full;
      this.selectedEmail = full;
      logMekongJobAiResponses(job, 'selectEmail');
    } else {
      this.selectedEmail = email;
    }
    // Reset state
    this.activeTabIndex = 0;
    this.drawingLines = [];
    this.previewName = null;
    this.previewSrc = null;
    this.previewLoading = false;
    this.revokePreviewUrl();
    this.internalNote =
      this.internalNotePrefix + new Date().toLocaleString('vi-VN');
  }

  // ── Filter emails ─────────────────────────────────────
  filterEmails() {
    if (!this.searchQuery.trim()) {
      this.filteredEmails = this.emails;
    } else {
      const q = this.searchQuery.toLowerCase();
      this.filteredEmails = this.emails.filter(
        (e) =>
          e.from.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q)
      );
    }
  }

  get unreadCountValue(): number {
    this.unreadCount = this.emails.filter((e) => e.unread).length;
    return this.unreadCount;
  }

  // ── Guide ─────────────────────────────────────────────
  toggleGuide() {
    this.guideOpen = !this.guideOpen;
    sessionStorage.setItem('v3guideExpanded', this.guideOpen ? '1' : '0');
  }

  async copyEmail() {
    if (!this.inboxEmail) return;
    try {
      await navigator.clipboard.writeText(this.inboxEmail);
      this.toastCopied = true;
      setTimeout(() => (this.toastCopied = false), 2200);
    } catch (e) {
      /* ignore */
    }
  }

  // ── Attachment / Preview ──────────────────────────────
  isAttachmentActive(name: string): boolean {
    return this.previewName === name;
  }

  getAttachmentName(a: string | { name: string }): string {
    return typeof a === 'string' ? a : a.name;
  }

  selectAttachment(name: string) {
    this.previewName = name;
    this.currentFileName = name;
    if (this.selectedEmail?.jobId) {
      this.loadPreviewFromJob(name);
    }
  }

  private loadPreviewFromJob(fileName: string) {
    if (!this.selectedEmail?.jobId) return;
    const gen = ++this.previewLoadGen;
    this.previewLoading = true;
    this.previewSrc = null;

    this.mekongService
      .getAttachmentPreview(this.selectedEmail.jobId, fileName)
      .then((data: { ok: boolean; b64?: string; mime?: string } | null) => {
        if (gen !== this.previewLoadGen) return;
        if (!data?.ok || !data?.b64) return;
        const bin = atob(data.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        this.previewBytesRef = bytes;
        this.updatePreviewSrc();
        this.previewPage = 1;
      })
      .catch(() => {
        if (gen === this.previewLoadGen) this.previewLoading = false;
      });
  }

  private updatePreviewSrc() {
    if (this.previewBytesRef) {
      const blob = new Blob([this.previewBytesRef], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      this.previewSrc = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
  }

  private revokePreviewUrl() {
    if (
      this.previewSrc &&
      typeof this.previewSrc === 'string' &&
      this.previewSrc.startsWith('blob:')
    ) {
      URL.revokeObjectURL(this.previewSrc);
    }
  }

  loadPdfPage(fileName: string, pageNum: number) {
    if (!this.selectedEmail?.jobId) return;
    const targetFile =
      fileName ||
      this.previewName ||
      (this.selectedEmail.attachments?.[0] &&
      typeof this.selectedEmail.attachments[0] === 'string'
        ? this.selectedEmail.attachments[0]
        : '');
    if (!targetFile) return;

    this.previewName = targetFile;
    this.previewPage = pageNum || 1;

    if (
      this.currentFileName === targetFile &&
      this.previewSrc &&
      this.previewBytesRef
    ) {
      this.updatePreviewSrc();
      return;
    }

    this.previewSrc = null;
    this.currentFileName = targetFile;
    this.loadPreviewFromJob(targetFile);
  }

  selectDrawingByIdx(idx: number) {
    this.selectedDrawingIdx = idx;
    const line = this.drawingLines[idx];
    if (line) {
      this.previewName = line.filename;
      this.currentFileName = line.filename;
      this.previewPage = line.page || 1;
      this.loadPdfPage(line.filename, line.page || 1);
    }
  }

  // ── Drawings / Lines ──────────────────────────────────
  get drawingCountValue(): number {
    this.drawingCount = this.drawingLines.length;
    return this.drawingCount;
  }

  getDrawingValue(d: DrawingLine, key: keyof DrawingLine['data']): string {
    return d.data[key] != null ? String(d.data[key]) : '';
  }

  updateDrawingLine(
    idx: number,
    key: keyof DrawingData,
    value: string | number
  ) {
    const line = this.drawingLines[idx];
    if (line) {
      (line.data as any)[key] = value;
    }
  }

  // ── Tab & Drawing sync ────────────────────────────────
  @HostListener('window:popstate')
  onUrlChange() {
    // Handle URL params if needed
  }

  // ── Upload ────────────────────────────────────────────
  triggerUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = e.target.files;
      if (!files?.length) return;
      await this.handleUpload(Array.from(files));
    };
    input.click();
  }

  private async handleUpload(files: File[]) {
    this.processing = true;
    this.progress = 5;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const results = await this.mekongService.uploadAndAnalyzeDrawing(file);
        if (results) {
          for (let j = 0; j < results.length; j++) {
            const r = results[j];
            this.drawingLines.push(
              drawingToLine(r, this.drawingLines.length + j)
            );
            this.progress = Math.round(20 + ((j + 1) / results.length) * 75);
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
        }
      }
      this.progress = 100;
      setTimeout(() => {
        this.processing = false;
        this.progress = 0;
      }, 500);
    } catch (e) {
      console.error(e);
      this.processing = false;
      this.progress = 0;
    }
  }

  // ── Helpers ───────────────────────────────────────────
  getLanguageTag(lang: string): { class: string; label: string } {
    const map: Record<string, { class: string; label: string }> = {
      ja: { class: 't-ja', label: '🇯🇵 Nhật' },
      vi: { class: 't-vi', label: '🇻🇳 Việt' },
      en: { class: 't-en', label: '🇺🇸 Anh' },
    };
    return map[lang] || { class: 't-skip', label: lang || '?' };
  }

  hasShipping(): boolean {
    return !!this.selectedEmail?.hinh_thuc_giao;
  }

  // Radio button two-way binding helpers
  get hinh_thuc_giao_vn(): boolean {
    if (!this.selectedEmail) return false;
    const v = this.selectedEmail.hinh_thuc_giao;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
    return !!v;
  }

  set hinh_thuc_giao_vn(value: boolean) {
    if (this.selectedEmail) {
      this.selectedEmail.hinh_thuc_giao = value ? 'true' : null;
    }
  }

  get xu_ly_be_mat_vn(): boolean {
    if (!this.selectedEmail) return false;
    const v = this.selectedEmail.xu_ly_be_mat;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
    return !!v;
  }

  set xu_ly_be_mat_vn(value: boolean) {
    if (this.selectedEmail) {
      this.selectedEmail.xu_ly_be_mat = value ? true : false;
    }
  }

  // hanGiao date picker helper (Date <-> ISO string for PrimeNG Calendar)
  get hanGiaoDate(): Date | null {
    if (!this.selectedEmail?.han_giao) return null;
    try {
      const d = new Date(this.selectedEmail.han_giao);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  set hanGiaoDate(value: Date | null) {
    if (this.selectedEmail) {
      this.selectedEmail.han_giao = value ? this.formatDateToIso(value) : null;
    }
  }

  private formatDateToIso(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  onDebug() {
    this.debugModalOpen = true;
  }

  debugModalClose(e: MouseEvent) {
    if (e.target === e.currentTarget) this.debugModalOpen = false;
  }

  getClassifyRaw(): string {
    return this.selectedEmail?.classify_output != null
      ? JSON.stringify(this.selectedEmail.classify_output, null, 2)
      : '(không có classify_output)';
  }

  getDrawingsRaw(): string {
    return this.selectedEmail?.drawings != null
      ? JSON.stringify(this.selectedEmail.drawings, null, 2)
      : '(không có drawings)';
  }

  // ── Push ERP ──────────────────────────────────────────
  async pushToErp() {
    if (this.selectedEmail?.jobId) {
      try {
        await this.mekongService.pushJobToErp(this.selectedEmail.jobId);
        alert('✓ Đã push ERP!');
      } catch (e) {
        console.error('Push ERP error:', e);
      }
    }
  }
}

// ── Helpers (standalone functions from demoV3.js) ──────
function mapJobRowToEmail(job: any): Email {
  const d = job.created_at != null ? new Date(job.created_at) : null;
  const ok = d && !Number.isNaN(d.getTime());
  return {
    id: job.id,
    from: job.sender,
    email: job.sender_email || '',
    subject: job.subject,
    preview: '',
    body: job.ghi_chu || '',
    time: ok
      ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : '—',
    date: fmtDDMMHHmm(job.created_at),
    created_at: job.created_at,
    attachments: job.attachments || [],
    classify: job.classify,
    ngon_ngu: job.ngon_ngu,
    ten_kh: job.ten_cong_ty || job.sender || '',
    han_giao: job.han_giao != null && job.han_giao !== '' ? job.han_giao : null,
    hinh_thuc_giao: job.hinh_thuc_giao || null,
    xu_ly_be_mat: job.xu_ly_be_mat ?? null,
    vat_lieu_chung_nhan: job.vat_lieu_chung_nhan ?? null,
    classify_output: normalizeClassifyOutputFromJob(job),
    drawings: job.drawings || [],
    jobId: job.id,
    unread: false,
    _agent: true,
    _needLoad: false,
  };
}

function mergeAgentIntoInbox(agentEmails: Email[], prev: Email[]): Email[] {
  const nonAgent = prev.filter((e) => !e._agent);
  const loadedById = new Map();
  for (const e of prev) {
    if (e._agent && !e._needLoad && (e.jobId || e.id)) {
      loadedById.set(e.jobId || e.id, e);
    }
  }
  const merged = agentEmails.map((a) => {
    const kept = loadedById.get(a.jobId);
    if (!kept) return a;
    return {
      ...kept,
      preview: a.preview,
      time: a.time,
      date: a.date,
      unread: a.unread,
      attachments:
        a.attachments && a.attachments.length > 0
          ? a.attachments
          : kept.attachments,
    };
  });
  return [...merged, ...nonAgent];
}

function fmtDDMMHHmm(iso: string | null): string {
  const d = iso != null ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function drawingToLine(r: any, i: number): DrawingLine {
  return {
    filename: r.filename || `file_${i}.pdf`,
    page: r.page || i + 1,
    raw: r.raw || '',
    data: {
      ma_ban_ve: r.data?.ma_ban_ve || '',
      so_luong: r.data?.so_luong || '',
      hinh_dang: r.data?.hinh_dang || '',
      dung_sai: r.data?.dung_sai || '',
      vat_lieu: r.data?.vat_lieu || r.data?.vat_lieu_chung_nhan || '',
      kich_thuoc: r.data?.kich_thuoc || '',
      ma_quy_trinh: r.data?.ma_quy_trinh || '',
    },
  };
}

function normalizeClassifyOutputFromJob(job: any) {
  if (!job.classify_output) return null;
  const co = job.classify_output;
  if (typeof co === 'string') {
    try {
      return JSON.parse(co);
    } catch {
      return co;
    }
  }
  return co;
}

function logMekongJobAiResponses(job: any, source: string) {
  if (!shouldLogMekongAi() || !job || typeof console === 'undefined') return;
  const id = job.id ?? job.jobId ?? '?';
  if (job.classify_output != null) {
    console.log(
      `[mekongAI] classify_output (${source}) job=${id}`,
      job.classify_output
    );
  }
  const drawings = job.drawings;
  if (!Array.isArray(drawings) || drawings.length === 0) {
    console.log(`[mekongAI] drawings (${source}) job=${id}: (không có)`);
    return;
  }
  drawings.forEach((dr: any, i: number) => {
    const name = dr.filename ?? dr.name ?? String(i);
    if (dr.raw != null && String(dr.raw).length > 0) {
      console.log(
        `[mekongAI] drawing RAW text (${source}) job=${id} file=${name}`,
        dr.raw
      );
    }
    if (dr.data != null) {
      console.log(
        `[mekongAI] drawing parsed data (${source}) job=${id} file=${name}`,
        dr.data
      );
    }
  });
}

function shouldLogMekongAi() {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  const v = window.localStorage.getItem('mekongDebugAi');
  if (v === '0') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('debugAi');
    if (q === '0') return false;
  } catch (_) {
    /* ignore */
  }
  return true;
}
