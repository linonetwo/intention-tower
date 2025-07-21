import CssBaseline from '@mui/material/CssBaseline';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Box, Container, Typography, Chip, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from '@mui/material';
import { useState } from 'react';
import MemeNetworkVisualization from './components/MemeNetworkVisualization';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedQuadrant, setSelectedQuadrant] = useState<string>('all');

  const handleCategoryChange = (event: SelectChangeEvent) => {
    setSelectedCategory(event.target.value as string);
  };

  const handleQuadrantChange = (event: SelectChangeEvent) => {
    setSelectedQuadrant(event.target.value as string);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          意义模因塔 - 人类意图可视化
        </Typography>
        
        <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6" color="text.secondary">
            层级结构：
          </Typography>
          <Chip label="顶层文化模因" color="primary" variant="outlined" />
          <Chip label="中层社会习得" color="secondary" variant="outlined" />
          <Chip label="底层生理驱动" color="success" variant="outlined" />
        </Box>

        <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>类别筛选</InputLabel>
            <Select
              value={selectedCategory}
              label="类别筛选"
              onChange={handleCategoryChange}
            >
              <MenuItem value="all">全部类别</MenuItem>
              <MenuItem value="知识与探索">知识与探索</MenuItem>
              <MenuItem value="信仰与意识形态">信仰与意识形态</MenuItem>
              <MenuItem value="美学与价值">美学与价值</MenuItem>
              <MenuItem value="社交与归属">社交与归属</MenuItem>
              <MenuItem value="地位与支配">地位与支配</MenuItem>
              <MenuItem value="好奇与创造">好奇与创造</MenuItem>
              <MenuItem value="觅食与生存">觅食与生存</MenuItem>
              <MenuItem value="安全与逃避">安全与逃避</MenuItem>
              <MenuItem value="繁衍与本能">繁衍与本能</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>节点类型</InputLabel>
            <Select
              value={selectedQuadrant}
              label="节点类型"
              onChange={handleQuadrantChange}
            >
              <MenuItem value="all">全部类型</MenuItem>
              <MenuItem value="观察">观察</MenuItem>
              <MenuItem value="行动">行动</MenuItem>
              <MenuItem value="动机">动机</MenuItem>
              <MenuItem value="心情">心情</MenuItem>
              <MenuItem value="非条件刺激">非条件刺激</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ height: 'calc(100vh - 300px)', border: '1px solid #e0e0e0', borderRadius: 1 }}>
          <MemeNetworkVisualization 
            selectedCategory={selectedCategory}
            selectedQuadrant={selectedQuadrant}
          />
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default App;
