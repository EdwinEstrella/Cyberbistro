import { createClient } from '@insforge/sdk';

/**
 * InsForge Client Configuration
 *
 * Este cliente se usa para conectar con el backend de InsForge
 * que proporciona: Database, Auth, Storage, AI, Functions, Realtime
 */
export const insforgeClient = createClient({
  baseUrl: 'https://restaurante.azokia.com',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODk4MzF9.JSPxmZgHN5zYHBscZBeKHNVQMItiiSKxJCjqB9Yqmzc'
});

/**
 * Tipos de accesos disponibles:
 * - Database: insforgeClient.from('tabla').select()...
 * - Auth: insforgeClient.auth.signUp()...
 * - Storage: insforgeClient.storage...
 * - AI: insforgeClient.ai...
 */
