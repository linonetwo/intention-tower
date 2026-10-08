import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Box,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getWindowResolution, setWindowResolution, type WindowResolution } from '../../api/tauriApi';

const RESOLUTION_PRESETS: Array<{ label: string; value: string; size: WindowResolution }> = [
  { label: '390 × 844 (Mobile)', value: '390x844', size: { width: 390, height: 844 } },
  { label: '768 × 1024 (Tablet)', value: '768x1024', size: { width: 768, height: 1024 } },
  { label: '1280 × 720 (HD)', value: '1280x720', size: { width: 1280, height: 720 } },
  { label: '1366 × 768', value: '1366x768', size: { width: 1366, height: 768 } },
  { label: '1600 × 900', value: '1600x900', size: { width: 1600, height: 900 } },
  { label: '1920 × 1080 (FHD)', value: '1920x1080', size: { width: 1920, height: 1080 } },
];

const RESOLUTION_STORAGE_KEY = 'it-resolution';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const [resolutionValue, setResolutionValue] = useState<string>('1280x720');
  const [windowSizeText, setWindowSizeText] = useState<string>('—');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const presetMap = useMemo(
    () => Object.fromEntries(RESOLUTION_PRESETS.map((p) => [p.value, p.size])),
    [],
  );

  useEffect(() => {
    const savedResolution = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (savedResolution && presetMap[savedResolution]) {
      setResolutionValue(savedResolution);
    }

    const syncWindowSize = async () => {
      try {
        const size = await getWindowResolution();
        setWindowSizeText(`${size.width} × ${size.height}`);
      } catch {
        setWindowSizeText(`${window.innerWidth} × ${window.innerHeight}`);
      }
    };

    void syncWindowSize();
  }, [presetMap]);

  const handleLanguageChange = (event: SelectChangeEvent) => {
    const lang = event.target.value as 'zh-CN' | 'en';
    void i18n.changeLanguage(lang);
    localStorage.setItem('it-language', lang);
  };

  const handleResolutionChange = async (event: SelectChangeEvent) => {
    const value = event.target.value;
    setResolutionValue(value);
    setResolutionError(null);

    const size = presetMap[value];
    if (!size) return;

    localStorage.setItem(RESOLUTION_STORAGE_KEY, value);

    try {
      await setWindowResolution(size.width, size.height);
      setWindowSizeText(`${size.width} × ${size.height}`);
    } catch (err) {
      setResolutionError(t('settings.graphics.applyFailed', { message: String(err) }));
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100dvh',
        bgcolor: '#868074',
        color: '#443627',
        p: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton aria-label={t('game.backToMenu')} onClick={() => navigate(-1)} sx={{ color: '#584431', mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{t('settings.title')}</Typography>
      </Box>

      <Paper sx={{ p: 2, maxWidth: 480, bgcolor: '#8f8c86', border: '1px solid #d6bf99' }}>
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

        <Divider sx={{ my: 2, borderColor: '#d6bf99' }} />

        <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>{t('settings.graphics.title')}</Typography>

        <FormControl fullWidth size='small'>
          <InputLabel sx={{ fontSize: 12 }}>{t('settings.graphics.resolution')}</InputLabel>
          <Select
            value={resolutionValue}
            label={t('settings.graphics.resolution')}
            onChange={(event) => {
              void handleResolutionChange(event);
            }}
            sx={{ fontSize: 13 }}
          >
            {RESOLUTION_PRESETS.map((preset) => (
              <MenuItem key={preset.value} value={preset.value}>{preset.value === '390x844' ? t('settings.graphics.mobilePreset') : preset.value === '768x1024' ? t('settings.graphics.tabletPreset') : preset.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography sx={{ fontSize: 12, color: '#896640', mt: 1 }}>
          {t('settings.graphics.current', { size: windowSizeText })}
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#806c55', mt: 0.5 }}>
          {t('settings.graphics.hint')}
        </Typography>
        {resolutionError && (
          <Typography sx={{ fontSize: 11, color: '#8f4d48', mt: 0.8 }}>{resolutionError}</Typography>
        )}
      </Paper>
    </Box>
  );
};
