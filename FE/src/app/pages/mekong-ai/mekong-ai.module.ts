import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';

// Angular Material
import { MatIconModule } from '@angular/material/icon';

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
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
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputMaskModule } from 'primeng/inputmask';
import { SplitterModule } from 'primeng/splitter';
import { InputSwitchModule } from 'primeng/inputswitch';
import { VirtualScrollerModule } from 'primeng/virtualscroller';
import { TreeModule } from 'primeng/tree';

import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { MekongAiRoutingModule } from './mekong-ai-routing.module';
import { AdminPromptsComponent } from './admin-prompts/admin-prompts.component';
import { AdminTokenStatsComponent } from './admin-token-stats/admin-token-stats.component';
import { SafeUrlPipe } from './pipes/safe-url.pipe';
import { DemoV3Component } from './demo-v3/demo-v3.component';
import { DemoV3Service } from './demo-v3/demo-v3.service';
import { ChatbotComponent } from './chatbot/chatbot.component';
import { SharedComponentsModule } from '../../shared/shared-components.module';
import { AppPdfViewerComponent } from './pdf-viewer/pdf-viewer.component';
import { TokenUsageComponent } from './components/token-usage/token-usage.component';

@NgModule({
  declarations: [DemoV3Component, AdminPromptsComponent, SafeUrlPipe, ChatbotComponent, AppPdfViewerComponent],
  imports: [
    AdminTokenStatsComponent,
    TokenUsageComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    TranslateModule,
    MatIconModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    ToastModule,
    DialogModule,
    ProgressBarModule,
    ProgressSpinnerModule,
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
    AutoCompleteModule,
    ConfirmDialogModule,
    InputMaskModule,
    InputSwitchModule,
    SplitterModule,
    VirtualScrollerModule,
    TreeModule,
    RouterModule,
    SharedComponentsModule,
    MekongAiRoutingModule,
  ],
  exports: [DemoV3Component, AdminPromptsComponent, SafeUrlPipe, ChatbotComponent],
  providers: [MessageService, ConfirmationService, DemoV3Service],
})
export class MekongAiModule {}
