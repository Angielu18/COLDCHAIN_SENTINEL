# ColdChain Sentinel ❄️
### Plataforma Web de Monitoreo Crítico IoT de Cadena de Frío Farmacéutica y Hospitalaria
**Área de Cobertura:** Sala `room_911` · **Estándar:** GxP & ISO 13485 Compliance · **Rango Seguro:** 2.0°C a 8.0°C

---

## 1. 🏛️ Visión General del Proyecto

**ColdChain Sentinel** es un sistema web de grado industrial y médico diseñado para garantizar la trazabilidad ininterrumpida de temperatura y humedad en cuartos fríos y neveras donde se almacenan vacunas (mRNA, Hepatitis B), insulinas y reactivos biológicos sensibles.

El sistema incorpora:
1. **Detección Predictiva e Inyección IoT:** Monitoreo en tiempo real cada 3.5 segundos con WebSockets y semáforo visual de estado GxP (Verde / Amarillo / Rojo).
2. **Motor de Reglas Críticas:** Apertura de incidentes Nivel 1 ante 3 lecturas consecutivas fuera de rango (2°C - 8°C).
3. **Escalamiento Automatizado por SLA:** Minuto 0 (Técnico), Minuto 5 (Supervisor), Minuto 10 (Director y Protocolo de Emergencia).
4. **Protección de Inventario Farmacéutico:** Cuarentena automática de lotes (`PENDIENTE_REVISION`) ante excursiones térmicas y evaluación manual obligatoria con **Autenticación de Doble Factor (2FA)**.
5. **Módulo de Identidad y Acceso (IAM):** Registro abierto con aprobación y asignación exclusiva de rol por el Director del Laboratorio, respaldado por autenticación robusta mediante JWT.

---

## 2. 🔑 Módulo de Autenticación, Identidad (IAM) y Flujo de Aprobación

### 2.1 Flujo de Registro y Acceso
- **Landing Exclusiva:** La pantalla principal de inicio es exclusivamente la interfaz de **Inicio de Sesión / Registro**. No se puede acceder a ningún módulo sin autenticación válida.
- **Registro Abierto:** Cualquier usuario puede registrarse completando sus nombres, apellidos, correo institucional/gmail, teléfono y contraseña.
- **Estado Inicial `PENDIENTE_APROBACION`:** Al completar el registro, el sistema emite la notificación:
  > *"Su cuenta ha sido creada exitosamente. Debe esperar la aprobación del Director del Laboratorio para acceder a la plataforma."*
- **Bloqueo Preventivo:** Si el usuario intenta iniciar sesión mientras su estado sea `PENDIENTE` o `INACTIVO`, el sistema deniega el acceso (HTTP 403) informando que debe aguardar la autorización.
- **Aprobación Única por el Director:** El usuario con rol **Director del Laboratorio** ingresa al **Módulo 6: Gestión IAM (Permisos)**, visualiza las solicitudes pendientes, selecciona el rol correspondiente y presiona **"Aprobar Acceso"**.
- **Persistencia y Activación:** El estado pasa a `ACTIVO` y el usuario queda habilitado para iniciar sesión normalmente en todos sus accesos futuros.

### 2.2 Cifrado y Seguridad Criptográfica
- **JSON Web Tokens (JWT):** Autenticación sin estado firmada mediante algoritmo criptográfico con expiración de 24 horas y validación de roles en cabeceras `Authorization: Bearer <token>`.
- **Almacenamiento de Contraseñas:** Hash SHA-256 en la base de datos relacional.
- **Autenticación de Doble Factor (2FA):** Validación obligatoria de token TOTP de 6 dígitos numéricos para la disposición técnica definitiva (Apto / Descarte) de lotes afectados.

---

## 3. 🛡️ Matriz de Control de Acceso Basado en Roles (RBAC)

La barra de navegación del frontend renderiza **únicamente** los módulos a los que el rol del usuario autenticado tiene permiso estricto de acceso:

