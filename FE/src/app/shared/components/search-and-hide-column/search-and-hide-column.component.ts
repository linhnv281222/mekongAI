import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { PopoverModule } from 'primeng/popover';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';

@Component({
  selector: 'app-search-and-hide-column',
  standalone: true,
  imports: [CommonModule, FormsModule, InputTextModule, PopoverModule, CheckboxModule],
  template: `
    <div
      class="w-100 d-flex"
      style="padding: 4px; border: 1px solid #eff1f4; border-radius: 6px; height: 30px;"
    >
      <input
        pInputText
        type="text"
        class="hide-input"
        [(ngModel)]="searchGeneral"
        (keydown.enter)="searchGeneralFunc($event)"
        [placeholder]="''"
        style="border: none; outline: none; flex: 1; padding: 0 8px; font-size: 13px;"
      />
      <div style="display: flex; align-items: center; padding: 0 8px; cursor: pointer;"
           pPopover
           [popover]="contentTemplate"
           popoverPlacement="bottomRight"
           popoverTrigger="click">
        <i class="pi pi-cog" style="color: #bdbdbd; font-size: 0.875rem;"></i>
      </div>

      <ng-template #contentTemplate>
        <div style="min-width: 160px; padding: 8px 0;">
          <p-checkbox
            [(ngModel)]="allChecked"
            (ngModelChange)="updateAllChecked()"
            [binary]="true"
            [label]="'Tất cả'"
          ></p-checkbox>
          <br />
          <ng-container *ngFor="let column of listItem">
            <ng-container *ngIf="column">
              <p-checkbox
                [(ngModel)]="column.check"
                (ngModelChange)="onClickCheckBox()"
                [label]="column.keyTitle"
              ></p-checkbox>
              <br />
            </ng-container>
          </ng-container>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .hide-input { flex: 1; border: none; outline: none; background: transparent; }
  `],
})
export class SearchAndHideColumnComponent {
  @Input() allChecked = false;
  @Input() indeterminate = true;
  @Input() searchGeneral = '';
  @Input() listItem: any[] = [];
  @Output() itemListChange = new EventEmitter<any[]>();
  @Output() searchGeneralOutput = new EventEmitter<any>();

  clickMe(): void {}
  change(value: boolean): void {}

  searchGeneralFunc($event: any): void {
    this.searchGeneralOutput.emit({ event: $event, value: this.searchGeneral });
  }

  clearValue($event: any): void {
    this.searchGeneral = '';
    this.searchGeneralOutput.emit({ event: $event, value: this.searchGeneral });
  }

  updateAllChecked(): void {
    this.indeterminate = false;
    const checkedStatus = this.allChecked;
    this.listItem = this.listItem.map((item) => ({ ...item, check: checkedStatus }));
    this.itemListChange.emit(this.listItem);
  }

  onClickCheckBox(): void {
    const allCheckedVal = this.listItem.every((item) => !!item?.check);
    const noChecked = this.listItem.every((item) => !item?.check);
    this.allChecked = allCheckedVal;
    this.indeterminate = !allCheckedVal && !noChecked;
    this.itemListChange.emit(this.listItem);
  }
}
