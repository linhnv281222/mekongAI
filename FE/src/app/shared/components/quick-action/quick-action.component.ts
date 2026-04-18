import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-quick-action',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  templateUrl: './quick-action.component.html',
  styleUrls: ['./quick-action.component.css'],
})
export class QuickActionComponent {
  @Input() action: 'read' | 'update' = 'read';
  @Input() hasRole = true;
  @Output() routerChange = new EventEmitter<'read' | 'update'>();

  bottom = 100;
  right = 24;
  isDragging = false;
  wasDragged = false;
  startX = 0;
  startY = 0;
  initialRight = 0;
  initialBottom = 0;
  readonly dragThreshold = 5;
  popupWidth = 48;
  popupHeight = 48;
  showQuickAction = true;

  onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.wasDragged = false;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.initialRight = this.right;
    this.initialBottom = this.bottom;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) {
      return;
    }
    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;
    if (Math.abs(deltaX) > this.dragThreshold || Math.abs(deltaY) > this.dragThreshold) {
      this.wasDragged = true;
    }
    let newRight = this.initialRight - deltaX;
    let newBottom = this.initialBottom - deltaY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    newRight = Math.max(0, Math.min(newRight, vw - this.popupWidth));
    newBottom = Math.max(0, Math.min(newBottom, vh - this.popupHeight));
    this.right = newRight;
    this.bottom = newBottom;
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  onButtonClick(): void {
    if (!this.wasDragged) {
      this.routerChange.emit(this.action === 'update' ? 'read' : 'update');
    }
  }
}
