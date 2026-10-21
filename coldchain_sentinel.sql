-- =====================================================================
-- Database Schema: Coldchain Sentinel
-- Compatible with PostgreSQL 12+ / pgAdmin 4
-- Designer / Project: Coldchain Sentinel
-- =====================================================================

-- NOTA PARA PGADMIN 4:
-- Si vas a crear la base de datos desde la consola de PostgreSQL (psql),
-- puedes descomentar las siguientes líneas.
-- Si estás dentro de pgAdmin 4 en una Query Tool, primero crea la BD
-- haciendo clic derecho en "Databases" -> "Create" -> "Database...",
-- luego abre la "Query Tool" conectada a 'coldchain_sentinel' y ejecuta este script.

/*
DROP DATABASE IF EXISTS coldchain_sentinel;

CREATE DATABASE coldchain_sentinel
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1
    IS_TEMPLATE = False;

\c coldchain_sentinel;
*/

-- -----------------------------------------------------------------------------
-- Limpieza preventiva en orden inverso de dependencias
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS Traslacion CASCADE;
DROP TABLE IF EXISTS Reporte CASCADE;
DROP TABLE IF EXISTS Lote_afectado CASCADE;
DROP TABLE IF EXISTS Accion_protocolo CASCADE;
DROP TABLE IF EXISTS Notificacion CASCADE;
DROP TABLE IF EXISTS Anomalia CASCADE;
DROP TABLE IF EXISTS Lectura CASCADE;
DROP TABLE IF EXISTS Lote CASCADE;
DROP TABLE IF EXISTS Medicamento CASCADE;
DROP TABLE IF EXISTS Equipo CASCADE;
DROP TABLE IF EXISTS Usuario CASCADE;
DROP TABLE IF EXISTS Rol CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Rol (Se crea primero porque Usuario y Equipo dependen de él)
-- -----------------------------------------------------------------------------
CREATE TABLE Rol (
    id_rol SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2. Usuario (Depende de Rol)
-- -----------------------------------------------------------------------------
CREATE TABLE Usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_rol INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_Usuario_Rol FOREIGN KEY (id_rol)
        REFERENCES Rol (id_rol) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 3. Equipo (Depende de Rol)
-- -----------------------------------------------------------------------------
CREATE TABLE Equipo (
    id_equipo SERIAL PRIMARY KEY,
    id_rol INT,
    name VARCHAR(100) NOT NULL,
    humidity_level DECIMAL(4, 1) NOT NULL,
    temperature_level DECIMAL(4, 1) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('sensor', 'refrigerador')),
    status VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
    CONSTRAINT fk_Equipo_Rol FOREIGN KEY (id_rol)
        REFERENCES Rol (id_rol) ON UPDATE CASCADE ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 4. Medicamento (Depende de Equipo)
-- -----------------------------------------------------------------------------
CREATE TABLE Medicamento (
    id_medicamento SERIAL PRIMARY KEY,
    id_equipo INT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    CONSTRAINT fk_Medicamento_Equipo FOREIGN KEY (id_equipo)
        REFERENCES Equipo (id_equipo) ON UPDATE CASCADE ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 5. Lote (Depende de Medicamento)
-- -----------------------------------------------------------------------------
CREATE TABLE Lote (
    id_lote SERIAL PRIMARY KEY,
    id_medicamento INT NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    medication_quantity INT NOT NULL CHECK (medication_quantity >= 0),
    inspection_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'En revisión' CHECK (status IN ('Vigente', 'En revisión', 'Degradado')),
    CONSTRAINT fk_Lote_Medicamento FOREIGN KEY (id_medicamento)
        REFERENCES Medicamento (id_medicamento) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 6. Lectura (Depende de Equipo)
-- -----------------------------------------------------------------------------
CREATE TABLE Lectura (
    id_lectura SERIAL PRIMARY KEY,
    id_equipo INT NOT NULL,
    temperature NUMERIC(5, 2) NOT NULL,
    humidity NUMERIC(5, 2) NOT NULL,
    hour TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_Lectura_Equipo FOREIGN KEY (id_equipo)
        REFERENCES Equipo (id_equipo) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 7. Anomalia (Depende de Equipo)
-- -----------------------------------------------------------------------------
CREATE TABLE Anomalia (
    id_anomalia SERIAL PRIMARY KEY,
    id_equipo INT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration INTERVAL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Acontece', 'En revisión', 'Finalizo')),
    CONSTRAINT fk_Anomalia_Equipo FOREIGN KEY (id_equipo)
        REFERENCES Equipo (id_equipo) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 8. Notificacion (Depende de Anomalia)
-- -----------------------------------------------------------------------------
CREATE TABLE Notificacion (
    id_notificacion SERIAL PRIMARY KEY,
    id_anomalia INT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Correo', 'Alerta')),
    channel VARCHAR(50) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_Notificacion_Anomalia FOREIGN KEY (id_anomalia)
        REFERENCES Anomalia (id_anomalia) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 9. Accion_protocolo (Depende de Notificacion)
-- -----------------------------------------------------------------------------
CREATE TABLE Accion_protocolo (
    id_accion_protocolo SERIAL PRIMARY KEY,
    id_notificacion INT NOT NULL,
    description TEXT NOT NULL,
    duration INTERVAL,
    person_in_charge VARCHAR(120) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    CONSTRAINT fk_Accion_Notificacion FOREIGN KEY (id_notificacion)
        REFERENCES Notificacion (id_notificacion) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 10. Lote_afectado (Depende de Lote y Accion_protocolo)
-- -----------------------------------------------------------------------------
CREATE TABLE Lote_afectado (
    id_lote_afectado SERIAL PRIMARY KEY,
    id_lote INT NOT NULL,
    id_accion_protocolo INT NOT NULL,
    fecha_anomalia TIMESTAMPTZ NOT NULL,
    review_status VARCHAR(50) NOT NULL DEFAULT 'UNDER_EVALUATION',
    justification TEXT,
    CONSTRAINT fk_Lote_afectado_Lote FOREIGN KEY (id_lote)
        REFERENCES Lote (id_lote) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_Lote_afectado_Protocolo FOREIGN KEY (id_accion_protocolo)
        REFERENCES Accion_protocolo (id_accion_protocolo) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 11. Reporte (Depende de Lote_afectado)
-- -----------------------------------------------------------------------------
CREATE TABLE Reporte (
    id_reporte SERIAL PRIMARY KEY,
    id_lote_afectado INT NOT NULL,
    actor VARCHAR(120) NOT NULL,
    client VARCHAR(150),
    report_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    initial_temperature NUMERIC(5, 2) NOT NULL,
    final_temperature NUMERIC(5, 2) NOT NULL,
    CONSTRAINT fk_Reporte_Lote_afectado FOREIGN KEY (id_lote_afectado)
        REFERENCES Lote_afectado (id_lote_afectado) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 12. Traslacion (Depende de Reporte)
-- -----------------------------------------------------------------------------
CREATE TABLE Traslacion (
    id_traslacion SERIAL PRIMARY KEY,
    id_reporte INT NOT NULL,
    medication_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL CHECK (quantity >= 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Esperando', 'Enviado', 'Llego')),
    translation_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_Traslacion_Reporte FOREIGN KEY (id_reporte)
        REFERENCES Reporte (id_reporte) ON UPDATE CASCADE ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- Índices para optimización de consultas
-- -----------------------------------------------------------------------------
CREATE INDEX idx_usuario_id_rol ON Usuario (id_rol);
CREATE INDEX idx_equipo_id_rol ON Equipo (id_rol);
CREATE INDEX idx_medicamento_id_equipo ON Medicamento (id_equipo);
CREATE INDEX idx_lote_id_medicamento ON Lote (id_medicamento);
CREATE INDEX idx_lectura_id_equipo ON Lectura (id_equipo);
CREATE INDEX idx_lectura_hour ON Lectura (hour DESC);
CREATE INDEX idx_anomalia_id_equipo ON Anomalia (id_equipo);
CREATE INDEX idx_notificacion_id_anomalia ON Notificacion (id_anomalia);
CREATE INDEX idx_accion_protocolo_id_notificacion ON Accion_protocolo (id_notificacion);
CREATE INDEX idx_lote_afectado_id_lote ON Lote_afectado (id_lote);
CREATE INDEX idx_lote_afectado_id_accion ON Lote_afectado (id_accion_protocolo);
CREATE INDEX idx_reporte_id_lote_afectado ON Reporte (id_lote_afectado);
CREATE INDEX idx_traslacion_id_reporte ON Traslacion (id_reporte);


