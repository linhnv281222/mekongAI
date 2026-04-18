import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-sort-icon',
  standalone: true,
  imports: [],
  template: `
    <span *ngIf="countSort == 0 && sorted == true" class="position">
      <i class="pi pi-sort-alt" style="font-size: 0.75rem;"></i>
    </span>
    <span *ngIf="countSort > 0 && sortOrder == 'DESC' && sorted == true" class="position">
      <i class="pi pi-sort-amount-down" style="font-size: 0.75rem;"></i>
    </span>
    <span *ngIf="countSort > 0 && sortOrder == 'ASC' && sorted == true" class="position">
      <i class="pi pi-sort-amount-up" style="font-size: 0.75rem;"></i>
    </span>
  `,
  styles: [`
    .position { display: inline-flex; align-items: center; }
  `],
})
export class SortIconComponent {
  @Input() countSort = 0;
  @Input() sorted = false;
  @Input() sortOrder: string | null = null;
}
