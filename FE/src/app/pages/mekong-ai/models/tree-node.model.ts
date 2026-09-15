export interface EmailTreeNode {
  key: string;
  label: string;
  data?: {
    type: 'year' | 'month' | 'customer' | 'email';
    year?: number;
    month?: number;
    customerCode?: string | null;
    emailId?: number | string;
  };
  icon?: string;
  children?: EmailTreeNode[];
  leaf?: boolean;
  expanded?: boolean;
  styleClass?: string;
}
