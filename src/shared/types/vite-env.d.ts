// Script-type file (no import/export) so wildcard module declarations are global

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_INSFORGE_BASE_URL?: string;
  readonly VITE_INSFORGE_ANON_KEY?: string;
  readonly VITE_ENABLE_WEB_LOCAL_FIRST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Figma asset virtual modules resolved by the figmaAssetResolver Vite plugin
declare module 'figma:asset/*' {
  const src: string;
  export default src;
}

// react-dom ships types for react-dom/client since v18 but
// moduleResolution "bundler" sometimes fails to find them
declare module 'react-dom/client' {
  export { createRoot, hydrateRoot } from 'react-dom';
}
