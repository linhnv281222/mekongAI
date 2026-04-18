import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <button
      pButton
      [type]="btnType"
      [label]="btnTitle"
      [icon]="btnIconType ? 'pi ' + btnIconType : ''"
      [iconPos]="btnIconType && !btnTitle ? 'pi' : undefined"
      [disabled]="btnDisabled"
      [loading]="nzLoading"
      [class]="btnClass"
      [pTooltip]="btnTooltip"
      tooltipPosition="top"
      (click)="onHandleClick()"
    ></button>
  `,
  styles: [],
})
export class ButtonComponent {
  @Input() btnType: 'button' | 'submit' | 'reset' | 'text' | 'outlined' = 'button';
  @Input() btnTitle = '';
  @Input() btnIconType = '';
  @Input() btnIconTheme: any = 'outline';
  @Input() btnTooltip = '';
  @Input() linkSvg = '';
  @Input() btnClass = '';
  @Input() btnDisabled = false;
  @Input() nzDanger = false;
  @Input() nzLoading = false;

  @Output() btnClick = new EventEmitter();

  onHandleClick(): void {
    this.btnClick.emit();
  }
}
