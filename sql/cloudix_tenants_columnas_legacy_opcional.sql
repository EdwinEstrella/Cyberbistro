-- Revision manual de columnas en `public.tenants`.
-- No ejecutar a ciegas. Algunas columnas siguen como compatibilidad.
--
-- Verificado contra el codigo actual de Cloudix:
-- 1. `activa` sigue usandose al crear el tenant en RegisterForm.
-- 2. `email` e `idioma` no aparecen referenciadas por la app actual.
-- 3. `ncf_secuencia_siguiente` y `ncf_secuencias_por_tipo` quedaron como legado /
--    espejo de compatibilidad mientras existan versiones viejas o scripts que aun las lean.
--
-- Si confirmas que no tienes integraciones externas ni builds viejos, estas sentencias
-- son las candidatas a limpieza:

-- ALTER TABLE public.tenants DROP COLUMN IF EXISTS email;
-- ALTER TABLE public.tenants DROP COLUMN IF EXISTS idioma;

-- Estas dos solo deberian borrarse despues de retirar toda compatibilidad legacy NCF:
-- ALTER TABLE public.tenants DROP COLUMN IF EXISTS ncf_secuencia_siguiente;
-- ALTER TABLE public.tenants DROP COLUMN IF EXISTS ncf_secuencias_por_tipo;
