import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TokenData {
  classify_tokens?: number;
  drawing_tokens?: number;
  total_tokens?: number;
  classify_model?: string;
  drawing_model?: string;
}

@Component({
  selector: 'app-token-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './token-usage.component.html',
  styleUrls: ['./token-usage.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokenUsageComponent {
  @Input() data: TokenData | null = null;
  @Input() compact = true;

  // Gemini pricing (as of 2026-09)
  private readonly GEMINI_INPUT_PRICE = 0.00001875; // $0.01875 per 1M tokens (128k context)
  private readonly GEMINI_OUTPUT_PRICE = 0.000075; // $0.075 per 1M tokens (128k context)

  // Claude pricing
  private readonly CLAUDE_INPUT_PRICE = 0.000003; // $3 per 1M tokens
  private readonly CLAUDE_OUTPUT_PRICE = 0.000015; // $15 per 1M tokens

  get classifyTokens(): number {
    return this.data?.classify_tokens || 0;
  }

  get drawingTokens(): number {
    return this.data?.drawing_tokens || 0;
  }

  get totalTokens(): number {
    return this.data?.total_tokens || 0;
  }

  get classifyModel(): string {
    return this.data?.classify_model || 'unknown';
  }

  get drawingModel(): string {
    return this.data?.drawing_model || 'unknown';
  }

  get estimatedCostUSD(): number {
    // Assume 70% input, 30% output for mixed token usage
    const inputRatio = 0.7;
    const outputRatio = 0.3;

    let cost = 0;

    // Calculate classify cost
    if (this.classifyTokens > 0) {
      const isGemini = this.classifyModel.toLowerCase().includes('gemini');
      const inputPrice = isGemini ? this.GEMINI_INPUT_PRICE : this.CLAUDE_INPUT_PRICE;
      const outputPrice = isGemini ? this.GEMINI_OUTPUT_PRICE : this.CLAUDE_OUTPUT_PRICE;
      cost += (this.classifyTokens * inputRatio * inputPrice) + (this.classifyTokens * outputRatio * outputPrice);
    }

    // Calculate drawing cost
    if (this.drawingTokens > 0) {
      const isGemini = this.drawingModel.toLowerCase().includes('gemini');
      const inputPrice = isGemini ? this.GEMINI_INPUT_PRICE : this.CLAUDE_INPUT_PRICE;
      const outputPrice = isGemini ? this.GEMINI_OUTPUT_PRICE : this.CLAUDE_OUTPUT_PRICE;
      cost += (this.drawingTokens * inputRatio * inputPrice) + (this.drawingTokens * outputRatio * outputPrice);
    }

    return cost;
  }

  get usedAmountUSD(): number {
    // Simplified: use average price
    const avgPrice = (this.GEMINI_INPUT_PRICE + this.GEMINI_OUTPUT_PRICE) / 2;
    return this.totalTokens * avgPrice;
  }

  formatNumber(num: number): string {
    return num.toLocaleString('en-US');
  }

  formatCurrency(amount: number): string {
    return '$' + amount.toFixed(4);
  }
}
