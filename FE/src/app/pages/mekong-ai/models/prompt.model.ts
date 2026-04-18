/**
 * Prompt & Knowledge models
 */
export interface PromptTemplate {
  key: string;
  name: string;
  description?: string;
  active_version?: number;
  active_content?: string;
  variables?: string[];
}

export interface PromptVersion {
  version: number;
  content: string;
  note: string;
  created_by: string;
  is_active: boolean;
  created_at?: string;
}

export interface KnowledgeBlock {
  key: string;
  name: string;
  description?: string;
  format?: 'text' | 'table';
  headers?: string[];
  rows?: KnowledgeRow[];
  content?: string;
  updated_at?: string;
}

export interface KnowledgeRow {
  group: string;
  from: string;
  to: string;
  note: string;
}

export interface UiSchema {
  generalRows?: UiRow[];
  hiddenKeys?: string[];
  appendUnknownClassifyKeys?: boolean;
}

export interface UiRow {
  layout?: 'fg-1' | 'fg-2' | 'fg-3';
  cells: UiCell[];
}

export interface UiCell {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean' | 'shipping';
  ai?: boolean | 'auto';
  defaultValue?: any;
  hideIfEmpty?: boolean;
  showWhenKey?: string;
  options?: Array<{ v: string; l: string }> | string[];
  rows?: number;
}
