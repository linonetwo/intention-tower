import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './fonts.css';
import { gameStore } from './store/useGameState';
import { snapshot } from './api/tauriApi';

// Explicit opt-in: browser MCP drives the same UI and authoritative Rust API.
// This is not a simulation or a replacement backend.
if (new URLSearchParams(location.search).get('mcp-test') === '1') {
  Object.assign(window, { __INTENTION_TEST__: {
    loadLevel: async (id: string) => {
      await gameStore.getState().loadLevel(id);
      if (gameStore.getState().error) throw new Error(gameStore.getState().error!);
      history.pushState(null, '', '/game?mcp-test=1');
      dispatchEvent(new PopStateEvent('popstate'));
    },
    refresh: async (events: import('./types/backend').WorldEvent[] = []) => {
      const worldState = await snapshot();
      gameStore.setState((state) => ({ worldState, recentEvents: [...events, ...state.recentEvents].slice(0, 200) }));
      await gameStore.getState().refreshCommands();
    },
    state: () => gameStore.getState().worldState,
    selectActor: (id: string) => gameStore.getState().selectActor(id),
    selectTarget: (id: string) => gameStore.getState().selectTarget(id),
    setUiMode: (mode: 'observe' | 'micro' | 'graph') => gameStore.getState().setUiMode(mode),
    setAutoStep: (enabled: boolean) => gameStore.getState().setAutoStepOnCommand(enabled),
    executeCommand: async (id: string) => {
      await gameStore.getState().executeCommand(id);
      if (gameStore.getState().error) throw new Error(gameStore.getState().error!);
    },
    stepTick: () => gameStore.getState().stepTick(),
  } });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
