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
}

const INITIAL_BOT_MESSAGE: ChatMessage = {
  id: 0,
  role: 'bot',
  text:
    'Xin chào! Mekong AI Bot đây.\n\nTôi có thể:\n- Phân tích báo giá: dán nội dung email hoặc đính kèm file PDF bản vẽ.\n- Trả lời các câu hỏi về hệ thống.\n\nGửi tin nhắn để bắt đầu nhé!',
  time: new Date(),
  files: [],
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
  messages: ChatMessage[] = [{ ...INITIAL_BOT_MESSAGE, time: new Date(), id: 0 }];
  input = '';
  files: File[] = [];
  sending = false;
  typing = false;

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
      this.textareaRef.nativeElement.style.height = Math.min(
        this.textareaRef.nativeElement.scrollHeight,
        100
      ) + 'px';
    }
  }

  formatTime(d: Date): string {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  isPdfFile(name: string): boolean {
    return !!name && name.toLowerCase().endsWith('.pdf');
  }

  get fileExt(): string {
    return 'FILE';
  }

  getChipExt(name: string): string {
    return name ? name.split('.').pop()?.toUpperCase() ?? 'FILE' : 'FILE';
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
      alert(`File quá 100MB: ${oversized.map((f) => f.name).join(', ')}`);
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

  send(): void {
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
    userMsg.files.forEach((f) => formData.append('files', f));
    this.http
      .post<{ reply?: string; error?: string }>('/chat/message', formData)
      .subscribe({
        next: (data) => {
          this.typing = false;
          // Hỏi làm rõ — hiển thị câu hỏi nhưng không tạo job
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = data as any;
          if (d.askClarify) {
            this.messages = [
              ...this.messages,
              {
                id: Date.now() + Math.random(),
                role: 'bot',
                text: data.reply || 'Bạn cho mình biết thêm thông tin nhé.',
                time: new Date(),
                files: [],
              },
            ];
          } else if (data.reply) {
            this.messages = [
              ...this.messages,
              {
                id: Date.now() + Math.random(),
                role: 'bot',
                text: data.reply,
                time: new Date(),
                files: [],
              },
            ];
          } else if (data.error) {
            this.messages = [
              ...this.messages,
              {
                id: Date.now() + Math.random(),
                role: 'bot',
                text: 'Đã xảy ra lỗi: ' + data.error,
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
      this.http.get<{ data?: Array<{ id?: string; created_at?: number }> }>('/jobs').subscribe({
        next: (data) => {
          const jobs = data.data || [];
          const chatJobs = jobs.filter(
            (j) => j.id?.startsWith('chat_') && (j.created_at ?? 0) > this.lastSeenJobTime
          );
          if (chatJobs.length > 0) {
            const newest = Math.max(...chatJobs.map((j) => j.created_at || 0));
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
