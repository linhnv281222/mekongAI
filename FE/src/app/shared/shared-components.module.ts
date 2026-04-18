import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { AppHeaderComponent } from './components/app-header/app-header.component';

@NgModule({
  declarations: [AppHeaderComponent],
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [AppHeaderComponent, CommonModule, FormsModule, RouterModule],
})
export class SharedComponentsModule {}
