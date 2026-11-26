import { preference, savePreference } from './api.js';

export const THEMES = ['system', 'light', 'dark'];
export function readTheme() {
  const theme = preference('theme', 'system');
  return THEMES.includes(theme) ? theme : 'system';
}
export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'system';
  document.documentElement.dataset.theme = value;
  savePreference('theme', value);
}
