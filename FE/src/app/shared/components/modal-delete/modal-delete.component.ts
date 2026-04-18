import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalModule } from 'primeng/modal';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-delete',
  standalone: true,
  imports: [CommonModule, ModalModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="isShowModal"
      [header]="'Thông báo ' + titleModal"
      [modal]="true"
      [style]="{ width: widthModal + 'px' }"
      [closable]="true"
      (onHide)="onHandleCancelModal()"
    >
      <div>
        <p style="margin: 0 0 16px 0; color: #42526d;">
          Bạn có chắc muốn xóa <strong>{{ contentModal }}</strong>?
        </p>
        <div
          style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-left: 4px solid #b50000; background: #fef2f2; border-radius: 4px;"
        >
          <i class="pi pi-exclamation-triangle" style="color: #b50000; font-size: 1rem;"></i>
          <div>
            <div style="color: #7f1d1d; font-weight: 600; margin-bottom: 4px;">Cảnh báo:</div>
            <div style="color: #42526d;">Thao tác xóa <strong>{{ contentModal }}</strong> không thể hoàn tác.</div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button pButton type="button" label="Đóng" class="p-button-text"
                  (click)="onHandleCancelModal()"></button>
          <button pButton type="button" label="Xóa" class="p-button-danger"
                  (click)="onHandleConfirmModal()"></button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [],
})
export class ModalDeleteComponent {
  @Input() isShowModal = false;
  @Input() widthModal = 520;
  @Input() titleModal = 'xóa bản ghi';
  @Input() contentModal = '';
  @Output() isConfirmDelete = new EventEmitter<boolean>();
  @Output() isCancelDelete = new EventEmitter<boolean>();

  onHandleCancelModal(): void {
    this.isCancelDelete.emit(false);
    this.isShowModal = false;
  }

  onHandleConfirmModal(): void {
    this.isConfirmDelete.emit(true);
    this.isShowModal = false;
  }
}
