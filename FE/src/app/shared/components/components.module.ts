import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ConfirmDialogComponent } from './confirm-dialog/confirm-dialog.component';

@NgModule({
  declarations: [],
  imports: [CommonModule, FormsModule, RouterModule, ConfirmDialogComponent],
  exports: [
    ConfirmDialogComponent,
    CommonModule,
    FormsModule,
    RouterModule,
  ],
})
export class SharedModule {}
