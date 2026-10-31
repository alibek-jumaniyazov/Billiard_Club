import { useState } from 'react';
import { Tabs } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageTransition } from '../../components/ui';
import PlansManager from './PlansManager';
import TierSettings from './TierSettings';

/**
 * TARIFLAR (superadmin) — bitta joyda:
 *  - Tarif darajalari: har bir daraja nima qila olishi, cheklovlari, nomi va
 *    daraja × muddat narxlari;
 *  - Tarif qatorlari: sotiladigan har bir tarif va maxsus tariflar.
 * Ikkala tab bir-birini yangilab turadi: birida saqlangan narx ikkinchisida
 * ham ko'rinadi (versiya sanoqlari orqali).
 */
const AdminTariffs = () => {
  const { t } = useTranslation();
  const [tiersVersion, setTiersVersion] = useState(0);
  const [plansVersion, setPlansVersion] = useState(0);

  return (
    <PageTransition>
      <PageHeader icon={<CrownOutlined />} title={t('tiers.pageTitle')} subtitle={t('tiers.pageSubtitle')} />
      <Tabs
        defaultActiveKey="tiers"
        items={[
          {
            key: 'tiers',
            label: t('tiers.adminTab'),
            children: <TierSettings plansVersion={plansVersion} onSaved={() => setTiersVersion((v) => v + 1)} />,
          },
          {
            key: 'plans',
            label: t('tiers.plansTab'),
            children: <PlansManager refreshKey={tiersVersion} onChanged={() => setPlansVersion((v) => v + 1)} />,
          },
        ]}
      />
    </PageTransition>
  );
};

export default AdminTariffs;
