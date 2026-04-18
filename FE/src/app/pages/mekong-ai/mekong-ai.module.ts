import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { TableModule } from 'primeng/table';
import { TabViewModule } from 'primeng/tabview';
import { CalendarModule } from 'primeng/calendar';
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { DropdownModule } from 'primeng/dropdown';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { MekongAiRoutingModule } from './mekong-ai-routing.module';
import { AdminPromptsComponent } from './admin-prompts/admin-prompts.component';
import { SafeUrlPipe } from './pipes/safe-url.pipe';
import { DemoV3Component } from './demo-v3/demo-v3.component';

@NgModule({
  declarations: [DemoV3Component, AdminPromptsComponent, SafeUrlPipe],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    TranslateModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    DialogModule,
    ProgressBarModule,
    TableModule,
    TabViewModule,
    CalendarModule,
    RadioButtonModule,
    InputTextareaModule,
    DropdownModule,
    ChipModule,
    TagModule,
    BadgeModule,
    AvatarModule,
    TooltipModule,
    MekongAiRoutingModule,
  ],
  exports: [DemoV3Component, AdminPromptsComponent, SafeUrlPipe],
  providers: [MessageService],
})
export class MekongAiModule {}
