/**
 * Tree view utilities - build hierarchy Customer Code > Year > Month
 * Used as filter sidebar - click node to filter email list
 */

import { TreeNode } from 'primeng/api';
import { EmailRow } from '../models/email.model';

interface CustomerGroup {
  [customerCode: string]: YearGroup;
}

interface YearGroup {
  [year: number]: MonthGroup;
}

interface MonthGroup {
  [month: number]: EmailRow[];
}

const MONTH_NAMES_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

/**
 * Build tree structure: Customer Code (level 0) > Year (level 1) > Month (level 2)
 * Tree acts as filter - clicking a node filters the email list
 */
export function buildEmailTree(emails: EmailRow[]): TreeNode[] {
  if (!emails || emails.length === 0) return [];

  // Group by Customer Code > Year > Month
  const customerGroups: CustomerGroup = {};

  for (const email of emails) {
    const date = email.created_at ? new Date(email.created_at) : null;
    if (!date || isNaN(date.getTime())) continue;

    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11

    // Use ma_khach_hang if available, fallback to ten_kh, then 'Khác'
    const customerCode = email.ma_khach_hang || email.ten_kh || 'Khác';

    if (!customerGroups[customerCode]) customerGroups[customerCode] = {};
    if (!customerGroups[customerCode][year]) customerGroups[customerCode][year] = {};
    if (!customerGroups[customerCode][year][month]) {
      customerGroups[customerCode][year][month] = [];
    }

    customerGroups[customerCode][year][month].push(email);
  }

  // Build tree nodes
  const rootNodes: TreeNode[] = [];

  // Sort customer codes alphabetically
  const sortedCustomers = Object.keys(customerGroups).sort();

  for (const customerCode of sortedCustomers) {
    const yearGroups = customerGroups[customerCode];
    const yearChildren: TreeNode[] = [];

    // Sort years descending (newest first)
    const sortedYears = Object.keys(yearGroups)
      .map(y => parseInt(y, 10))
      .sort((a, b) => b - a);

    for (const year of sortedYears) {
      const monthGroups = yearGroups[year];
      const monthChildren: TreeNode[] = [];

      // Sort months descending (newest first)
      const sortedMonths = Object.keys(monthGroups)
        .map(m => parseInt(m, 10))
        .sort((a, b) => b - a);

      for (const month of sortedMonths) {
        const monthEmails = monthGroups[month];

        monthChildren.push({
          key: `month-${customerCode}-${year}-${month}`,
          label: `${MONTH_NAMES_VI[month]} (${monthEmails.length})`,
          data: {
            type: 'month',
            customerCode,
            year,
            month,
          },
          icon: 'pi pi-calendar',
          leaf: true,
        });
      }

      yearChildren.push({
        key: `year-${customerCode}-${year}`,
        label: `${year} (${Object.keys(monthGroups).length} tháng)`,
        data: {
          type: 'year',
          customerCode,
          year,
        },
        icon: 'pi pi-calendar-times',
        children: monthChildren,
        expanded: false,
      });
    }

    // Count total emails for this customer
    const totalEmails = Object.values(yearGroups).reduce((sum, yg) => {
      return sum + Object.values(yg).reduce((s: number, monthEmails) => s + (monthEmails as EmailRow[]).length, 0);
    }, 0);

    rootNodes.push({
      key: `customer-${customerCode}`,
      label: `${customerCode} (${totalEmails})`,
      data: {
        type: 'customer',
        customerCode,
      },
      icon: 'pi pi-building',
      children: yearChildren,
      expanded: false,
    });
  }

  return rootNodes;
}

/**
 * Filter emails based on selected tree node
 */
export function filterEmailsByNode(
  emails: EmailRow[],
  node: TreeNode | null
): EmailRow[] {
  if (!node || !node.data) return emails;

  const { type, customerCode, year, month } = node.data;

  return emails.filter(email => {
    const emailCustomerCode = email.ma_khach_hang || email.ten_kh || 'Khác';
    const emailDate = email.created_at ? new Date(email.created_at) : null;

    if (!emailDate || isNaN(emailDate.getTime())) return false;

    const emailYear = emailDate.getFullYear();
    const emailMonth = emailDate.getMonth();

    // Filter by customer code
    if (emailCustomerCode !== customerCode) return false;

    // Filter by year if year node selected
    if (type === 'year' || type === 'month') {
      if (emailYear !== year) return false;
    }

    // Filter by month if month node selected
    if (type === 'month') {
      if (emailMonth !== month) return false;
    }

    return true;
  });
}