| Módulo | Descripción / Funcionalidad | Permisos de Acceso por Rol |
| :--- | :--- | :--- |
| **1. Simulador de Telemetría (IoT)** | Emisión de lecturas e inyección de fallos térmicos controlados (Aumento paulatino, apertura de puerta, telemetría manual). | **TODOS LOS ROLES** (`TECNICO`, `SUPERVISOR`, `INVENTARIO`, `DIRECTOR`) |
| **2. Dashboard en Tiempo Real** | Visualización en vivo mediante WebSockets con semáforo de estado (Verde / Amarillo / Rojo) en sala `room_911`. | **TÉCNICO DE TURNO, SUPERVISOR DE CALIDAD, DIRECTOR** *(Gestor de Inventario NO tiene acceso)* |
| **3. Motor de Alertas y SLA** | Gestión de incidentes Nivel 1, cronómetro de escalamiento SLA (0m, 5m, 10m) y cierre de incidentes. | **TODOS LOS ROLES** (`TECNICO`, `SUPERVISOR`, `INVENTARIO`, `DIRECTOR`) |
| **4. Auditoría y Métricas** | Medición de MTTR (Tiempo Medio de Respuesta), exportación de reportes CSV y formato PDF para auditorías médicas. | **SUPERVISOR DE CALIDAD, DIRECTOR** |
| **5. Gestión de Inventario** | CRUD de medicamentos/insumos, control de lotes y evaluación con 2FA de lotes afectados. | **GESTOR DE INVENTARIO, DIRECTOR** |
| **6. Gestión IAM (Permisos)** | Aprobación de nuevos usuarios, asignación de roles y suspensión/reactivación de cuentas. | **DIRECTOR (Exclusivo)** |

---

## 4. 📋 Reglas de Negocio Detalladas

1. **Monitoreo y Alertas IoT:**
   - La sala `room_911` opera en un rango estricto de **2.0°C a 8.0°C**.
   - Si un sensor registra una temperatura fuera de rango durante **3 lecturas consecutivas**, el sistema clasifica el equipo como `Crítico` y genera automáticamente una alerta de **Nivel 1**.
2. **Escalamiento por SLA:**
   - **Minuto 0:** Notificación inmediata al Técnico de Turno.
   - **Minuto 5 (sin acuse):** Escalamiento automático al Supervisor de Calidad (Nivel 2).
   - **Minuto 10 (sin acuse):** Escalamiento al Director del Laboratorio y activación de **Protocolo de Emergencia (Nivel 3)** con banner global en toda la plataforma.
   - **Cierre de Incidente:** Requiere registrar de manera obligatoria la **causa raíz** y las **acciones correctivas aplicadas (CAPA)**.
3. **Evaluación de Lotes Afectados:**
   - Al generarse una alerta, todos los lotes guardados en la nevera o cuarto frío afectado pasan automáticamente al estado `PENDIENTE_REVISION`.
   - **Regla Crítica:** Ningún lote se dictamina de forma automatizada. La disposición final (APTO o NO APTO / Descarte) debe realizarse manualmente por un usuario autorizado (**Supervisor o Director**) confirmando un código **2FA de 6 dígitos** y una **justificación médica/técnica** mayor a 10 caracteres.

---

## 5. 📂 Modelo de Datos Relacional (`coldchain_sentinel2` · PostgreSQL)

La base de datos es **real y está conectada al backend** (antes era un archivo aislado). Estructura las siguientes 12 entidades relacionadas:

