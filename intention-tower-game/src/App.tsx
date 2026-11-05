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

const adventureTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#8b5735' },
    secondary: { main: '#577b60' },
    text: { primary: '#433426', secondary: '#78634e' },
    background: {
      default: '#efe5cf',
      paper: '#fffaf0',
    },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 700 } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44, minWidth: 44, textTransform: 'none' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCssBaseline: { styleOverrides: { body: { backgroundImage: 'radial-gradient(ellipse at top, #fffaf0, #efe5cf)', color: '#433426' } } },
  },
  typography: {
    fontFamily: '"Intention CJK", "Roboto", Arial, sans-serif',
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
    <ThemeProvider theme={adventureTheme}>
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
