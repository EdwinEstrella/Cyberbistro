-- Migration for Payroll (Nomina)
-- This schema allows the eventual synchronization to PostgREST.

CREATE TABLE IF NOT EXISTS nomina_empleados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    sucursal_id UUID NOT NULL,
    nombre_completo TEXT NOT NULL,
    identificacion TEXT NOT NULL,
    telefono TEXT,
    cargo TEXT NOT NULL,
    salario_base_mensual BIGINT NOT NULL, -- en centavos
    frecuencia_pago TEXT NOT NULL CHECK (frecuencia_pago IN ('mensual', 'quincenal')),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nomina_ajustes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID NOT NULL REFERENCES nomina_empleados(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('bono', 'descuento')),
    frecuencia TEXT NOT NULL CHECK (frecuencia IN ('unico', 'por_periodo', 'recurrente_fijo')),
    monto BIGINT NOT NULL, -- en centavos
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nomina_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empleado_id UUID NOT NULL REFERENCES nomina_empleados(id),
    periodo TEXT NOT NULL,
    monto_base BIGINT NOT NULL,
    total_bonos BIGINT NOT NULL,
    total_descuentos BIGINT NOT NULL,
    monto_neto BIGINT NOT NULL,
    monto_pagado BIGINT NOT NULL,
    monto_pendiente BIGINT NOT NULL,
    gasto_id UUID, -- Reference to the gasto record created
    created_at TIMESTAMPTZ DEFAULT NOW()
);