- `rol`: Catálogo RBAC (`DIRECTOR`, `SUPERVISOR`, `TECNICO`, `INVENTARIO`) con `code` y `avatar`.
- `usuario`: id, id_rol, name, last_name, gmail (correo), phone, password_hash, status (`PENDIENTE`, `ACTIVO`, `INACTIVO`), avatar, approved_at, approved_by.
- `equipo`: Neveras y cuartos fríos en `room_911`, `code` (SEN-01…), `location`, rango `temp_min`/`temp_max` y estado.
- `medicamento`: Insumos y fármacos sensibles (code, name, type, id_equipo, optimal_temp).
- `lote`: Trazabilidad por batch_number, cantidad, fecha de inspección y estado (`Vigente`, `En revisión`, `Degradado`).
- `lectura`: Historial cronológico de telemetría IoT (temperature, humidity, hour) — **alimenta las gráficas**.
- `anomalia`: Incidentes con `level`, `sla_stage`, `current_target`, `emergency_protocol`, acuse, cierre, `root_cause` y `corrective_actions`.
- `notificacion`: Registro de alertas (tipo Correo/Alerta/SMS, canal, nivel, destinatario, estado de entrega).
- `accion_protocolo`: Acciones de mitigación operativa.
- `lote_afectado`: Cuarentena con `review_status`, `justification`, `decided_by` y `decided_at` (trazabilidad 2FA).
- `reporte`: Auditoría sanitaria GxP formal (temperaturas inicial/final).
- `traslacion`: Movilización preventiva de fármacos entre cuartos fríos.

### Endpoints REST (resumen)
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/api/auth/register` | Registro abierto (crea usuario `PENDIENTE`) |
| POST | `/api/auth/login` | Login JWT (bloquea `PENDIENTE`/`INACTIVO`) |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| GET | `/api/iam/usuarios` | Listado IAM (Director) |
| POST | `/api/iam/usuarios/:id/aprobar` | Aprobar y asignar rol (Director) |
| POST | `/api/iam/usuarios/:id/cambiar-estado` | Suspender/activar (Director) |
| POST | `/api/anomalia` | Inyectar fallo térmico |
| POST | `/api/telemetria/manual` | Lectura manual forzada |
| POST | `/api/config/sla-acelerado` | Alternar SLA demo (15s/30s ↔ 5m/10m) |
| POST | `/api/incidentes/:id/acusar` | Acuse de recibo (detiene SLA) |
| POST | `/api/incidentes/:id/cerrar` | Cierre con causa raíz y CAPA |
| GET | `/api/exportar/csv` | Exportar telemetría (Supervisor/Director) |
| GET | `/api/lecturas/historico` | Historial para gráficas |
| GET | `/api/inventario` | Productos, lotes y lotes afectados |
| POST | `/api/inventario/medicamentos` | Crear medicamento |
| POST | `/api/inventario/lotes` | Crear lote |
| POST | `/api/lotes-afectados/:id/evaluar` | Disposición final con 2FA |
| GET | `/api/notificaciones` | Historial de alertas enviadas |

---

## 6. 🚀 Guía de Puesta en Marcha

### Prerrequisitos
- **Node.js** v20 o superior.
- **npm** o **pnpm**.
- **PostgreSQL 12+** instalado y en ejecución (con la base de datos `coldchain_sentinel2`).

### Paso 1: Instalar dependencias
```bash
npm install
```

### Paso 2: Configurar la conexión a la base de datos (`.env`)
El archivo `.env` en la raíz del proyecto ya contiene los valores de conexión.
Ajústalos a tu instalación de PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_contraseña
DB_NAME=coldchain_sentinel2
```

### Paso 3: Aplicar la migración y los datos de prueba (solo la primera vez)
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d coldchain_sentinel2 -f db/02_migracion.sql
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d coldchain_sentinel2 -f db/03_seed.sql
```
- `db/02_migracion.sql` añade las columnas que la aplicación necesita (SLA, 2FA, estados `PENDIENTE`…).
- `db/03_seed.sql` carga roles, usuarios, equipos, medicamentos y lotes de prueba. **Edítalo para poner tus propios correos y usuarios.**

### Paso 4: Iniciar Servidor Backend IoT (API REST + WebSockets)
```bash
npm run server
```
*El servidor inicia en `http://localhost:3000`, se conecta a PostgreSQL y arranca la simulación de telemetría.*

