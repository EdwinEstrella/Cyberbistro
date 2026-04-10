// Module file (export {} makes this an augmentation, not a replacement)
export {};

// Electron-specific CSS property for window drag regions
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}