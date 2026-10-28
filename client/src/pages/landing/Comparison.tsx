import { CheckCircleFilled, CloseCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../../components/ui';
import { fadeUp, SectionHeading } from './shared';

/**
 * "Daftar / Excel / Billiard Club" taqqoslash jadvali. Halollik uchun
 * daftar va Excel'ning kuchli tomoni ham ko'rsatiladi (internetsiz ishlash) —
 * shunda jadval reklama emas, ishonchli solishtiruv bo'lib qoladi.
 */

type Mark = 'yes' | 'no' | 'partial';

const ROWS: { key: string; paper: Mark; excel: Mark; us: Mark }[] = [
  { key: 'cmp1', paper: 'no', excel: 'partial', us: 'yes' },
  { key: 'cmp2', paper: 'no', excel: 'no', us: 'yes' },
  { key: 'cmp3', paper: 'partial', excel: 'partial', us: 'yes' },
  { key: 'cmp4', paper: 'no', excel: 'no', us: 'yes' },
  { key: 'cmp5', paper: 'no', excel: 'partial', us: 'yes' },
  { key: 'cmp6', paper: 'no', excel: 'no', us: 'yes' },
  { key: 'cmp7', paper: 'no', excel: 'partial', us: 'yes' },
  { key: 'cmp8', paper: 'yes', excel: 'yes', us: 'yes' },
];

const MarkIcon = ({ mark, label }: { mark: Mark; label: string }) =>
  mark === 'yes' ? (
    <CheckCircleFilled className="lp-mark is-yes" aria-label={label} />
  ) : mark === 'partial' ? (
    <MinusCircleOutlined className="lp-mark is-partial" aria-label={label} />
  ) : (
    <CloseCircleOutlined className="lp-mark is-no" aria-label={label} />
  );

const Comparison = () => {
  const { t } = useTranslation();
  const labels: Record<Mark, string> = {
    yes: t('landing.cmpYes'),
    partial: t('landing.cmpPartial'),
    no: t('landing.cmpNo'),
  };
  return (
    <section id="compare" className="lp-section">
      <div className="lp-container lp-container--narrow">
        <SectionHeading
          overline={t('landing.cmpOverline')}
          title={t('landing.cmpTitle')}
          subtitle={t('landing.cmpSubtitle')}
        />
        <motion.div
          className="lp-compare"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          <table>
            <caption className="lp-sr-only">{t('landing.cmpTitle')}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="lp-sr-only">{t('landing.cmpFeature')}</span>
                </th>
                <th scope="col">{t('landing.cmpPaper')}</th>
                <th scope="col">Excel</th>
                <th scope="col" className="is-us">
                  <BrandLogo size={22} />
                  <span>Billiard Club</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`landing.${row.key}`)}</th>
                  <td>
                    <MarkIcon mark={row.paper} label={labels[row.paper]} />
                  </td>
                  <td>
                    <MarkIcon mark={row.excel} label={labels[row.excel]} />
                  </td>
                  <td className="is-us">
                    <MarkIcon mark={row.us} label={labels[row.us]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lp-compare__legend" aria-hidden>
            <span>
              <CheckCircleFilled className="lp-mark is-yes" /> {labels.yes}
            </span>
            <span>
              <MinusCircleOutlined className="lp-mark is-partial" /> {labels.partial}
            </span>
            <span>
              <CloseCircleOutlined className="lp-mark is-no" /> {labels.no}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Comparison;