### Paso 5: Iniciar Frontend (Vite + Vue 3)
En otra terminal:
```bash
npm run dev
```
*Abre la URL indicada (habitualmente `http://localhost:5173`) en tu navegador.*

---

## 6.1 🗄️ Conexión a PostgreSQL

A diferencia de versiones anteriores, **el backend ahora persiste todo en PostgreSQL** (base `coldchain_sentinel2`):

- **Usuarios, roles, medicamentos y lotes** viven en la base de datos.
- **Cada lectura de telemetría** se guarda en la tabla `lectura` (insumo de las gráficas históricas).
- **Cada incidente/anomalía** se guarda con su nivel SLA, acuses, causa raíz y CAPA.
- **Cada alerta y correo** se registra en la tabla `notificacion`.

### Cómo agregar tus propios usuarios y roles
Edita `db/03_seed.sql` y añade líneas al `INSERT INTO usuario`. El `password_hash` es SHA-256; para generarlo:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('TU_CLAVE').digest('hex'))"
```

Para crear un rol nuevo, añádelo primero en `INSERT INTO rol` y luego usa su `id_rol` en el usuario.

---

## 6.2 🔔 Alertas en Tiempo Real

La interfaz incorpora un **Centro de Alertas** (campana en la barra superior):

- **Campana con contador** de alertas no leídas.
- **Toasts emergentes** con animación al detectar una anomalía nueva o un escalamiento.
- **Señal sonora** distinta según el nivel (graves para emergencia Nivel 3).
- **Panel desplegable** con el historial de las últimas alertas y botón de silencio.

En paralelo, el backend puede enviar **correos reales** por SMTP. Configúralo en el `.env`:

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tucorreo@gmail.com
SMTP_PASS=tu_contraseña_de_aplicacion
ALERTAS_TECNICO=tecnico@hospital.org
ALERTAS_SUPERVISOR=supervisor@hospital.org
ALERTAS_DIRECTOR=director@hospital.org
```
> Con Gmail debes usar una **contraseña de aplicación** (no la normal). Si `SMTP_ENABLED=false`, las alertas visuales siguen funcionando y los correos quedan registrados como `NO_CONFIGURADO`.

---

## 6.3 📈 Gráficas Históricas

El **Dashboard en tiempo real** incluye un panel de gráficas (Chart.js) que muestra:

- Evolución de **temperatura** o **humedad** por equipo.
- Filtro de rango temporal (1h / 2h / 6h).
- Actualización automática cada 10 segundos.
- Datos leídos de la tabla `lectura` mediante `GET /api/lecturas/historico`.

---

## 7. 🧪 Credenciales Pre-configuradas para Pruebas Rápidas

Para facilitar la evaluación inmediata de los flujos IAM y la matriz RBAC, la pantalla de inicio incluye botones de **Acceso Rápido de Prueba**:

| Rol | Correo Electrónico | Contraseña | Capacidades Destacadas |
| :--- | :--- | :--- | :--- |
| **Director del Laboratorio** | `director@coldchain.com` | `admin123` | **Acceso total**: Módulo 6 IAM para aprobar usuarios, Auditoría, Lotes 2FA. |
| **Supervisor de Calidad** | `supervisor@coldchain.com` | `supervisor123` | Dashboard en vivo, Auditoría MTTR, Disposición 2FA de lotes. |
| **Técnico de Turno** | `tecnico@coldchain.com` | `tecnico123` | Simulador IoT, Dashboard en vivo, Acuse de recibo y cierre de incidentes. |
| **Gestor de Inventario** | `inventario@coldchain.com` | `inventario123` | CRUD de medicamentos, registro de nuevos lotes, Simulador IoT. |
| **Usuario Aspirante (Pendiente)** | `javier.morales@hospital.org` | `demo123` | Cuenta de prueba en estado `PENDIENTE` para validar la aprobación en vivo. |

> **Código 2FA sugerido para pruebas de disposición de lotes:** `741258` (o cualquier código numérico de 6 dígitos).
