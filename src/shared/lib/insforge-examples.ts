// @ts-nocheck
/**
 * EJEMPLOS DE USO DE INSFORGE SDK
 *
 * Este archivo contiene ejemplos de cómo usar el cliente de InsForge
 * en tu aplicación Cyberbistro.
 */

import { insforgeClient } from './insforge';

// ============================================
// DATABASE - Operaciones CRUD
// ============================================

// SELECT - Obtener datos
export async function getMesas() {
  const { data, error } = await insforgeClient
    .from('mesas')
    .select('*');

  if (error) console.error('Error:', error);
  return data;
}

// INSERT - Crear datos
export async function createMesa(mesa: { numero: number; capacidad: number }) {
  const { data, error } = await insforgeClient
    .from('mesas')
    .insert([mesa]); // IMPORTANTE: Siempre array [{}]

  if (error) console.error('Error:', error);
  return data;
}

// UPDATE - Actualizar datos
export async function updateMesa(id: number, updates: Partial<{ numero: number; capacidad: number }>) {
  const { data, error } = await insforgeClient
    .from('mesas')
    .update(updates)
    .eq('id', id);

  if (error) console.error('Error:', error);
  return data;
}

// DELETE - Eliminar datos
export async function deleteMesa(id: number) {
  const { data, error } = await insforgeClient
    .from('mesas')
    .delete()
    .eq('id', id);

  if (error) console.error('Error:', error);
  return data;
}

// ============================================
// AUTH - Autenticación
// ============================================

// Registrar usuario
export async function signUp(email: string, password: string) {
  const { data, error } = await insforgeClient.auth.signUp({
    email,
    password
  });

  if (error) console.error('Error:', error);
  return data;
}

// Iniciar sesión
export async function signIn(email: string, password: string) {
  const { data, error } = await insforgeClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) console.error('Error:', error);
  return data;
}

// Cerrar sesión
export async function signOut() {
  const { error } = await insforgeClient.auth.signOut();
  if (error) console.error('Error:', error);
}

// Obtener usuario actual
export async function getCurrentUser() {
  const { data: { user }, error } = await insforgeClient.auth.getUser();
  if (error) console.error('Error:', error);
  return user;
}

// ============================================
// STORAGE - Archivos
// ============================================

// Subir archivo
export async function uploadFile(bucket: string, path: string, file: File) {
  const { data, error } = await insforgeClient.storage
    .from(bucket)
    .upload(path, file);

  if (error) console.error('Error:', error);
  return data;
}

// Obtener URL pública de archivo
export function getPublicUrl(bucket: string, path: string) {
  const { data } = insforgeClient.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

// ============================================
// AI - Chat completions
// ============================================

export async function chatWithAI(message: string) {
  const { data, error } = await insforgeClient.ai.chat({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }]
  });

  if (error) console.error('Error:', error);
  return data;
}

// ============================================
// EJEMPLO DE COMPONENTE REACT
// ============================================

/*
import { useEffect, useState } from 'react';
import { insforgeClient } from '../lib/insforge';

export function MesasList() {
  const [mesas, setMesas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMesas() {
      const { data, error } = await insforgeClient
        .from('mesas')
        .select('*');

      if (!error && data) {
        setMesas(data);
      }
      setLoading(false);
    }

    loadMesas();
  }, []);

  if (loading) return <div>Cargando...</div>;
  return (
    <ul>
      {mesas.map((mesa: any) => (
        <li key={mesa.id}>Mesa {mesa.numero} - {mesa.capacidad} personas</li>
      ))}
    </ul>
  );
}
*/
