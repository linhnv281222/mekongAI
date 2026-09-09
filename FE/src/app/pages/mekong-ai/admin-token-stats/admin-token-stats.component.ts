import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MekongAiService } from '../mekong-ai.service';

interface TokenStats {
  success: boolean;
  filters: {
    start?: string;
    end?: string;
    model?: string;
  };
  totals: {
    total_jobs: number;
    total_classify_tokens: number;
    total_drawing_tokens: number;
    total_tokens: number;
    avg_tokens_per_job: number;
  };
  daily: DailyTokenStats[];
}

interface DailyTokenStats {
  date: string;
  job_count: number;
  classify_tokens: number;
  drawing_tokens: number;
  total_tokens: number;
  classify_model: string;
  drawing_model: string;
}

interface JobTokenDetail {
  id: number;
  gmail_id: string;
  subject: string;
  classify_tokens: number;
  drawing_tokens: number;
  total_tokens: number;
  classify_model: string;
  drawing_model: string;
  created_at: string;
  status: string;
}

@Component({
  selector: 'app-admin-token-stats',
  templateUrl: './admin-token-stats.component.html',
  styleUrls: ['./admin-token-stats.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule]
})
export class AdminTokenStatsComponent implements OnInit {
  // Filter state
  startDate: string = '';
  endDate: string = '';
  modelFilter: string = '';

  // Data
  stats: TokenStats | null = null;
  loading: boolean = false;
  error: string = '';

  // Pricing per 1M tokens (estimated)
  private readonly PRICING: { [key: string]: { input: number; output: number } } = {
    'xiaomi': { input: 0.1, output: 0.1 },
    'gemini': { input: 0.075, output: 0.15 },
    'claude': { input: 3, output: 15 }
  };

  constructor(private mekongService: MekongAiService) {}

  ngOnInit(): void {
    // Set default date range (last 7 days)
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    this.endDate = this.formatDate(today);
    this.startDate = this.formatDate(weekAgo);

    this.loadStats();
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  async loadStats(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      const params = new URLSearchParams();
      if (this.startDate) params.set('start', this.startDate);
      if (this.endDate) params.set('end', this.endDate);
      if (this.modelFilter) params.set('model', this.modelFilter);

      const response = await fetch(`/api/token-stats?${params}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load statistics');
      }

      this.stats = data;
    } catch (err: any) {
      this.error = err.message || 'Unknown error';
      console.error('[TokenStats] Error:', err);
    } finally {
      this.loading = false;
    }
  }

  formatNumber(num: number): string {
    return new Intl.NumberFormat('en-US').format(num || 0);
  }

  estimateTotalCost(): number {
    if (!this.stats) return 0;

    let totalCost = 0;
    this.stats.daily.forEach(row => {
      const classifyModel = row.classify_model || '';
      const drawingModel = row.drawing_model || '';

      totalCost += this.estimateCost(row.classify_tokens, classifyModel);
      totalCost += this.estimateCost(row.drawing_tokens, drawingModel);
    });

    return totalCost;
  }

  private estimateCost(tokens: number, model: string): number {
    // Assume 50/50 input/output split for simplicity
    const modelKey = Object.keys(this.PRICING).find(k => model?.toLowerCase().includes(k));
    if (!modelKey) return 0;

    const pricing = this.PRICING[modelKey];
    const inputTokens = tokens * 0.5;
    const outputTokens = tokens * 0.5;

    return (inputTokens / 1000000 * pricing.input) + (outputTokens / 1000000 * pricing.output);
  }

  formatCost(usd: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(usd || 0);
  }

  getCostPerJob(): string {
    if (!this.stats || this.stats.totals.total_jobs === 0) return '$0.0000';
    const totalCost = this.estimateTotalCost();
    return this.formatCost(totalCost / this.stats.totals.total_jobs);
  }
}
