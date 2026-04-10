// Script-type file (no import/export) so wildcard module declarations are global

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