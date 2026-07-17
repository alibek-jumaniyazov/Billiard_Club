import { ValueTransformer } from 'typeorm';

/**
 * Postgres DECIMAL/NUMERIC ustunlari JS ga string bo'lib keladi.
 * Bu transformer ularni number ga aylantiradi (pul hisob-kitoblari
 * "12000" + 5000 = "120005000" kabi xatolarga uchramasligi uchun).
 */
export class NumericTransformer implements ValueTransformer {
  to(value?: number | null): number | null | undefined {
    return value;
  }
  from(value?: string | null): number | null {
    if (value === null || value === undefined) return null;
    return parseFloat(value);
  }
}

/** BIGINT ustunlari uchun (totalPausedMs) */
export class BigIntTransformer implements ValueTransformer {
  to(value?: number | null): number | null | undefined {
    return value;
  }
  from(value?: string | null): number {
    if (value === null || value === undefined) return 0;
    return parseInt(value, 10);
  }
}
