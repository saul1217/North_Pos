// Types for the preload bridge exposed as `window.pos`.
// Present only when running inside Electron (undefined in the browser dev server).
export {};

declare global {
  interface Window {
    pos?: {
      platform: NodeJS.Platform;
      isElectron: boolean;
      ping: () => Promise<string>;
      loadAuthSessionSync: () => string | null;
      saveAuthSession: (dataJson: string) => Promise<boolean>;
      clearAuthSession: () => Promise<boolean>;
      // Local SQLite persistence.
      loadStateSync: () => string | null;
      saveState: (dataJson: string) => Promise<boolean>;
      dbPath: () => Promise<string>;
      exportBackup: () => Promise<{ canceled: boolean; path?: string }>;
      importBackup: () => Promise<{ canceled: boolean; path?: string; safetyBackup?: string }>;
      updates?: {
        check: () => Promise<{ status: string; version?: string }>;
        download: () => Promise<boolean>;
        install: () => Promise<boolean>;
        onStatus: (callback: (payload: {
          status: "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error";
          version?: string;
          percent?: number;
          message?: string;
        }) => void) => () => void;
      };
    };
  }
}
