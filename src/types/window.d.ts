// Types for the preload bridge exposed as `window.pos`.
// Grows as we add the local database, ticket printer and barcode APIs.
export {};

declare global {
  interface Window {
    pos?: {
      platform: NodeJS.Platform;
      isElectron: boolean;
      ping: () => Promise<string>;
    };
  }
}
