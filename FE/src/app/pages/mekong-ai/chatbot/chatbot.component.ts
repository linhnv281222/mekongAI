import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval } from 'rxjs';

interface ChatMessage {
  id: number;
  role: 'bot' | 'user';
  text: string;
  time: Date;
  files: File[];
  /** Khi bot gửi form RFQ, message này chứa schema form */
  rfqForm?: RfqFormField[];
  drawingsSummary?: DrawingSummary[];
  jobId?: string;
  /** Khi user submit form */
  isFormSubmit?: boolean;
  /** Hien thi nut goi y mo form */
  rfqPrompt?: boolean;
}

interface RfqFormField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'select' | 'textarea';
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface DrawingSummary {
  filename: string;
  page: number;
  data: {
    ma_ban_ve?: string;
    vat_lieu?: string;
    so_luong?: number;
  };
}

interface RfqFormValue {
  [key: string]: string | number | boolean | null;
}

const RFQ_FORM_FIELDS: RfqFormField[] = [
  { key: "ma_khach_hang", label: "Mã khách hàng", type: "text", placeholder: "VD: CUST-001" },
  { key: "ten_cong_ty", label: "Tên công ty khách hàng", type: "text", placeholder: "VD: ABC Precision Co., Ltd", required: true },
  { key: "nguoi_lien_he", label: "Người liên hệ", type: "text", placeholder: "VD: Tanaka Yamada" },
  { key: "email", label: "Email liên hệ", type: "email", placeholder: "VD: tanaka@abc.co.jp" },
  { key: "co_vat", label: "Có VAT không?", type: "select", options: ["Có", "Không"], required: true },
  { key: "xu_ly_be_mat", label: "Có xử lý bề mặt không?", type: "select", options: ["Có", "Không"], required: true },
  {
    key: "so_luong_theo_ve",
    label: "Số lượng theo bản vẽ?",
    type: "select",
    options: ["Theo bản vẽ", "Khác"],
    required: true,
  },
  { key: "so_luong_khac", label: "Số lượng khác (nếu khác bản vẽ)", type: "number", placeholder: "VD: 50" },
  { key: "co_van_chuyen", label: "Có vận chuyển không?", type: "select", options: ["Có", "Không"], required: true },
  { key: "ghi_chu_noi_bo", label: "Ghi chú nội bộ", type: "textarea", placeholder: "Ghi chú chỉ hiển thị trong hệ thống..." },
];

