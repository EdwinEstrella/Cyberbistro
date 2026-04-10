# InsForge Integration - Cyberbistro

## ✅ Configuración Completa

InsForge SDK está conectado y listo para usar con autenticación completa.

## Backend Configuration

- **Base URL**: `https://restaurante.azokia.com`
- **Auth**: Email/password configurado y funcionando
- **Database**: PostgreSQL con PostgREST API
- **Storage**: Bucket management disponible
- **AI**: Chat completions disponible
- **Realtime**: WebSocket pub/sub disponible

## Archivos Creados

### 1. `src/lib/insforge.ts`
Cliente configurado de InsForge. Importalo así:

```typescript
import { insforgeClient } from './lib/insforge';
```

### 2. `src/lib/insforge-examples.ts`
Ejemplos completos de uso para:
- Database CRUD operations
- Authentication (signUp, signIn, signOut)
- Storage (upload, download)
- AI chat completions

### 3. `src/hooks/useAuth.ts`
Hook personalizado para gestionar autenticación:

```typescript
import { useAuth } from '../hooks/useAuth';

function MyComponent() {
  const { user, loading, signOut, isAuthenticated } = useAuth();

  if (loading) return <div>Cargando...</div>;
  if (!isAuthenticated) return <div>No autenticado</div>;

  return <div>Hola {user.email}</div>;
}
```

### 4. `src/app/components/login.tsx`
Componente de login actualizado con:
- Autenticación real con InsForge
- Manejo de errores
- Estados de carga
- Validación de campos

### 5. `src/app/components/register.tsx`
Nuevo componente de registro con:
- Validación de contraseñas
- Confirmación de contraseña
- Mensajes de éxito/error
- Redirección automática

## Uso de los Componentes

### Login

El login ya está integrado. Usa el componente `Login`:

```typescript
import { Login } from './components/login';

<Login />
```

### Registro

El componente de registro está disponible:

```typescript
import { Register } from './components/register';

<Register />
```

### Proteger Rutas

Usa el hook `useAuth` o el HOC `withAuth`:

```typescript
import { useAuth } from '../hooks/useAuth';

function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return <div>Cargando...</div>;
  if (!isAuthenticated) {
    window.location.href = '/';
    return null;
  }

  return <div>Bienvenido {user.email}</div>;
}
```

## Servicios Disponibles

### 🗄️ Database
```typescript
// SELECT
const { data } = await insforgeClient.from('mesas').select('*');

// INSERT
const { data } = await insforgeClient.from('mesas').insert([{ numero: 1, capacidad: 4 }]);

// UPDATE
const { data } = await insforgeClient.from('mesas').update({ capacidad: 6 }).eq('id', 1);

// DELETE
const { data } = await insforgeClient.from('mesas').delete().eq('id', 1);
```

### 🔐 Auth
```typescript
// Sign Up
await insforgeClient.auth.signUp({ email: 'user@example.com', password: 'password123' });

// Sign In
await insforgeClient.auth.signInWithPassword({ email: 'user@example.com', password: 'password123' });

// Sign Out
await insforgeClient.auth.signOut();

// Get Current User
const { data: { user } } = await insforgeClient.auth.getUser();
```

### 📁 Storage
```typescript
// Upload
const { data } = await insforgeClient.storage
  .from('imagenes')
  .upload('mesas/mesa1.jpg', file);

// Get Public URL
const { data } = insforgeClient.storage
  .from('imagenes')
  .getPublicUrl('mesas/mesa1.jpg');
```

### 🤖 AI
```typescript
const { data } = await insforgeClient.ai.chat({
  model: 'gpt-4',
  messages: [{ role: 'user', content: '¿Cuál es el especial del día?' }]
});
```

## Notas Importantes

1. **Respuestas**: Todas las operaciones devuelven `{ data, error }`
2. **Inserts**: Siempre en formato array: `[{...}]`
3. **Auth**: El anon key permite acceso público, pero RLS (Row Level Security) protege los datos
4. **Realtime**: Suscripciones a cambios en tiempo real disponibles
5. **Diseño folder**: Nunca modificar archivos en `Diseño/` - es solo para referencia visual

## Próximos Pasos Sugeridos

1. **Crear tablas en la base de datos** usando el MCP `run-raw-sql`
2. **Configurar RLS policies** para proteger los datos
3. **Implementar rutas protegidas** con `useAuth`
4. **Crear buckets de storage** para imágenes de mesas, productos, etc.
5. **Implementar realtime** para actualizaciones en vivo

## Ayuda

Ver ejemplos completos en: `src/lib/insforge-examples.ts`
