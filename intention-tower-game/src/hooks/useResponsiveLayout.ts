/**
 * useResponsiveLayout — unified responsive breakpoint hook.
 * Replaces scattered useMediaQuery calls throughout the app.
 */
import { useMediaQuery } from '@mui/material';

export interface LayoutInfo {
  isMobile: boolean;   // < 768px
  isTablet: boolean;   // 768–1023px
  isDesktop: boolean;  // ≥ 1024px

  /** Dialogue box height in vh units */
  dialogueHeight: number;
  /** Left status bar width in px (0 = hidden) */
  statusBarWidth: number;
  /** Mini-map size { w, h } in px (0 = hidden) */
  miniMapSize: { w: number; h: number };
  /** Min touch target size in px */
  touchTarget: number;
}

export function useResponsiveLayout(): LayoutInfo {
  const isMobile = useMediaQuery('(max-width:767px)');
  const isTablet = useMediaQuery('(min-width:768px) and (max-width:1023px)');
  if (isMobile) {
    return {
      isMobile: true, isTablet: false, isDesktop: false,
      dialogueHeight: 40,
      statusBarWidth: 0,
      miniMapSize: { w: 0, h: 0 },
      touchTarget: 48,
    };
  }

  if (isTablet) {
    return {
      isMobile: false, isTablet: true, isDesktop: false,
      dialogueHeight: 30,
      statusBarWidth: 60,
      miniMapSize: { w: 140, h: 100 },
      touchTarget: 44,
    };
  }

  return {
    isMobile: false, isTablet: false, isDesktop: true,
    dialogueHeight: 25,
    statusBarWidth: 200,
    miniMapSize: { w: 180, h: 120 },
    touchTarget: 36,
  };
}
