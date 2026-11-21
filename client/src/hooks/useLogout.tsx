import { useCallback } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { viewingClub } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { fullScope } from '../offline/cache';
import { queueCount } from '../offline/queue';

/**
 * TIZIMDAN CHIQISH — yuborilmagan amallar va internet holati tekshiruvi bilan.
 *
 * Yuborilmagan navbat chiqishda ATAYLAB tozalanmaydi (pul amali yo'qolmasin),
 * lekin u foydalanuvchi+klub doirasiga bog'langan: chiqilgach bu amallar faqat
 * AYNAN SHU xodim shu klubga qayta kirganda yuboriladi — shu kompyuterda
 * boshqa xodim kirsa, ular yuborilmaydi. Kassir buni chiqishdan OLDIN bilishi
 * shart, aks holda smena oxirida "hammasi yuborildi" deb ketib qoladi.
 *
 * Internet yo'q paytda chiqish ham ogohlantiriladi: kirish faqat server orqali
 * bo'ladi, ya'ni aloqa tiklanmaguncha bu qurilmada qayta ishlab bo'lmaydi.
 *
 * Ikkalasi ham bo'lmasa — oddiy chiqish, ortiqcha savolsiz.
 */
export const useLogout = (): (() => Promise<void>) => {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const { logout } = useAuth();
  const { online } = useConnection();
  const navigate = useNavigate();

  return useCallback(async () => {
    const leave = async () => {
      // "Klubni ko'rish" rejimi keyingi sessiyaga o'tmasin
      viewingClub.clear();
      await logout();
      navigate('/login');
    };

    // Son ekrandagi holatdan emas, to'g'ridan-to'g'ri xotiradan olinadi:
    // boshqa oynada navbatga tushgan amallar ham hisobga kirsin
    const scope = fullScope();
    const { pending, failed } = scope ? await queueCount(scope) : { pending: 0, failed: 0 };
    const unsent = pending + failed;
    if (unsent === 0 && online) {
      await leave();
      return;
    }

    modal.confirm({
      title:
        unsent > 0
          ? t('workspace.logoutUnsentTitle', { count: unsent })
          : t('workspace.logoutOfflineTitle'),
      content: (
        <>
          {unsent > 0 && <div>{t('workspace.logoutUnsentDesc')}</div>}
          {!online && (
            <div style={{ marginTop: unsent > 0 ? 8 : 0 }}>{t('workspace.logoutOfflineDesc')}</div>
          )}
        </>
      ),
      okText: t('workspace.logoutAnyway'),
      okButtonProps: { danger: true },
      cancelText: t('btn.cancel'),
      onOk: leave,
    });
  }, [logout, modal, navigate, online, t]);
};
