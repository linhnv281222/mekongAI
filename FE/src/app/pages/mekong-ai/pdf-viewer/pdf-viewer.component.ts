import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';

@Component({
  selector: 'app-pdf-viewer',
  templateUrl: './pdf-viewer.component.html',
  styleUrls: ['./pdf-viewer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class AppPdfViewerComponent implements OnChanges, OnDestroy {
  @Input() pdfData: Uint8Array | null = null;
  @Input() currentPage = 1;
  @Output() pageChange = new EventEmitter<number>();
  @Input() fileName = '';

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;

  isLoading = true;
  loadError: string | null = null;
  totalPages = 0;
  scale = 1.0;

  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private pageRenderTask: pdfjsLib.RenderTask | null = null;
  private currentRenderedPage = 0;
  private destroyed = false;

  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (this.destroyed) return;

    if (changes['pdfData'] && this.pdfData) {
      this.isLoading = true;
      this.loadError = null;
      this.totalPages = 0;
      this.currentRenderedPage = 0;
      this.cdr.markForCheck();

      try {
        const loadingTask = pdfjsLib.getDocument({ data: this.pdfData });
        const doc = await loadingTask.promise;
        if (this.destroyed) {
          doc.destroy();
          return;
        }
        this.pdfDoc = doc;
        this.totalPages = doc.numPages;
        await this.renderPage(this.currentPage);
      } catch (err: any) {
        if (this.destroyed) return;
        this.isLoading = false;
        this.loadError = err?.message || 'Không thể tải PDF.';
        this.cdr.markForCheck();
      }
    }

    if (
      changes['currentPage'] &&
      !changes['currentPage'].firstChange &&
      this.pdfDoc
    ) {
      const page = this.currentPage;
      if (
        page >= 1 &&
        page <= this.totalPages &&
        page !== this.currentRenderedPage
      ) {
        this.currentRenderedPage = page;
        this.renderPage(page);
        this.pageChange.emit(page);
      }
    }
  }

  zoomIn(): void {
    if (this.scale < 4) {
      this.scale = Math.min(4, this.scale + 0.25);
      this.renderPage(this.currentRenderedPage);
    }
  }

  zoomOut(): void {
    if (this.scale > 0.5) {
      this.scale = Math.max(0.5, this.scale - 0.25);
      this.renderPage(this.currentRenderedPage);
    }
  }

  private async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || this.destroyed) return;

    if (this.pageRenderTask) {
      this.pageRenderTask.cancel();
      this.pageRenderTask = null;
    }

    this.isLoading = true;
    this.cdr.markForCheck();

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      if (this.destroyed) return;
      const viewport = page.getViewport({
        scale: window.devicePixelRatio * this.scale,
      });

      const container = this.canvasContainer?.nativeElement;
      if (!container) return;

      const existingCanvas = container.querySelector('canvas');
      if (existingCanvas) existingCanvas.remove();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const displayWidth = viewport.width / window.devicePixelRatio;
      const displayHeight = viewport.height / window.devicePixelRatio;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      canvas.style.display = 'block';

      container.appendChild(canvas);

      this.pageRenderTask = page.render({ canvasContext: ctx, viewport });
      await this.pageRenderTask.promise;

      if (this.destroyed) return;
      this.currentRenderedPage = pageNum;
      this.isLoading = false;
      this.loadError = null;
      this.cdr.markForCheck();
    } catch (err: any) {
      if (this.destroyed || err?.name === 'RenderingCancelledException') return;
      this.isLoading = false;
      this.loadError = err?.message || 'Lỗi khi render trang.';
      this.cdr.markForCheck();
    }
  }

  goToPrevPage(): void {
    if (this.currentPage > 1) {
      this.navigateToPage(this.currentPage - 1);
    }
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.navigateToPage(this.currentPage + 1);
    }
  }

  private navigateToPage(page: number): void {
    if (
      page >= 1 &&
      page <= this.totalPages &&
      page !== this.currentRenderedPage
    ) {
      this.currentPage = page;
      this.renderPage(page);
      this.pageChange.emit(page);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.pageRenderTask) {
      this.pageRenderTask.cancel();
    }
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}
