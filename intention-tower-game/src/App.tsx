/**
 * 主应用组件 — 根据页面状态切换 LevelSelect / GamePage
 */
import React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useGameState } from './store/useGameState';
import { LevelSelectPage } from './components/pages/LevelSelectPage';
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
  const page = useGameState((s) => s.page);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      {page === 'menu' ? <LevelSelectPage /> : <GamePage />}
    </ThemeProvider>
  );
};

export default App;
