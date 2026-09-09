import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DemoV3Component } from './demo-v3/demo-v3.component';
import { AdminPromptsComponent } from './admin-prompts/admin-prompts.component';
import { AdminTokenStatsComponent } from './admin-token-stats/admin-token-stats.component';

/**
 * Routes cho Mekong AI module
 */
const routes: Routes = [
  {
    path: '',
    redirectTo: 'rfq',
    pathMatch: 'full',
  },
  {
    path: 'rfq',
    component: DemoV3Component,
  },
  {
    path: 'admin/prompts',
    component: AdminPromptsComponent,
  },
  {
    path: 'admin/token-stats',
    component: AdminTokenStatsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MekongAiRoutingModule {}
