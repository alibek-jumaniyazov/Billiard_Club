import { Alert, Button, Skeleton } from 'antd';
import { ArrowRightOutlined, BulbOutlined, CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { lightHealth, needsLightAttention } from '../tables/lights/light-health';
import { lightCopy } from '../tables/lights/light-copy';
import type { LiveDashboardStats } from './types';
import { clubDateKey, reservationLink } from './operations';
import { useOperations } from './useOperations';
import '../../styles/operations.css';

export default function OperationsPanel({ stats, clockOffset }: { stats: LiveDashboardStats | null; clockOffset: number }) {
  const { i18n, t } = useTranslation();
  const { club } = useAuth();
  const ru = i18n.language.startsWith('ru');
  const copy = lightCopy(ru);
  const { lights, arrivals, loading, refresh } = useOperations(club?.id, clockOffset);
  const now = Date.now() + clockOffset;
  const timezone = stats?.timezone ?? 'Asia/Tashkent';
  const data = lights.data;
  const tables = data?.tables.filter((table) => table.isActive) ?? [];
  const configured = tables.filter((table) => table.driver !== 'none');
  const health = (table: (typeof tables)[number]) => lightHealth(table, data!.mode, data!.bridge.online, data!.forceSyncSec, now);
  const lightIssues = configured.filter((table) => needsLightAttention(health(table)));
  const confirmed = configured.filter((table) => health(table) === 'confirmed').length;
  const paused = tables.filter((table) => table.sessionStatus === 'paused').length;
  const busy = tables.filter((table) => !!table.sessionStatus).length;
  const dateFormat = new Intl.DateTimeFormat(ru ? 'ru-RU' : 'uz-UZ', { timeZone: timezone, day: 'numeric', month: 'short' });
  const timeFormat = new Intl.DateTimeFormat(ru ? 'ru-RU' : 'uz-UZ', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const lightSummary = !data ? (ru ? 'Состояние не получено' : 'Holat olinmagan')
    : data.mode === 'off' ? copy.health.disabled
    : data.mode === 'bridge' && !data.bridge.online ? copy.health.offline
    : !configured.length ? copy.health.unconfigured
    : `${confirmed} / ${configured.length} · ${copy.confirmed}`;

  return <section className="club-operations" aria-labelledby="operations-title">
    <div className="club-operations__heading">
      <div><span className="club-operations__eyebrow">{ru ? 'СЕЙЧАС В КЛУБЕ' : 'HOZIR KLUBDA'}</span>
        <h2 id="operations-title">{ru ? 'Каждый стол. Каждый гость.' : 'Har bir stol. Har bir mehmon.'}</h2>
        <p>{ru ? 'Зал, ближайшие брони и состояние освещения.' : 'Zal, yaqin bronlar va chiroqlar holati bir joyda.'}</p></div>
      <Button icon={<ReloadOutlined spin={loading} />} disabled={loading} onClick={() => void refresh()}>{t('btn.refresh')}</Button>
    </div>
    <div className="club-operations__grid">
      <section className="club-operations__room" aria-label={ru ? 'Обзор зала' : 'Zal ko‘rinishi'}>
        <div className="club-operations__section-title"><h3>{ru ? 'Ваш зал' : 'Sizning zalingiz'}</h3>
          <Link to="/tables">{ru ? 'Управление' : 'Boshqarish'} <ArrowRightOutlined /></Link></div>
        {lights.failed && <Alert type="warning" showIcon message={ru ? 'Зал не обновлён. Проверьте соединение.' : 'Zal holati yangilanmadi. Aloqani tekshiring.'} />}
        {!data && loading ? <Skeleton active paragraph={{ rows: 3 }} /> : data && <>
          <div className="club-room-legend">
            <Link to="/tables?view=free"><i className="is-free" />{ru ? 'Свободно' : 'Bo‘sh'} <b>{tables.length - busy}</b></Link>
            <Link to="/tables?view=busy"><i className="is-busy" />{ru ? 'Занято' : 'Band'} <b>{busy}</b></Link>
            <Link to="/tables?view=paused"><i className="is-paused" />{ru ? 'Пауза' : 'Pauzada'} <b>{paused}</b></Link>
          </div>
          <div className="club-room-grid">
            {tables.map((table) => <Link key={table.tableId} to={`/tables?table=${table.tableId}`}
              className={`club-room-table is-${table.sessionStatus === 'paused' ? 'paused' : table.sessionStatus ? 'busy' : 'free'}`}
              title={`${table.tableName} · ${t(table.sessionStatus ? `status.${table.sessionStatus}` : 'status.free')}`}>
              <span className="club-room-table__rail"><b>{String(table.tableNumber).padStart(2, '0')}</b>
                {data.mode !== 'off' && table.driver !== 'none' && <BulbOutlined className={needsLightAttention(health(table)) ? 'needs-attention' : ''}
                  aria-label={copy.health[health(table)]} />}</span>
              <strong>{table.tableName}</strong>
              <small>{t(table.sessionStatus ? `status.${table.sessionStatus}` : 'status.free')}</small>
            </Link>)}
          </div>
          {!tables.length && <p className="club-operations__empty">{ru ? 'Добавьте первые столы в разделе «Столы».' : '«Stollar» bo‘limida birinchi stollarni qo‘shing.'}</p>}
        </>}
        <Link className={`club-light-summary ${lights.failed || lightIssues.length || (data?.mode === 'bridge' && !data.bridge.online) ? 'needs-attention' : ''}`} to="/tables?panel=lights">
          <BulbOutlined /><span><strong>{ru ? 'Управление светом' : 'Chiroqlar boshqaruvi'}</strong><small>{lights.failed ? copy.pollingError : lightSummary}</small></span><ArrowRightOutlined />
        </Link>
      </section>
      <section className="club-operations__arrivals" aria-label={ru ? 'Ближайшие гости' : 'Yaqin mehmonlar'}>
        <div className="club-operations__section-title"><h3><CalendarOutlined /> {ru ? 'Ближайшие гости' : 'Yaqin mehmonlar'}</h3>
          <Link to="/reservations" aria-label={t('menu.reservations')}><ArrowRightOutlined /></Link></div>
        <p className="club-operations__caption">{ru ? 'На 24 часа вперёд · опоздания до 1 часа' : 'Keyingi 24 soat · 1 soatgacha kechikkanlar'}</p>
        {arrivals.failed && <Alert showIcon type="warning" message={ru ? 'Брони не обновлены' : 'Bronlar yangilanmadi'} />}
        {!arrivals.data && loading ? <Skeleton active paragraph={{ rows: 3 }} /> : <div className="club-arrivals">
          {arrivals.data?.map((row) => {
            const late = Date.parse(row.startsAt) < now;
            const sameDay = clubDateKey(row.startsAt, timezone) === clubDateKey(now, timezone);
            return <Link className="club-arrival" to={reservationLink(row, timezone)} key={row.id}>
              <div className={`club-arrival__time${late ? ' is-late' : ''}`}><b>{timeFormat.format(new Date(row.startsAt))}</b>
                <small>{late ? (ru ? 'Ожидается' : 'Kutilmoqda') : sameDay ? t('common.today') : dateFormat.format(new Date(row.startsAt))}</small></div>
              <div className="club-arrival__guest"><strong>{row.customerName || row.customer?.name || t('tables.guest')}</strong>
                <span>{row.table?.name || `${t('common.table')} ${row.tableId}`}</span>
                <small>{t(`reservations.status.${row.status}`)}</small></div><ArrowRightOutlined />
            </Link>;
          })}
          {arrivals.data?.length === 0 && !arrivals.failed && <div className="club-operations__empty"><CalendarOutlined />
            <strong>{ru ? 'Ближайших броней нет' : 'Yaqin vaqtga bron yo‘q'}</strong><span>{ru ? 'Новая бронь появится здесь автоматически.' : 'Yangi bron shu yerda avtomatik ko‘rinadi.'}</span></div>}
        </div>}
        <Link className="club-operations__footer-link" to="/reservations">{ru ? 'Открыть календарь броней' : 'Bronlar taqvimini ochish'} <ArrowRightOutlined /></Link>
      </section>
    </div>
    {data && !lights.failed && (paused > 0 || lightIssues.length > 0) && <div className="club-operations__attention">
      <strong>{ru ? 'Требует внимания' : 'E’tibor kerak'}</strong>
      {paused > 0 && <Link to="/tables?view=paused"><ClockCircleOutlined /> {paused} {ru ? 'столов на паузе' : 'ta stol pauzada'} <ArrowRightOutlined /></Link>}
      {lightIssues.length > 0 && <Link to="/tables?panel=lights"><BulbOutlined /> {lightIssues.length} {ru ? 'реле требуют проверки' : 'ta rele tekshirishni kutmoqda'} <ArrowRightOutlined /></Link>}
    </div>}
    {data && tables.length > 0 && !lights.failed && paused === 0 && lightIssues.length === 0 && <div className="club-operations__quiet"><CheckCircleOutlined />
      {ru ? 'Столов на паузе нет' : 'Pauzadagi stollar yo‘q'}
      {lights.at && <span>{ru ? 'Обновлено' : 'Yangilandi'} {timeFormat.format(lights.at)}</span>}</div>}
  </section>;
}
