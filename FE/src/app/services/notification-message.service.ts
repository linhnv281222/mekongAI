import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class NotificationMessageService {
  constructor(private messageService: MessageService) {}

  notificationSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: '',
      detail: message,
      life: 2500,
    });
  }

  notificationError(message: string): void {
    this.messageService.add({
      severity: 'error',
      summary: '',
      detail: message,
      life: 4000,
    });
  }

  notificationWarning(message: string): void {
    this.messageService.add({
      severity: 'warn',
      summary: '',
      detail: message,
      life: 2500,
    });
  }
}
