import { Button, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '../../context/AppSettingsContext';

/**
 * Och ("fil suyagi") / qorong'i ("tungi zal") rejim almashtirgichi.
 * Ikonka — o'tiladigan rejim: och rejimda oy, qorong'ida quyosh.
 */
const ThemeToggle = ({ className, size = 'middle' }: { className?: string; size?: 'small' | 'middle' | 'large' }) => {
  const { t } = useTranslation();
  const { themeMode, toggleTheme } = useAppSettings();
  const label = t(themeMode === 'dark' ? 'common.themeLight' : 'common.themeDark');
  return (
    <Tooltip title={label}>
      <Button
        type="text"
        shape="circle"
        size={size}
        className={className}
        aria-label={label}
        aria-pressed={themeMode === 'dark'}
        icon={themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
      />
    </Tooltip>
  );
};

export default ThemeToggle;
