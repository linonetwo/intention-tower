/**
 * 主应用组件 — 根据页面状态切换 LevelSelect / GamePage
 */
import React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LevelSelectPage } from './components/pages/LevelSelectPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { GamePage } from './components/GamePage';
import { setWindowResolution } from './api/tauriApi';

const RESOLUTION_STORAGE_KEY = 'it-resolution';

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
  React.useEffect(() => {
    const savedResolution = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (!savedResolution) return;

    const matched = /^(\d+)x(\d+)$/.exec(savedResolution);
    if (!matched) return;

    const width = Number(matched[1]);
    const height = Number(matched[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    void setWindowResolution(width, height).catch(() => {
      // Ignore in non-Tauri environment
    });
  }, []);

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
