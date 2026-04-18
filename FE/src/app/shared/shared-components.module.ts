import { NgModule } from '@angular/core';

import { PaginationComponent } from './components/pagination/pagination.component';
import { ModalDeleteComponent } from './components/modal-delete/modal-delete.component';
import { ModalConfirmComponent } from './components/modal-confirm/modal-confirm.component';
import { QuickActionComponent } from './components/quick-action/quick-action.component';
import { ButtonComponent } from './components/button/button.component';
import { SearchAndHideColumnComponent } from './components/search-and-hide-column/search-and-hide-column.component';
import { SortIconComponent } from './components/sort-icon/sort-icon.component';
import { NoDataComponent } from './components/no-data/no-data.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';

const SHARED_COMPONENTS = [
  PaginationComponent,
  ModalDeleteComponent,
  ModalConfirmComponent,
  QuickActionComponent,
  ButtonComponent,
  SearchAndHideColumnComponent,
  SortIconComponent,
  NoDataComponent,
  ConfirmDialogComponent,
];

@NgModule({
  declarations: [...SHARED_COMPONENTS],
  exports: [...SHARED_COMPONENTS],
})
export class SharedComponentsModule {}
