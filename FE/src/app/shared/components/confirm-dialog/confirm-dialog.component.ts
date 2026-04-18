import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [ConfirmDialogModule],
  providers: [MessageService],
  template: `
    <p-confirmDialog
      [header]="title"
      [icon]="warningMessage ? 'pi pi-exclamation-triangle' : 'pi pi-question-circle'"
      [style]="{ width: widthModal + 'px' }"
      [acceptButtonStyleClass]="'p-button-' + okType"
      (accept)="onOk()"
      (reject)="onCancel()"
    ></p-confirmDialog>
  `,
  styles: [],
})
export class ConfirmDialogComponent {
  @Input() title = 'Xác nhận xóa';
  @Input() message = '';
  @Input() warningMessage = 'Cảnh báo';
  @Input() okText = 'Xóa';
  @Input() cancelText = 'Hủy';
  @Input() okType: 'primary' | 'danger' = 'danger';
  @Input() widthModal = 520;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  onOk(): void {
    this.confirmed.emit();
    this.visibleChange.emit(false);
  }

  onCancel(): void {
    this.cancelled.emit();
    this.visibleChange.emit(false);
  }
}
