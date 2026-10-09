/** Ids that tie each tab to its panel, for assistive technology (aria-controls and aria-labelledby). */
export const tabId = (key: string): string => `environment-tab-${key}`;
export const panelId = (key: string): string => `environment-panel-${key}`;
