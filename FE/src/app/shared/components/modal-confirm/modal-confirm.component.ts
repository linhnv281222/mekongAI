import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ModalModule } from 'primeng/modal';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-confirm',
  standalone: true,
  imports: [CommonModule, ModalModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="isShowModal"
      [header]="titleModal"
      [modal]="true"
      [style]="{ width: widthModal + 'px' }"
      [closable]="true"
      (onHide)="onHandleCancelModal()"
    >
      <div>
        <p class="modal-confirm__content" style="margin: 0 0 16px 0; color: #42526d;">
          <b>{{ headerContent }}</b>
        </p>
        <div
          *ngIf="contentModal"
          style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-left: 4px solid #b50000; background: #fef2f2; border-radius: 4px;"
        >
          <i class="pi pi-exclamation-triangle" style="color: #b50000; font-size: 1rem;"></i>
          <div>
            <div style="color: #7f1d1d; font-weight: 600; margin-bottom: 4px;">{{ warningContent }}</div>
            <div style="color: #42526d;"><b>{{ contentModal }}</b></div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
          <button pButton type="button" [label]="titleBtnCancel" class="p-button-text"
                  (click)="onHandleCancelModal()"></button>
          <button pButton type="button" [label]="titleBtnPrimary"
                  [class]="okType === 'danger' ? 'p-button-danger' : 'p-button-primary'"
                  (click)="onHandleConfirmModal()"></button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [],
})
export class ModalConfirmComponent {
  @Input() isShowModal = false;
  @Input() widthModal = 520;
  @Input() titleModal = 'Xác nhận';
  @Input() titleBtnPrimary = 'Xác nhận';
  @Input() titleBtnCancel = 'Hủy';
  @Input() contentModal = '';
  @Input() headerContent = '';
  @Input() warningContent = 'Lưu ý';
  @Output() isConfirmDelete = new EventEmitter<boolean>();
  @Output() isCancelDelete = new EventEmitter<boolean>();

  onHandleCancelModal(): void {
    this.isCancelDelete.emit(false);
    this.isShowModal = false;
  }

  onHandleConfirmModal(): void {
    this.isCancelDelete.emit(false);
    this.isConfirmDelete.emit(true);
    this.isShowModal = false;
  }
}
