import { Component } from '@angular/core';

/** Giống project-demo: icon + chữ tĩnh (không translate) */
@Component({
  selector: 'app-no-data',
  standalone: true,
  imports: [],
  template: `
    <div class="no-data-container">
      <img class="no-data-image" src="./assets/icon/no-result.svg" alt="" />
      <span class="color-text">Không có dữ liệu</span>
    </div>
  `,
  styles: [
    `
      .no-data-container {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        text-align: center;
        padding: 32px 16px;
        min-height: 120px;
        box-sizing: border-box;
      }
      .no-data-image {
        width: 6vw;
        min-width: 56px;
        max-width: 120px;
        margin-bottom: 8px;
      }
      .color-text {
        color: #667085;
        font-size: 12px;
        font-style: normal;
        font-weight: 300;
        line-height: 16px;
      }
    `,
  ],
})
export class NoDataComponent {}
