import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TokenUsage {
  classify_tokens?: number;
  drawing_tokens?: number;
  total_tokens?: number;
  classify_model?: string;
  drawing_model?: string;
}

@Component({
  selector: 'app-token-usage-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="token-usage-card" *ngIf="hasTokenData">
      <div class="token-stats">
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(usage.classify_tokens || 0) }}</div>
          <div class="stat-label">Lần trước (token)</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ formatNumber(usage.total_tokens || 0) }}</div>
          <div class="stat-label">Tổng token</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">\${{ formatCost(usage.total_tokens || 0, 'input') }}</div>
          <div class="stat-label">Tổng đã dùng</div>
        </div>
        <div class="stat-item highlight">
          <div class="stat-value">\${{ formatCost(usage.total_tokens || 0, 'output') }}</div>
          <div class="stat-label">Còn lại (ước tính)</div>
        </div>
      </div>
      <div class="model-info" *ngIf="usage.classify_model || usage.drawing_model">
        <span class="model-badge" *ngIf="usage.classify_model">
          <i class="fas fa-robot"></i> {{ usage.classify_model }}
        </span>
        <span class="model-badge" *ngIf="usage.drawing_model">
          <i class="fas fa-file-image"></i> {{ usage.drawing_model }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .token-usage-card {
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
    }

    .token-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 12px;
    }

    .stat-item {
      text-align: center;
      padding: 8px;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.1);
    }

    .stat-item.highlight {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(251, 146, 60, 0.1) 100%);
      border-color: rgba(249, 115, 22, 0.3);
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #F8FAFC;
      margin-bottom: 4px;
      font-variant-numeric: tabular-nums;
    }

    .stat-item.highlight .stat-value {
      color: #FB923C;
    }

    .stat-label {
      font-size: 11px;
      color: #94A3B8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .model-info {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    }

    .model-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 6px;
      font-size: 11px;
      color: #38BDF8;
      font-weight: 500;
    }

    .model-badge i {
      font-size: 10px;
    }

    @media (max-width: 768px) {
      .token-stats {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
    }
  `]
})
export class TokenUsageDisplayComponent {
  @Input() usage: TokenUsage = {};

  get hasTokenData(): boolean {
    return (this.usage?.total_tokens || 0) > 0;
  }

  formatNumber(value: number): string {
    return value.toLocaleString('en-US');
  }

  /**
   * Calculate cost based on model and token count
   * Gemini pricing (approximate):
   * - gemini-3-flash: $0.075 per 1M input tokens, $0.30 per 1M output tokens
   * - gemini-2.0-flash: $0.10 per 1M input tokens, $0.40 per 1M output tokens
   * Claude pricing (approximate):
   * - claude-sonnet-4: $3.00 per 1M input tokens, $15.00 per 1M output tokens
   */
  formatCost(tokens: number, type: 'input' | 'output'): string {
    if (!tokens) return '0.0000';

    const model = this.usage.drawing_model || this.usage.classify_model || '';
    let costPer1M = 0;

    if (model.includes('gemini')) {
      if (model.includes('2.0') || model.includes('2-0')) {
        costPer1M = type === 'input' ? 0.10 : 0.40;
      } else {
        costPer1M = type === 'input' ? 0.075 : 0.30;
      }
    } else if (model.includes('claude')) {
      costPer1M = type === 'input' ? 3.00 : 15.00;
    } else {
      // Default to Gemini flash pricing
      costPer1M = type === 'input' ? 0.075 : 0.30;
    }

    const cost = (tokens / 1_000_000) * costPer1M;
    return cost.toFixed(4);
  }
}
