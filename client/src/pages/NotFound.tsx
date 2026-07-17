import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const NotFound = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <Result
      status="404"
      title={t('error.notFoundTitle')}
      subTitle={t('error.notFoundDesc')}
      extra={
        <Button
          type="primary"
          onClick={() => navigate(user?.role === 'superadmin' ? '/admin' : '/')}
        >
          {t('btn.back')}
        </Button>
      }
    />
  );
};

export default NotFound;
