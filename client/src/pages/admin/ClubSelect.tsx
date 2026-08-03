import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Select } from 'antd';
import { adminApi } from '../../api';
import type { Club } from '../../types';

interface CommonProps {
  placeholder?: string;
  allowClear?: boolean;
  style?: CSSProperties;
}

/** Standart rejim — bitta klub */
interface SingleProps extends CommonProps {
  multiple?: false;
  value?: number;
  onChange?: (value: number | undefined) => void;
}

/** `multiple` — ID lar ro'yxati */
interface MultiProps extends CommonProps {
  multiple: true;
  value?: number[];
  onChange?: (value: number[] | undefined) => void;
}

/**
 * Ajratuvchi (discriminated) union: `multiple` bayrog'i `value` va `onChange`
 * tiplarini aniqlaydi, shu sababli bitta klub tanlaydigan mavjud
 * chaqiruvchilar hech qanday cast'siz ishlashda davom etadi.
 */
type ClubSelectProps = SingleProps | MultiProps;

const toIds = (value: number | number[] | undefined): number[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * Klub tanlash selecti — server tomonda qidiradi (adminApi.clubs?search=).
 * Xabarnoma yuborish, faktura/jurnal filtrlari uchun umumiy komponent.
 *
 * Tanlangan klublarning NOMI eslab qolinadi: qidiruv 20 ta natija qaytaradi,
 * shu sababli tanlangan klub keyingi qidiruvda ro'yxatdan tushib qolsa,
 * Select xom raqamli ID ni ko'rsatib qolardi.
 */
const ClubSelect = (props: ClubSelectProps) => {
  const { value, placeholder, allowClear = true, multiple = false, style } = props;
  const [options, setOptions] = useState<Club[]>([]);
  /** id -> klub: tanlangan klublarning nomlari saqlanadigan xotira */
  const [known, setKnown] = useState<Map<number, Club>>(new Map());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Alohida so'ralgan ID lar — cheksiz so'rov halqasining oldini oladi */
  const fetchedRef = useRef<Set<number>>(new Set());

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

  const ids = useMemo(() => toIds(value), [value]);
  const idsKey = ids.join(',');

  // Qidiruv natijalarida uchragan tanlangan klublarni eslab qolamiz
  useEffect(() => {
    if (ids.length === 0) return;
    const found = options.filter((club) => ids.includes(club.id));
    if (found.length === 0) return;
    setKnown((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const club of found) {
        if (next.get(club.id)?.name !== club.name) {
          next.set(club.id, club);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // idsKey — massiv havolasi emas, mazmuni bo'yicha bog'liqlik
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, options]);

  /**
   * Tanlangan ID na ro'yxatda, na xotirada bo'lsa — alohida so'rab olamiz.
   * `?clubId=` chuqur havolasi xom raqam bo'lib ko'rinib qolmasin.
   */
  useEffect(() => {
    for (const id of ids) {
      if (known.has(id) || fetchedRef.current.has(id)) continue;
      if (options.some((club) => club.id === id)) continue;
      fetchedRef.current.add(id);
      adminApi
        .club(id)
        .then((res) => setKnown((prev) => new Map(prev).set(id, res.data)))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, options, known]);

  const selectOptions = useMemo(() => {
    const list = options.map((club) => ({ value: club.id, label: club.name }));
    const present = new Set(options.map((club) => club.id));
    for (const id of ids) {
      if (present.has(id)) continue;
      const club = known.get(id);
      if (club) list.unshift({ value: club.id, label: club.name });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, known, idsKey]);

  return (
    <Select
      showSearch
      mode={multiple ? 'multiple' : undefined}
      maxTagCount="responsive"
      value={value}
      onChange={(v) => {
        if (props.multiple) props.onChange?.(v as number[] | undefined);
        else props.onChange?.(v as number | undefined);
      }}
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
