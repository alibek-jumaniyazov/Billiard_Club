import { useCallback, useEffect, useRef, useState } from 'react';
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
      options={options.map((c) => ({ value: c.id, label: c.name }))}
    />
  );
};

export default ClubSelect;
