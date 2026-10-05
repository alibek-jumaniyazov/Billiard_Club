import type { BilliardTable } from '../../types';

export type TableView = 'all' | 'free' | 'busy' | 'paused' | 'attention';
export type TableSort = 'number' | 'busy';

export const parseTableView = (value: string | null): TableView =>
  value === 'free' || value === 'busy' || value === 'paused' || value === 'attention' ? value : 'all';

export const tableNeedsAttention = (table: BilliardTable): boolean =>
  table.sessions?.[0]?.status === 'paused' || !!table.sessions?.[0]?.offlineLocalId
  || !!(table.lightControl && table.lightError);

export const tableMatchesView = (table: BilliardTable, view: TableView): boolean => {
  if (view === 'attention') return tableNeedsAttention(table);
  if (view === 'paused') return table.sessions?.[0]?.status === 'paused';
  return view === 'all' || table.status === view;
};

/** Stable order avoids moving cards as live timers update; never mutates API data. */
export function selectBoardTables(tables: BilliardTable[], view: TableView, query: string, sort: TableSort): BilliardTable[] {
  const search = query.trim().toLocaleLowerCase();
  return tables.filter((table) => tableMatchesView(table, view) && (!search ||
    [table.number, table.name, table.sessions?.[0]?.customerName, table.sessions?.[0]?.customerPhone]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(search))))
    .sort((a, b) => (sort === 'busy' ? Number(b.status === 'busy') - Number(a.status === 'busy') : 0)
      || a.number - b.number || a.id - b.id);
}
