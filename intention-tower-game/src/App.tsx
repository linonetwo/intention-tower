import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useState } from 'react';
import { IntentionMap } from './components/IntentionMap';
import { SimulationControl } from './components/SimulationControl';
import { sampleMapData } from './data/intentionMapData';
import { IntentionMapData } from './types/IntentionMap';
import './App.css';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  const [mapData, setMapData] = useState<IntentionMapData>(sampleMapData);

  const handleNodeClick = (node: any) => {
    console.log('节点被点击:', node);
  };

  const handleDataUpdate = (newData: IntentionMapData) => {
    setMapData(newData);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <IntentionMap
        data={mapData}
        onNodeClick={handleNodeClick}
      />
      <SimulationControl
        data={mapData}
        onDataUpdate={handleDataUpdate}
      />
    </ThemeProvider>
  );
}

export default App;
