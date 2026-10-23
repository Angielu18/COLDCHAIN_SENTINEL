-- =====================================================================
-- ColdChain Sentinel - Migración de Esquema Existente
-- Base de datos: coldchain_sentinel2
-- =====================================================================
-- Este script ADAPTA las tablas que ya existen (creadas por el script
-- original) añadiendo las columnas y tablas que la aplicación necesita.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROL: agregar columna "code" para usar claves estables
--    (DIRECTOR, SUPERVISOR, TECNICO, INVENTARIO)
-- ---------------------------------------------------------------------
ALTER TABLE rol ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE rol ADD COLUMN IF NOT EXISTS avatar VARCHAR(10);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rol_code ON rol (code);

-- ---------------------------------------------------------------------
-- 2. USUARIO: soportar estados PENDIENTE/ACTIVO/INACTIVO y auditoría IAM
--    Unifica la columna 'email'/'gmail' como 'gmail' para compatibilidad total.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'email'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'gmail'
  ) THEN
    ALTER TABLE usuario RENAME COLUMN email TO gmail;
  END IF;
END $$;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS avatar VARCHAR(10) DEFAULT '';
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS approved_by VARCHAR(150);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Ampliar el CHECK de estado para incluir PENDIENTE (el registro abierto crea PENDIENTE)
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_status_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_status_check
  CHECK (status IN ('PENDIENTE', 'ACTIVO', 'INACTIVO', 'activo', 'inactivo'));

-- ---------------------------------------------------------------------
-- 3. EQUIPO: metadatos operativos del sensor/nevera (sala room_911)
-- ---------------------------------------------------------------------
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS code VARCHAR(20);
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS location VARCHAR(150);
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS temp_min NUMERIC(4,1) DEFAULT 2.0;
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS temp_max NUMERIC(4,1) DEFAULT 8.0;
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipo_code ON equipo (code);

-- ---------------------------------------------------------------------
-- 4. MEDICAMENTO: rango óptimo de conservación
-- ---------------------------------------------------------------------
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS optimal_temp VARCHAR(50) DEFAULT '2°C a 8°C';

-- ---------------------------------------------------------------------
-- 5. LOTE: la cantidad puede ser decimal (dosis) y guardar ubicación
-- ---------------------------------------------------------------------
ALTER TABLE lote ADD COLUMN IF NOT EXISTS id_equipo INT;
ALTER TABLE lote DROP CONSTRAINT IF EXISTS fk_lote_equipo;
ALTER TABLE lote ADD CONSTRAINT fk_lote_equipo
  FOREIGN KEY (id_equipo) REFERENCES equipo (id_equipo) ON UPDATE CASCADE ON DELETE SET NULL
  NOT VALID;

-- ---------------------------------------------------------------------
-- 6. ANOMALIA: motor de alertas y escalamiento SLA
--    El 'status' original (Acontece/En revisión/Finalizo) se conserva y
--    se añaden los campos del flujo de incidentes de la aplicación.
-- ---------------------------------------------------------------------
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS level VARCHAR(30);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS sla_stage VARCHAR(200);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS current_target VARCHAR(80);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS emergency_protocol BOOLEAN DEFAULT FALSE;
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS critical_temperature NUMERIC(5,2);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(150);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS closed_by VARCHAR(150);
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS corrective_actions TEXT;
ALTER TABLE anomalia ADD COLUMN IF NOT EXISTS code VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS ux_anomalia_code ON anomalia (code);

-- ---------------------------------------------------------------------
-- 7. NOTIFICACION: registro de alertas enviadas (visual / correo)
-- ---------------------------------------------------------------------
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS level VARCHAR(30);
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS recipient VARCHAR(150);
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS subject VARCHAR(200);
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'ENVIADA';

-- Las advertencias de telemetría pueden emitirse antes de que exista un incidente.
ALTER TABLE notificacion ALTER COLUMN id_anomalia DROP NOT NULL;

-- Ampliar tipos permitidos: Correo, Alerta, SMS
ALTER TABLE notificacion DROP CONSTRAINT IF EXISTS notificacion_type_check;
ALTER TABLE notificacion ADD CONSTRAINT notificacion_type_check
  CHECK (type IN ('Correo', 'Alerta', 'SMS'));

-- ---------------------------------------------------------------------
-- 8. LOTE_AFECTADO: disposición manual con 2FA y trazabilidad
-- ---------------------------------------------------------------------
-- La app crea el registro de cuarentena antes de asociar una acción de protocolo,
-- por lo que 'id_accion_protocolo' debe permitir NULL.
ALTER TABLE lote_afectado ALTER COLUMN id_accion_protocolo DROP NOT NULL;

ALTER TABLE lote_afectado ADD COLUMN IF NOT EXISTS decision VARCHAR(30) DEFAULT 'PENDIENTE_REVISION';
ALTER TABLE lote_afectado ADD COLUMN IF NOT EXISTS decided_by VARCHAR(150);
ALTER TABLE lote_afectado ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE lote_afectado ADD COLUMN IF NOT EXISTS code VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lote_afectado_code ON lote_afectado (code);

-- ---------------------------------------------------------------------
-- 9. Índices adicionales para consultas frecuentes de la app
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_anomalia_status ON anomalia (status);
CREATE INDEX IF NOT EXISTS idx_anomalia_start_time ON anomalia (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_lectura_hour_equipo ON lectura (id_equipo, hour DESC);
CREATE INDEX IF NOT EXISTS idx_usuario_status ON usuario (status);

-- ---------------------------------------------------------------------
-- 10. IAM: se elimina el flujo de aprobación manual.
--     Las cuentas heredadas en 'PENDIENTE' pasan a 'INACTIVO' (suspendidas)
--     y el Director puede activarlas directamente desde el panel IAM.
-- ---------------------------------------------------------------------
UPDATE usuario SET status = 'INACTIVO' WHERE status = 'PENDIENTE';

-- =====================================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================================
