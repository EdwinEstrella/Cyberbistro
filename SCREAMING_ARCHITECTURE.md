# Screaming Architecture - Cyberbistro

## Estructura de Directorios

```
src/
├── features/              # Características de la aplicación (Screaming Architecture)
│   ├── auth/             # Autenticación (login, registro)
│   ├── dashboard/        # Dashboard principal
│   ├── billing/          # Facturación
│   ├── tables/           # Gestión de mesas
│   └── window/           # Controles de ventana (titlebar, botones)
├── shared/               # Código compartido entre features
│   ├── ui/               # Componentes UI genéricos (Button, Card, etc.)
│   ├── hooks/            # Hooks compartidos
│   ├── lib/              # Utilidades y helpers
│   ├── types/            # Tipos TypeScript compartidos
│   └── assets/           # Imágenes, fuentes, etc.
├── app/                  # Configuración de la aplicación
│   ├── App.tsx           # Componente principal
│   ├── main.tsx          # Entry point
│   └── components/       # Componentes de layout global
└── imports/              # Configuración de importaciones
```

## ¿Por qué Screaming Architecture?

### Antes (por tipo):
```
components/
  login.tsx
  dashboard.tsx
  billing.tsx
```

**Problema**: Para entender una funcionalidad, tenés que buscar en múltiples directorios.

### Ahora (por funcionalidad):
```
features/
  auth/
    components/LoginForm.tsx
    hooks/useAuth.ts
    types/
  billing/
    components/
    hooks/
```

**Ventaja**: Todo el código de una funcionalidad está junto. Fácil de encontrar, entender y mantener.

## Reglas

### 1. Crear una nueva feature

```bash
mkdir -p src/features/my-feature/{components,hooks,types}
touch src/features/my-feature/index.ts
```

### 2. Exportar desde el barril de la feature

```ts
// src/features/my-feature/index.ts
export { MyComponent } from './components/MyComponent'
```

### 3. Importar en la app

```ts
// Opción 1: Importar directamente
import { LoginForm } from '@/features/auth'

// Opción 2: Importar del barril general
import { LoginForm } from '@/features'
```

### 4. Cuándo crear una nueva feature

✅ **Crear feature si**:
- Es una funcionalidad de negocio distinta
- Tiene sus propios componentes, hooks y tipos
- Podría ser extraída a un package separado
- Tiene lógica de estado compleja

❌ **NO crear feature si**:
- Es solo un componente UI genérico (usar `shared/ui`)
- Es un hook simple compartido (usar `shared/hooks`)
- Es una utilidad (usar `shared/lib`)

## Ejemplos

### Feature: Auth
```ts
// src/features/auth/components/LoginForm.tsx
export function LoginForm() {
  const { login } = useAuth()
  // ...
}

// src/features/auth/hooks/useAuth.ts
export function useAuth() {
  // Lógica de autenticación
}

// Uso en App.tsx
import { LoginForm } from '@/features/auth'
```

### Componente compartido: Button
```ts
// src/shared/ui/button/Button.tsx
export function Button({ children, ...props }) {
  return <button {...props}>{children}</button>
}

// src/shared/ui/index.ts
export { Button } from './button/Button'

// Uso en cualquier feature
import { Button } from '@/shared/ui'
```

## Beneficios

1. **Fácil encontrar código**: Todo relacionado está junto
2. **Fácil refactorizar**: Podsé mover una feature completa sin afectar otras
3. **Fácil testing**: Podsé testear cada feature independientemente
4. **Fácil escalar**: Cuando la app crece, cada feature se mantiene manejable
5. **Colaboración**: Distintos developers pueden trabajar en distintas features sin conflictos

## Migración

La migración desde la estructura anterior está completa. Todos los componentes han sido movidos a sus features correspondientes:

- `login.tsx` → `features/auth/components/LoginForm.tsx`
- `register.tsx` → `features/auth/components/RegisterForm.tsx`
- `dashboard.tsx` → `features/dashboard/components/Dashboard.tsx`
- `billing.tsx` → `features/billing/components/Billing.tsx`
- `tables.tsx` → `features/tables/components/Tables.tsx`
- `TitleBar.tsx` → `features/window/components/TitleBar.tsx`
- `window-controls.tsx` → `features/window/components/WindowControls.tsx`

## Recursos

- [Screaming Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2011/09/08/Screaming-Architecture.html)
- [Feature-Sliced Design](https://feature-sliced.design/)
- [Organizing Electron Projects](https://www.electronjs.org/docs/tutorial/quick-start#organizing-your-project)
