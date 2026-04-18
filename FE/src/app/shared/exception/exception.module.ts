import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { Exception403Component } from './403.component';
import { Exception404Component } from './404.component';
import { Exception500Component } from './500.component';

const routes: Routes = [
  { path: '403', component: Exception403Component },
  { path: '404', component: Exception404Component },
  { path: '500', component: Exception500Component },
];

@NgModule({
  imports: [CommonModule, RouterModule.forChild(routes)],
  declarations: [
    Exception403Component,
    Exception404Component,
    Exception500Component,
  ],
  exports: [RouterModule],
})
export class ExceptionModule {}
