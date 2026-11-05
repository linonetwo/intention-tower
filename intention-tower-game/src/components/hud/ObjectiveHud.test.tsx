import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../../types/backend';
import { i18n } from '../../i18n';

const fixture = vi.hoisted(() => ({ state: { worldState: {
  progress: { objectives: [
    { objective_id: 'pending', label: 'objective.title', required: true, completed: false },
    { objective_id: 'done', label: 'objective.title', required: true, completed: true },
  ] },
} as unknown as WorldState } }));
vi.mock('../../store/useGameState', () => ({ useGameState: (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ isMobile: true }) }));
import { ObjectiveHud } from './ObjectiveHud';

function luminance(channels: number[]) {
  return channels.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}

afterEach(async () => { cleanup(); await i18n.changeLanguage('zh-CN'); });

describe('Light objective card', () => {
  it.each(['pending', 'done'])('keeps %s text readable over the translucent cream card', (id) => {
    render(<ObjectiveHud />);
    fireEvent.click(screen.getByLabelText(i18n.t('objective.toggle')));
    const foreground = getComputedStyle(screen.getByTestId(`objective-label-${id}`)).color.match(/[\d.]+/g)!.map(Number);
    const background = getComputedStyle(screen.getByTestId('objective-hud')).backgroundColor.match(/[\d.]+/g)!.map(Number);
    // Check both extremes behind the translucent card, not just a white test page.
    for (const backdrop of [0, 255]) {
      const alpha = background[3] ?? 1;
      const composite = background.slice(0, 3).map(channel => channel * alpha + backdrop * (1 - alpha));
      const a = luminance(foreground.slice(0, 3)), b = luminance(composite);
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['zh-CN', 'en'])('provides a touch-sized keyboard toggle in %s', async language => {
    await i18n.changeLanguage(language);
    render(<ObjectiveHud />);
    const toggle = screen.getByTestId('objective-hud').querySelector('[aria-expanded]')!;
    expect(parseFloat(getComputedStyle(toggle).minHeight)).toBeGreaterThanOrEqual(44);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('objective-label-pending').textContent).toBe(i18n.t('objective.title'));
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
