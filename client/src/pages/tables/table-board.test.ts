import { describe, expect, it } from 'vitest';
import type { BilliardTable } from '../../types';
import { parseTableView, selectBoardTables, tableNeedsAttention } from './table-board';

const table = (id: number, patch: Partial<BilliardTable> = {}): BilliardTable => ({
  id, clubId: 1, number: id, name: `Pool ${id}`, status: 'free', pricePerHour: 50000,
  description: null, isActive: true, createdAt: '', updatedAt: '', ...patch,
});
const session = (patch = {}) => ({ id: 20, status: 'active', customerName: 'Aziza', customerPhone: '+998901234567', ...patch }) as NonNullable<BilliardTable['sessions']>[number];

describe('table workspace selection', () => {
  it('keeps paused games in busy and attention views without marking them free', () => {
    const paused = table(2, { status: 'busy', sessions: [session({ status: 'paused' })] });
    expect(selectBoardTables([paused], 'busy', '', 'number')).toEqual([paused]);
    expect(selectBoardTables([paused], 'paused', '', 'number')).toEqual([paused]);
    expect(selectBoardTables([paused], 'attention', '', 'number')).toEqual([paused]);
    expect(selectBoardTables([paused], 'free', '', 'number')).toEqual([]);
  });
  it('shows actionable light failures and pending local sessions in attention', () => {
    expect(tableNeedsAttention(table(1, { lightControl: true, lightError: 'offline' }))).toBe(true);
    expect(tableNeedsAttention(table(1, { lightControl: false, lightError: 'old error' }))).toBe(false);
    expect(tableNeedsAttention(table(1, { sessions: [session({ offlineLocalId: 'queued' })] }))).toBe(true);
  });
  it('combines search with status and supports guest names and phone numbers', () => {
    const busy = table(12, { status: 'busy', sessions: [session()] });
    expect(selectBoardTables([busy], 'busy', ' AZIZA ', 'number')).toEqual([busy]);
    expect(selectBoardTables([busy], 'all', '901234567', 'number')).toEqual([busy]);
    expect(selectBoardTables([busy], 'free', '12', 'number')).toEqual([]);
  });
  it('uses number/id tie breakers and leaves the input order intact', () => {
    const rows = [table(9, { number: 2 }), table(4, { number: 2, status: 'busy' }), table(1)];
    expect(selectBoardTables(rows, 'all', '', 'number').map((row) => row.id)).toEqual([1, 4, 9]);
    expect(selectBoardTables(rows, 'all', '', 'busy').map((row) => row.id)).toEqual([4, 1, 9]);
    expect(rows.map((row) => row.id)).toEqual([9, 4, 1]);
  });
  it('accepts quick-navigation filters and safely defaults unknown queries', () => {
    expect(parseTableView('attention')).toBe('attention');
    expect(parseTableView('paused')).toBe('paused');
    expect(parseTableView('garbage')).toBe('all');
    expect(parseTableView(null)).toBe('all');
  });
});