const INITIAL_BOT_MESSAGE: ChatMessage = {
  id: 0,
  role: 'bot',
  text: 'Xin chào! Mekong AI Bot đây.\n\nTôi có thể:\n- Phân tích báo giá: dán nội dung email hoặc đính kèm file PDF bản vẽ.\n- Trả lời các câu hỏi về hệ thống.\n\nGửi tin nhắn để bắt đầu nhé!',
  time: new Date(),
  files: [],
  rfqPrompt: true,
};

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotComponent implements OnInit, OnDestroy {
  @ViewChild('msgsEnd') msgsEndRef!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  panelOpen = false;
  hasNew = false;
  messages: ChatMessage[] = [
    { ...INITIAL_BOT_MESSAGE, time: new Date(), id: 0 },
  ];
  input = '';
  files: File[] = [];
  sending = false;
  typing = false;

  /** Form RFQ đang chờ user điền (sau khi phân tích bản vẽ xong) */
  pendingRfqForm: RfqFormField[] | null = null;
  pendingJobId: string | null = null;
  pendingDrawingsSummary: DrawingSummary[] | null = null;
  rfqFormValues: RfqFormValue = {};

  private pollSub?: Subscription;
  private lastSeenJobTime = Date.now();
  private readonly POLL_INTERVAL = 15000;
  private readonly MAX_FILES = 20;
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024;
  private cdr: ChangeDetectorRef;

  constructor(private http: HttpClient, cdr: ChangeDetectorRef) {
    this.cdr = cdr;
  }

  ngOnInit(): void {
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** Hien thi form RFQ khi user nhan nut goi y */
  showFormFromPrompt(): void {
    this.pendingRfqForm = RFQ_FORM_FIELDS;
    this.pendingJobId = 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    this.pendingDrawingsSummary = null;
    this.rfqFormValues = {};
    for (const field of RFQ_FORM_FIELDS) {
      if (field.type === 'select' && field.options && field.options.length > 0) {
        this.rfqFormValues[field.key] = field.options[0];
      } else {
        this.rfqFormValues[field.key] = '';
      }
    }
    this.cdr.markForCheck();
    setTimeout(() => this.scrollToBottom(), 50);
  }

  toggleFab(): void {
    if (this.panelOpen) {
      this.panelOpen = false;
    } else {
      this.panelOpen = true;
      this.hasNew = false;
    }
    this.cdr.markForCheck();
  }

  hidePanel(): void {
    this.panelOpen = false;
    this.cdr.markForCheck();
  }

  scrollToBottom(): void {
    setTimeout(() => {
      this.msgsEndRef?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  autoResize(): void {
    if (this.textareaRef?.nativeElement) {
      this.textareaRef.nativeElement.style.height = 'auto';
      this.textareaRef.nativeElement.style.height =
        Math.min(this.textareaRef.nativeElement.scrollHeight, 100) + 'px';
    }
  }

  formatTime(d: Date): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  isPdfFile(name: string): boolean {
    return !!name && name.toLowerCase().endsWith('.pdf');
  }

  /**
   * Convert a filename to a safe ASCII name to avoid multipart encoding corruption of CJK chars.
   * Since non-ASCII chars get corrupted, we derive a name from file content hash instead.
   */
  async makeSafeFilename(originalName: string, fileContent: Blob): Promise<string> {
    const lastDot = originalName.lastIndexOf('.');
    const ext = lastDot >= 0 ? originalName.slice(lastDot).toLowerCase() : '';
    // Hash first 64KB of file to get a unique, safe ASCII name
    const chunk = fileContent.slice(0, 65536);
    const hashBuffer = await crypto.subtle.digest('SHA-256', await chunk.arrayBuffer());
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
    return hashHex + ext;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files || []);
    if (!selected.length) return;

    const total = this.files.length + selected.length;
    if (total > this.MAX_FILES) {
      alert('Tối đa 20 file mỗi lần gửi.');
      return;
    }
    const oversized = selected.filter((f) => f.size > this.MAX_FILE_SIZE);
    if (oversized.length > 0) {
      alert(`File qua 100MB: ${oversized.map((f) => f.name).join(', ')}`);
      return;
    }
    this.files = [...this.files, ...selected];
    this.cdr.markForCheck();
    input.value = '';
  }

  removeFile(idx: number): void {
    this.files = this.files.filter((_, i) => i !== idx);
    this.cdr.markForCheck();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  /** Submit form RFQ từ embedded form trong chat */
  async submitRfqForm(): Promise<void> {
    if (this.sending) return;
    if (!this.pendingJobId || !this.pendingRfqForm) return;

    const requiredFields = this.pendingRfqForm.filter((f) => f.required);
    for (const field of requiredFields) {
      const val = this.rfqFormValues[field.key];
      if (val === undefined || val === null || String(val).trim() === '') {
        alert(`Vui lòng điền: ${field.label}`);
        return;
      }
    }

    this.sending = true;
    this.typing = true;

    const formSummary = this.buildFormSummary();
    const userMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text: formSummary,
      time: new Date(),
      files: [],
      isFormSubmit: true,
    };
    this.messages = [...this.messages, userMsg];

    const jobId = this.pendingJobId;
    const formDataJson = JSON.stringify(this.rfqFormValues);
    const savedFiles = [...this.files];
    this.pendingRfqForm = null;
    this.pendingJobId = null;
    this.pendingDrawingsSummary = null;
    this.rfqFormValues = {};
    this.files = [];
    this.input = '';

    this.cdr.markForCheck();
    this.scrollToBottom();

    const formData = new FormData();
    formData.append('rfq_form_data', formDataJson);
    formData.append('job_id', jobId);
    for (const f of savedFiles) {
      const safeName = await this.makeSafeFilename(f.name, f);
      formData.append('files', f.slice(), safeName);
    }

    this.http.post<unknown>('/chat/message', formData).subscribe({
      next: (data) => {
        this.typing = false;
        const d = data as Record<string, unknown>;
        const reply = d['reply'] as string | undefined;
        if (reply) {
          this.messages = [
            ...this.messages,
            {
              id: Date.now() + 1,
              role: 'bot',
              text: reply,
              time: new Date(),
              files: [],
            },
          ];
        } else {
          this.messages = [
            ...this.messages,
            {
              id: Date.now() + 1,
              role: 'bot',
              text: 'Đã xử lý xong nhưng không có phản hồi từ server.',
              time: new Date(),
              files: [],
            },
          ];
        }
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      error: () => {
        this.typing = false;
        this.messages = [
          ...this.messages,
          {
            id: Date.now() + 1,
            role: 'bot',
            text: 'Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.',
            time: new Date(),
            files: [],
          },
        ];
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      complete: () => {
        this.sending = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Build text summary from form values for user message display */
  private buildFormSummary(): string {
    if (!this.pendingRfqForm) return '';
    const lines: string[] = [];
    for (const field of this.pendingRfqForm) {
      const val = this.rfqFormValues[field.key];
      if (val !== undefined && val !== null && val !== '') {
        const label = field.label.replace(/\?$/, '').trim();
        lines.push(`${label}: ${val}`);
      }
    }
    return 'Đã điền thông tin:\n' + lines.join('\n');
  }

  /** Hủy form, quay lại chat thường */
  cancelRfqForm(): void {
    this.pendingRfqForm = null;
    this.pendingJobId = null;
    this.pendingDrawingsSummary = null;
    this.rfqFormValues = {};
    this.cdr.markForCheck();
  }

  async send(): Promise<void> {
    if (this.sending) return;

    const text = this.input.trim();
    if (!text && this.files.length === 0) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      text,
      time: new Date(),
      files: [...this.files],
    };
    this.messages = [...this.messages, userMsg];
    this.input = '';
    this.files = [];
    this.sending = true;
    this.typing = true;

    if (this.textareaRef?.nativeElement) {
      this.textareaRef.nativeElement.style.height = 'auto';
    }

    this.cdr.markForCheck();
    this.scrollToBottom();

    const formData = new FormData();
    if (text) formData.append('message', text);
    await Promise.all(userMsg.files.map(async (f) => {
      const safeName = await this.makeSafeFilename(f.name, f);
      formData.append('files', f.slice(), safeName);
    }));

    this.http.post<unknown>('/chat/message', formData).subscribe({
      next: (data) => {
        this.typing = false;
        const d = data as Record<string, unknown>;
        const reply = d['reply'] as string | undefined;
        const step = d['step'] != null ? String(d['step']) : null;
        const jobId = d['job_id'] as string | undefined;
        const rfqForm = d['rfq_form'] as RfqFormField[] | undefined;
        const drawingsSummary = d['drawings_summary'] as DrawingSummary[] | undefined;
        const error = d['error'] as string | undefined;

        // ── Step 2: Server trả form RFQ ───────────────────────────────────
        if (step === '2' && rfqForm && jobId) {
          this.pendingRfqForm = rfqForm;
          this.pendingJobId = jobId;
          this.pendingDrawingsSummary = drawingsSummary || null;

          // Khởi tạo default values
          this.rfqFormValues = {};
          for (const field of rfqForm) {
            if (field.type === 'select' && field.options && field.options.length > 0) {
              this.rfqFormValues[field.key] = field.options[0];
            } else {
              this.rfqFormValues[field.key] = '';
            }
          }

          this.messages = [
            ...this.messages,
            {
              id: Date.now() + Math.random(),
              role: 'bot',
              text: reply || 'Hãy điền đầy đủ thông tin:',
              time: new Date(),
              files: [],
              rfqForm,
              drawingsSummary,
              jobId,
            },
          ];
          this.cdr.markForCheck();
          this.scrollToBottom();
          return;
        }

        // ── Reply bình thường ───────────────────────────────────────────
        if (reply) {
          this.messages = [
            ...this.messages,
            {
              id: Date.now() + Math.random(),
              role: 'bot',
              text: reply,
              time: new Date(),
              files: [],
            },
          ];
        } else if (error) {
          this.messages = [
            ...this.messages,
            {
              id: Date.now() + Math.random(),
              role: 'bot',
              text: 'Đã xảy ra lỗi: ' + error,
              time: new Date(),
              files: [],
            },
          ];
        } else {
          this.messages = [
            ...this.messages,
            {
              id: Date.now() + Math.random(),
              role: 'bot',
              text: 'Đã xử lý xong nhưng không có phản hồi từ server.',
              time: new Date(),
              files: [],
            },
          ];
        }
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      error: () => {
        this.typing = false;
        this.messages = [
          ...this.messages,
          {
            id: Date.now() + Math.random(),
            role: 'bot',
            text: 'Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.',
            time: new Date(),
            files: [],
          },
        ];
        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      complete: () => {
        this.sending = false;
        this.cdr.markForCheck();
      },
    });
  }

  renderText(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  private startPolling(): void {
    this.pollSub = interval(this.POLL_INTERVAL).subscribe(() => {
      if (this.panelOpen) return;
      this.http
        .get<{ data?: Array<{ id?: string; created_at?: number }> }>('/jobs')
        .subscribe({
          next: (data) => {
            const jobs = data.data || [];
            const chatJobs = jobs.filter(
              (j) =>
                j.id != null && String(j.id).indexOf('chat_') === 0 &&
                (j.created_at ?? 0) > this.lastSeenJobTime
            );
            if (chatJobs.length > 0) {
              const newest = Math.max(
                ...chatJobs.map((j) => j.created_at || 0)
              );
              this.lastSeenJobTime = Math.max(this.lastSeenJobTime, newest);
              this.hasNew = true;
              this.cdr.markForCheck();
            }
          },
          error: () => {},
        });
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
  }
}
