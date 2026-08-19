// Types for the preload bridge exposed as `window.pos`.
// Present only when running inside Electron (undefined in the browser dev server).
export {};

declare global {
  interface Window {
    pos?: {
      platform: NodeJS.Platform;
      isElectron: boolean;
      ping: () => Promise<string>;
      // Local SQLite persistence.
      loadStateSync: () => string | null;
      saveState: (dataJson: string) => Promise<boolean>;
      dbPath: () => Promise<string>;
    };
  }
}
