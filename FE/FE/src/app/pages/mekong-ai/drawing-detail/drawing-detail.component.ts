import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawingData } from '../models/drawing.model';

@Component({
  selector: 'app-drawing-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './drawing-detail.component.html',
  styleUrls: ['./drawing-detail.component.css']
})
export class DrawingDetailComponent {
  @Input() drawing: DrawingData | null = null;
  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  getNguyenCongActive(): string[] {
    if (!this.drawing?.nguyen_cong_dac_biet) return [];
    const nc = this.drawing.nguyen_cong_dac_biet;
    const active: string[] = [];
    if (nc.wc) active.push('WC');
    if (nc.gf) active.push('GF');
    if (nc.lf) active.push('LF');
    if (nc.han) active.push('HÀN');
    if (nc.cayren) active.push('CAYREN');
    if (nc.dongpin) active.push('ĐÓNG PIN');
    if (nc.tool) active.push('TOOL');
    return active;
  }
}
