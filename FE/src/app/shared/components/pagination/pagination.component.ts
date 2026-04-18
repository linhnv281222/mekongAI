import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginatorModule, InputTextModule, SelectButtonModule],
  template: `
    <div class="pagination-bar">
      <div class="pagination-bar__size">
        <p-selectButton
          [options]="sizeOptions"
          [(ngModel)]="currentSize"
          (ngModelChange)="changeSize()"
          [optionLabel]="'label'"
          [optionValue]="'value'"
        ></p-selectButton>
      </div>

      <div class="pagination-bar__pages">
        <div class="pagination-bar__total-text">
          Hiển thị {{ currentPage }} / {{ totalPage }} ( {{ total }} bản ghi )
        </div>
        <p-paginator
          [rows]="currentSize"
          [totalRecords]="total"
          [showCurrentPageReport]="false"
          (onPageChange)="changeIndex($event)"
          [rowsPerPageOptions]="[]"
        ></p-paginator>
      </div>

      <div class="pagination-bar__jump">
        <span class="pagination-bar__jump-label">Đi tới trang</span>
        <input
          pInputText
          type="number"
          class="pagination-bar__jump-input"
          [value]="currentPage"
          (keyup.enter)="changePage($event)"
          min="1"
        />
      </div>
    </div>
  `,
  styles: [],
})
export class PaginationComponent {
  @Input() total = 0;
  @Output() emitPage = new EventEmitter<{ page: number; size: number }>();
  @Input() currentPage = 1;
  @Input() currentSize = 20;

  totalPage = 1;

  sizeOptions = [
    { label: '10 / trang', value: 10 },
    { label: '20 / trang', value: 20 },
    { label: '30 / trang', value: 30 },
    { label: '40 / trang', value: 40 },
  ];

  ngOnChanges(): void {
    this.totalPage = this.currentSize ? Math.ceil(this.total / this.currentSize) : 1;
  }

  changeIndex(event: any): void {
    this.currentPage = event.first / this.currentSize + 1;
    this.totalPage = this.currentSize ? Math.ceil(this.total / this.currentSize) : 1;
    this.emitPage.emit({ page: this.currentPage, size: this.currentSize });
  }

  changeSize(): void {
    if (!this.currentSize) {
      this.currentSize = 20;
    }
    this.currentPage = 1;
    this.totalPage = this.currentSize ? Math.ceil(this.total / this.currentSize) : 1;
    this.emitPage.emit({ page: this.currentPage, size: this.currentSize });
  }

  changePage(event: any): void {
    const prev = this.currentPage;
    const n = Number(event.target.value);
    this.currentPage = n;
    if (this.currentPage < 1) {
      this.currentPage = 1;
    } else if (this.currentPage > this.totalPage) {
      this.currentPage = this.totalPage;
    }
    this.emitPage.emit({ page: this.currentPage, size: this.currentSize });
  }
}
