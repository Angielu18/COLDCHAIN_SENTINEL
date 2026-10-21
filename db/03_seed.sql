-- =====================================================================
-- ColdChain Sentinel - Datos de Prueba (SEED)
-- Base de datos: coldchain_sentinel2
-- =====================================================================
-- ✏️  EDITA ESTE ARCHIVO para poner TUS usuarios, correos y roles.
--
-- Cómo agregar un usuario nuevo:
--   1. Busca su id_rol en la tabla 'rol' (1=DIRECTOR, 2=SUPERVISOR,
--      3=TECNICO, 4=INVENTARIO) — o el que tú crees más abajo.
--   2. Copia una línea de la sección INSERT INTO usuario y cámbiale
--      los datos. El password_hash debe ser SHA-256 en minúsculas.
--
-- Para generar el hash SHA-256 de una contraseña, ejecuta en tu PC:
--   node -e "console.log(require('crypto').createHash('sha256').update('TU_CLAVE').digest('hex'))"
--
-- Ejecuta este archivo después de 02_migracion.sql, así:
--   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d coldchain_sentinel2 -f db/03_seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- ROLES (RBAC)
-- ---------------------------------------------------------------------
INSERT INTO rol (id_rol, code, name, description, avatar) VALUES
  (1, 'DIRECTOR',   'DIRECTOR',   'Director del Laboratorio',  '👨‍💼'),
  (2, 'SUPERVISOR', 'SUPERVISOR', 'Supervisor de Calidad',     '👩‍⚕️'),
  (3, 'TECNICO',    'TECNICO',    'Técnico de Turno',          '👨‍🔧'),
  (4, 'INVENTARIO', 'INVENTARIO', 'Gestor de Inventario',      '📦')
ON CONFLICT (id_rol) DO UPDATE
  SET code = EXCLUDED.code, name = EXCLUDED.name,
      description = EXCLUDED.description, avatar = EXCLUDED.avatar;

SELECT setval('rol_id_rol_seq', (SELECT MAX(id_rol) FROM rol));

-- ---------------------------------------------------------------------
-- USUARIOS  (columna de correo: 'gmail' según el esquema original)
-- Contraseñas en texto plano como referencia:
--   director@coldchain.com    -> admin123
--   supervisor@coldchain.com  -> supervisor123
--   tecnico@coldchain.com     -> tecnico123
--   inventario@coldchain.com  -> inventario123
-- ---------------------------------------------------------------------
INSERT INTO usuario (id_usuario, id_rol, name, last_name, gmail, phone, password_hash, status, avatar, approved_by) VALUES
  (1, 1, 'Dr. Roberto', 'Silva', 'director@coldchain.com', '+57 300 1234567',
     '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
     'ACTIVO', '👨‍💼', 'Sistema Inicial'),
  (2, 2, 'Dra. Elena', 'Ramos', 'supervisor@coldchain.com', '+57 300 2345678',
     '02423ab2e61297b8262449c93e19be42fb5bbb275860a7d93b1ebdc7b6535ed7',
     'ACTIVO', '👩‍⚕️', 'Dr. Roberto Silva'),
  (3, 3, 'Carlos', 'Méndez', 'tecnico@coldchain.com', '+57 300 3456789',
     '2bd5100f475915a8990f6a4b342ac161e5eb754581d81a4b6462843e63601ada',
     'ACTIVO', '👨‍🔧', 'Dr. Roberto Silva'),
  (4, 4, 'Ana', 'Gómez', 'inventario@coldchain.com', '+57 300 4567890',
     'f54568eeb40e6872d8df7afffc13608decaee72e20803a0da71309ece6cc73ea',
     'ACTIVO', '📦', 'Dr. Roberto Silva'),
  -- Usuario de prueba en estado PENDIENTE para validar el flujo IAM
  (5, 3, 'Javier', 'Morales', 'javier.morales@hospital.org', '+57 311 9876543',
     'd3ad9315b7be5dd53b31a273b3b3aba5defe700808305aa16a3062b76658a791',
     'PENDIENTE', '👤', NULL)
ON CONFLICT (id_usuario) DO NOTHING;

