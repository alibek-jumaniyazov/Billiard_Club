import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

/** Display an instant in the club's timezone, independent of the device. */
export const inClubTime = (instant: string | number | undefined, timezone: string): Dayjs =>
  dayjs(instant).tz(timezone);

/** DatePicker values represent wall-clock fields; interpret them at the club. */
export const clubWallTimeToIso = (value: Dayjs, timezone: string): string =>
  dayjs.tz(value.format('YYYY-MM-DD HH:mm:ss'), timezone).toISOString();
