import { createClient } from '@insforge/sdk';

const FALLBACK_BASE_URL = 'https://restaurante.azokia.com';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4';

const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_BASE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL;
const NEXT_PUBLIC_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

const effectiveBaseUrl = (NEXT_PUBLIC_BASE_URL?.trim()) || FALLBACK_BASE_URL;
const effectiveAnonKey = (NEXT_PUBLIC_ANON_KEY?.trim()) || FALLBACK_ANON_KEY;

export const insforgeClient = createClient({
  baseUrl: effectiveBaseUrl,
  anonKey: effectiveAnonKey,
  autoRefreshToken: false,
  isServerMode: true,
} as any);