-- ---------------------------------------------------------------------
-- USUARIOS REALES (equipo de la cadena de frío)
-- Contraseña para todos: 123456
--   Angie Ramos  -> TECNICO     (recibe Minuto 0)
--   Luisa Gomez  -> SUPERVISOR  (recibe Minuto 5 sin acuse)
--   Brayan Cuta  -> DIRECTOR    (recibe Minuto 10 + emergencia)
-- ---------------------------------------------------------------------
INSERT INTO usuario (id_rol, name, last_name, gmail, phone, password_hash, status, avatar) VALUES
  (3, 'Angie',  'Ramos', 'valesotelo.0806@gmail.com',   '+57 300 0000000',
     '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'ACTIVO', '👨‍🔧'),
  (2, 'Luisa',  'Gomez', 'luisagomez.080607@gmail.com', '+57 300 0000000',
     '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'ACTIVO', '👩‍⚕️'),
  (1, 'Brayan', 'Cuta',  'lasanita0204@gmail.com',      '+57 300 0000000',
     '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'ACTIVO', '👨‍💼')
ON CONFLICT (gmail) DO NOTHING;

SELECT setval('usuario_id_usuario_seq', (SELECT MAX(id_usuario) FROM usuario));

-- ---------------------------------------------------------------------
-- EQUIPOS / SENSORES (sala room_911)
-- ---------------------------------------------------------------------
INSERT INTO equipo (id_equipo, id_rol, code, name, type, location, humidity_level, temperature_level, temp_min, temp_max, status) VALUES
  (1, 3, 'SEN-01', 'Cuarto Frío 1 (Vacunas)',         'refrigerador', 'Sala room_911 - Bloque A', 58.0, 4.5, 2.0, 8.0, 'activo'),
  (2, 3, 'SEN-02', 'Nevera 1 (Insulinas)',            'refrigerador', 'Sala room_911 - Bloque B', 52.0, 4.8, 2.0, 8.0, 'activo'),
  (3, 3, 'SEN-03', 'Nevera 2 (Reactivos Biológicos)', 'refrigerador', 'Sala room_911 - Bloque C', 48.0, 5.2, 2.0, 8.0, 'activo')
ON CONFLICT (id_equipo) DO NOTHING;

SELECT setval('equipo_id_equipo_seq', (SELECT MAX(id_equipo) FROM equipo));

-- ---------------------------------------------------------------------
-- MEDICAMENTOS
-- ---------------------------------------------------------------------
INSERT INTO medicamento (id_medicamento, id_equipo, name, code, type, optimal_temp) VALUES
  (1, 1, 'Vacuna mRNA COVID-19',                   'MED-VAC-001', 'MEDICAMENTO', '2°C a 8°C'),
  (2, 2, 'Insulina Glargina 100 UI/ml',            'MED-INS-002', 'MEDICAMENTO', '2°C a 8°C'),
  (3, 3, 'Anticuerpos Monoclonales Inmunoterapia', 'MED-BIO-003', 'MEDICAMENTO', '2°C a 8°C'),
  (4, 1, 'Vacuna Hepatitis B Recombinante',        'MED-VAC-004', 'MEDICAMENTO', '2°C a 8°C')
ON CONFLICT (id_medicamento) DO NOTHING;

SELECT setval('medicamento_id_medicamento_seq', (SELECT MAX(id_medicamento) FROM medicamento));

-- ---------------------------------------------------------------------
-- LOTES
-- ---------------------------------------------------------------------
INSERT INTO lote (id_lote, id_medicamento, id_equipo, batch_number, medication_quantity, inspection_date, status) VALUES
  (1, 1, 1, 'LOT-2026-X89', 5000, '2027-04-15', 'Vigente'),
  (2, 2, 2, 'LOT-2026-B12', 2400, '2026-12-30', 'Vigente'),
  (3, 3, 3, 'LOT-2026-C44',  850, '2027-08-20', 'Vigente'),
  (4, 4, 1, 'LOT-2026-V77', 3200, '2027-01-10', 'Vigente')
ON CONFLICT (id_lote) DO NOTHING;

SELECT setval('lote_id_lote_seq', (SELECT MAX(id_lote) FROM lote));

-- =====================================================================
-- FIN DEL SEED
-- =====================================================================
