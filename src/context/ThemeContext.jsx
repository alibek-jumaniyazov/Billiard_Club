import React, { createContext, useState, useContext, useEffect } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true; // Default dark theme for premium look
  });

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const themeConfig = {
    algorithm: isDarkMode ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDarkMode ? '#faad14' : '#1b5e20', // Gold in dark, Deep Green in light
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      borderRadius: 8,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    components: {
      Layout: {
        headerBg: isDarkMode ? '#0f291e' : '#ffffff', // Dark Billiard Green
        siderBg: isDarkMode ? '#0f291e' : '#ffffff',
        bodyBg: isDarkMode ? '#0a1c14' : '#f0f2f5', // Even darker for background
      },
      Card: {
        colorBgContainer: isDarkMode ? '#133526' : '#ffffff', // Card background green tinted
      },
      Button: {
        colorPrimary: '#faad14', // Always gold primary buttons
        colorPrimaryHover: '#ffc53d',
        colorPrimaryActive: '#d48806',
        primaryColor: '#000000', // Text color on primary button
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      <ConfigProvider theme={themeConfig}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
