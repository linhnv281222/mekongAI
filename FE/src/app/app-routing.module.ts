import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MekongAiModule } from './pages/mekong-ai/mekong-ai.module';

const routes: Routes = [
  { path: '', redirectTo: 'mekong-ai', pathMatch: 'full' },
  { path: 'mekong-ai', loadChildren: () => import('./pages/mekong-ai/mekong-ai.module').then(m => m.MekongAiModule) },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
