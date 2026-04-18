/** Cây gửi API (searchTree) — đồng bộ với BE searchTreeFilter.js (key y-Y, m-Y-M). */

export interface SearchTreeNode {
  title: string;
  key: string;
  keyName?: string;
  isLeaf?: boolean;
  expanded?: boolean;
  checked?: boolean | null;
  children?: SearchTreeNode[] | null;
  properties?: unknown;
  type?: string | null;
}

export function buildYearMonthSearchTreeFromApi(
  rows: { year: number; months: number[] }[],
  keyNames: { year: string; month: string },
): SearchTreeNode[] {
  return rows.map((y) => ({
    title: `Năm ${y.year}`,
    key: `y-${y.year}`,
    keyName: keyNames.year,
    isLeaf: false,
    expanded: true,
    checked: true,
    children: (y.months || []).map((m) => ({
      title: `Tháng ${String(m).padStart(2, '0')}`,
      key: `m-${y.year}-${m}`,
      keyName: keyNames.month,
      isLeaf: true,
      checked: true,
    })),
  }));
}

export function collectAllTreeKeys(nodes: SearchTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (n: SearchTreeNode) => {
    keys.push(n.key);
    if (n.children?.length) {
      for (const c of n.children) {
        walk(c);
      }
    }
  };
  for (const n of nodes) {
    walk(n);
  }
  return keys;
}

/** Gắn checked theo nzCheckedKeys để POST searchTree */
export function mergeCheckedIntoSearchTreePayload(
  nodes: SearchTreeNode[],
  checkedKeySet: Set<string>,
): SearchTreeNode[] {
  const mapNode = (n: SearchTreeNode): SearchTreeNode => ({
    title: n.title,
    key: n.key,
    keyName: n.keyName,
    isLeaf: n.isLeaf,
    expanded: n.expanded,
    properties: n.properties ?? null,
    type: n.type ?? null,
    checked: checkedKeySet.has(n.key),
    children:
      n.children && n.children.length > 0
        ? n.children.map(mapNode)
        : n.children ?? null,
  });
  return nodes.map(mapNode);
}

/** nz-tree nzData (không cần checked trong node) */
export function searchTreeToNzData(nodes: SearchTreeNode[]): Array<{
  title: string;
  key: string;
  isLeaf?: boolean;
  expanded?: boolean;
  children?: ReturnType<typeof searchTreeToNzData>;
}> {
  return nodes.map((n) => ({
    title: n.title,
    key: n.key,
    isLeaf: n.isLeaf,
    expanded: n.expanded !== false && !n.isLeaf,
    children:
      n.children && n.children.length > 0
        ? searchTreeToNzData(n.children)
        : undefined,
  }));
}
