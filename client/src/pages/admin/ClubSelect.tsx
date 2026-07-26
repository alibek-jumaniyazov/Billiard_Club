import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Select } from 'antd';
import { adminApi } from '../../api';
import type { Club } from '../../types';

interface ClubSelectProps {
  value?: number;
  onChange?: (value: number | undefined) => void;
  placeholder?: string;
  allowClear?: boolean;
  style?: CSSProperties;
}

/**
 * Klub tanlash selecti — server tomonda qidiradi (adminApi.clubs?search=).
 * Xabarnoma yuborish, faktura/jurnal filtrlari uchun umumiy komponent.
 */
const ClubSelect = ({ value, onChange, placeholder, allowClear = true, style }: ClubSelectProps) => {
  const [options, setOptions] = useState<Club[]>([]);
  /** Tanlangan klub — qidiruv natijalaridan tushib qolsa ham nomi saqlanadi */
  const [selected, setSelected] = useState<Club | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await adminApi.clubs({ search: term || undefined, limit: 20 });
      setOptions(res.data);
    } catch {
      // Qidiruv xatosi — ro'yxat bo'sh qoladi, tanlov majburiy emas
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void search('');
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  // Tanlangan klub ro'yxatda uchrasa — eslab qolamiz; tanlov tozalansa — unutamiz
  useEffect(() => {
    if (value === undefined) {
      setSelected(null);
      return;
    }
    const found = options.find((c) => c.id === value);
    if (found) setSelected(found);
  }, [value, options]);

  /**
   * Tanlangan klub qidiruv natijalarida bo'lmasa ham ro'yxatga qo'shiladi —
   * aks holda Select xom raqamli ID ni ko'rsatib qolardi.
   */
  const selectOptions = useMemo(() => {
    const list = options.map((c) => ({ value: c.id, label: c.name }));
    if (selected && value === selected.id && !options.some((c) => c.id === selected.id)) {
      list.unshift({ value: selected.id, label: selected.name });
    }
    return list;
  }, [options, selected, value]);

  return (
    <Select
      showSearch
      value={value}
      onChange={(v) => onChange?.(v)}
      onSearch={(term) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void search(term), 350);
      }}
      filterOption={false}
      loading={loading}
      allowClear={allowClear}
      placeholder={placeholder}
      style={style}
      options={selectOptions}
    />
  );
};

export default ClubSelect;
