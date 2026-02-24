/**
 * 主应用组件 — 根据页面状态切换 LevelSelect / GamePage
 */
import React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LevelSelectPage } from './components/pages/LevelSelectPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { GamePage } from './components/GamePage';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0a0a1e',
      paper: '#141428',
    },
  },
  typography: {
    fontFamily: '"Noto Sans SC", "Roboto", sans-serif',
  },
});

const App: React.FC = () => {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Routes>
        <Route path='/' element={<LevelSelectPage />} />
        <Route path='/settings' element={<SettingsPage />} />
        <Route path='/game' element={<GamePage />} />
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </ThemeProvider>
  );
};

export default App;
