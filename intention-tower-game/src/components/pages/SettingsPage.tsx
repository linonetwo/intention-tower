import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { i18n } = useTranslation();

  const handleLanguageChange = (event: SelectChangeEvent) => {
    const lang = event.target.value as 'zh-CN' | 'en';
    i18n.changeLanguage(lang);
    localStorage.setItem('it-language', lang);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        bgcolor: '#0a0a1e',
        color: '#fff',
        p: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={() => navigate('/')} sx={{ color: '#ddd', mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{t('settings.title')}</Typography>
      </Box>

      <Paper sx={{ p: 2, maxWidth: 420, bgcolor: '#141428', border: '1px solid #2a2a5e' }}>
        <FormControl fullWidth size='small'>
          <InputLabel sx={{ fontSize: 12 }}>{t('settings.language')}</InputLabel>
          <Select
            value={i18n.language === 'zh-CN' ? 'zh-CN' : 'en'}
            label={t('settings.language')}
            onChange={handleLanguageChange}
            sx={{ fontSize: 13 }}
          >
            <MenuItem value='zh-CN'>{t('settings.lang.zh-CN')}</MenuItem>
            <MenuItem value='en'>{t('settings.lang.en')}</MenuItem>
          </Select>
        </FormControl>
      </Paper>
    </Box>
  );
};
