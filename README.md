# ColdChain Sentinel
### Plataforma Web de Monitoreo Crítico IoT de Cadena de Frío Farmacéutica y Hospitalaria
**Área de Cobertura:** Sala `room_911` · **Estándar:** GxP & ISO 13485 Compliance · **Rango Seguro:** 2.0°C a 8.0°C

---

## 1. Visión General del Proyecto

**ColdChain Sentinel** es un sistema web de grado industrial y médico diseñado para garantizar la trazabilidad ininterrumpida de temperatura y humedad en cuartos fríos y neveras donde se almacenan vacunas (mRNA, Hepatitis B), insulinas y reactivos biológicos sensibles.

El sistema incorpora:
1. **Detección Predictiva e Inyección IoT:** Monitoreo en tiempo real cada 3.5 segundos con WebSockets y semáforo visual de estado GxP (Verde / Amarillo / Rojo).
2. **Motor de Reglas Críticas:** Apertura de incidentes Nivel 1 ante 3 lecturas consecutivas fuera de rango (2°C - 8°C), con alerta visual inmediata y notificación automática por correo a los usuarios del nivel correspondiente.
3. **Escalamiento Automatizado por SLA:** Minuto 0 (Técnico), Minuto 5 (Supervisor), Minuto 10 (Director y Protocolo de Emergencia).
4. **Protección de Inventario Farmacéutico:** Cuarentena automática de lotes (`PENDIENTE_REVISION`) ante excursiones térmicas y evaluación manual obligatoria con **Autenticación de Doble Factor (2FA)**.
5. **Módulo de Identidad y Acceso (IAM):** Registro centralizado exclusivamente por el Director del Laboratorio, con asignación de rol y autenticación robusta mediante JWT.

---

## 1.1 Arquitectura del Código

El proyecto se organizó por responsabilidades para evitar archivos monolíticos:

```text
server.js                  # Entrada del backend (delega en server/)
server/
  config.js                # Variables, constantes SLA y hash de contraseñas
  auth.js                  # JWT, verificación y RBAC
  state.js                 # Sensores en memoria, métricas y estado global
  realtime.js              # WebSocket y broadcast del estado
  notifications.js         # Alertas, correos y auditoría de notificaciones
  incidents.js             # Regla de 3 lecturas, SLA, acuse y cierre
  simulator.js             # Motor de telemetría cada 3.5 s
  routes/                  # auth, iam, telemetry, incidents, inventory, audit
  index.js                 # Express, montaje de rutas e inicialización

src/
  App.vue                  # Layout y sesión
  views/HomeView.vue       # Orquestador del dashboard
  components/
    LoginView.vue          # Login (solo plantilla)
    AlertCenter.vue        # Campana y panel de alertas (solo plantilla)
    HistoryCharts.vue      # Gráficas Chart.js (solo plantilla)
    home/                  # Sidebar, dashboard, paneles y modales
  composables/             # useApp, useHome, useHomeActions, useLogin, useAlertCenter, useHistoryCharts
  services/api.js          # Cliente HTTP centralizado y token JWT
  utils/                   # RBAC, filtros/formatos y exportación CSV
  assets/                  # Tema global y CSS extraído por componente
```

- El CSS de cada componente se extrajo a `src/assets/` y se mantiene con `scoped src` o con prefijo `.workspace-layout` para el dashboard.
- `db.js` y `mailer.js` siguen en la raíz como módulos compartidos de PostgreSQL y SMTP.
- `node_modules`, `dist`, `logs`, `.env` y la copia anidada local están excluidos de Git.

---

## 2. Módulo de Autenticación e Identidad (IAM)

### 2.1 Flujo de Registro y Acceso
- **Landing Exclusiva:** La pantalla principal de inicio es exclusivamente la interfaz de **Inicio de Sesión**. No se puede acceder a ningún módulo sin autenticación válida.
- **Sin acceso rápido de prueba:** La pantalla de login solo permite el ingreso con correo institucional y contraseña; no hay botones de demostración ni atajos de rol.
- **Registro cerrado al público:** No existe auto-registro de usuarios. El enlace o formulario de registro público fue eliminado de la pantalla de acceso.
- **Creación exclusiva por el Director:** El usuario con rol **Director del Laboratorio** ingresa al **Módulo 6: Gestión IAM (Permisos)**, presiona **"Registrar Nuevo Usuario"** y diligencia nombres, apellidos, correo, teléfono, rol y contraseña (mínimo 6 caracteres).
- **Cuenta activa de inmediato:** La cuenta creada por el Director queda en estado `ACTIVO` con el rol asignado y puede iniciar sesión de inmediato.
- **Gestión directa de estado:** Desde la tabla IAM, el Director puede **Suspender** (`INACTIVO`) o **Activar** (`ACTIVO`) cualquier cuenta en un solo clic. Se eliminó por completo el flujo de aprobación manual previa.
- **Bloqueo Preventivo:** Si un usuario intenta iniciar sesión mientras su estado sea `INACTIVO`, el sistema deniega el acceso (HTTP 403).
- **Cuentas heredadas:** Las cuentas `PENDIENTE` de versiones anteriores se convierten automáticamente a `INACTIVO` al aplicar la migración y pueden activarse directamente desde el panel IAM.

### 2.2 Cifrado y Seguridad Criptográfica
- **JSON Web Tokens (JWT):** Autenticación sin estado firmada mediante algoritmo criptográfico con expiración de 24 horas y validación de roles en cabeceras `Authorization: Bearer <token>`.
- **Almacenamiento de Contraseñas:** Hash SHA-256 en la base de datos relacional.
- **Autenticación de Doble Factor (2FA):** Validación obligatoria de token TOTP de 6 dígitos numéricos para la disposición técnica definitiva (Apto / Descarte) de lotes afectados.

---

## 3. Matriz de Control de Acceso Basado en Roles (RBAC)

La barra de navegación vertical del frontend renderiza **únicamente** los módulos a los que el rol del usuario autenticado tiene permiso estricto de acceso:

| Módulo | Descripción / Funcionalidad | Permisos de Acceso por Rol |
| :--- | :--- | :--- |
| **Inicio / Dashboard** | Pantalla principal tras el login: KPIs, resumen visual de todos los módulos y monitoreo en vivo de `room_911`. | **TODOS LOS ROLES** (incluye monitoreo en vivo y gráficas para todos los roles) |
| **1. Simulador de Telemetría (IoT)** | Emisión de lecturas e inyección de fallos térmicos controlados (Aumento paulatino, apertura de puerta, telemetría manual). | **TÉCNICO, SUPERVISOR, DIRECTOR** (`TECNICO`, `SUPERVISOR`, `DIRECTOR`) |
| **2. Motor de Alertas y SLA** | Gestión de incidentes Nivel 1, cronómetro de escalamiento SLA (0m, 5m, 10m) y cierre de incidentes. | **TÉCNICO, SUPERVISOR, DIRECTOR** (`TECNICO`, `SUPERVISOR`, `DIRECTOR`). El rol `INVENTARIO` no tiene acceso ni por interfaz ni por API. |
| **3. Historial de Incidencias** | Búsqueda y filtros por texto, estado, nivel SLA y fechas; selección múltiple y exportación CSV solo de las incidencias marcadas. | **TODOS LOS ROLES** (`TECNICO`, `SUPERVISOR`, `INVENTARIO`, `DIRECTOR`) |
| **4. Auditoría, Métricas y Bitácora** | Medición de MTTR, filtros de bitácora, selección de métricas/registros y exportación CSV selectiva, además de reporte PDF. | **SUPERVISOR DE CALIDAD, DIRECTOR** |
| **5. Gestión de Inventario** | CRUD de medicamentos/insumos, control de lotes y evaluación con 2FA de lotes afectados. | **GESTOR DE INVENTARIO, DIRECTOR** |
| **6. Gestión IAM (Permisos)** | Registro de usuarios y cambio directo de estado entre `ACTIVO` y `SUSPENDIDO`. | **DIRECTOR (Exclusivo)** |

---

## 4. Reglas de Negocio Detalladas

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

## 5. Modelo de Datos Relacional (`coldchain_sentinel2` · PostgreSQL)

La base de datos es **real y está conectada al backend** (antes era un archivo aislado). Estructura las siguientes 12 entidades relacionadas:

- `rol`: Catálogo RBAC (`DIRECTOR`, `SUPERVISOR`, `TECNICO`, `INVENTARIO`) con `code` y `avatar`.
- `usuario`: id, id_rol, name, last_name, gmail (correo), phone, password_hash, status (`ACTIVO`, `INACTIVO`), avatar, approved_at, approved_by.
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
| POST | `/api/iam/usuarios` | Crear usuario activo con rol (Director) |
| POST | `/api/auth/login` | Login JWT (bloquea `INACTIVO`) |
| GET | `/api/auth/me` | Perfil del usuario autenticado |
| GET | `/api/iam/usuarios` | Listado IAM (Director) |
| POST | `/api/iam/usuarios/:id/cambiar-estado` | Suspender/activar (Director) |
| POST | `/api/anomalia` | Inyectar fallo térmico |
| POST | `/api/telemetria/manual` | Lectura manual forzada |
| POST | `/api/config/sla-acelerado` | Alternar SLA demo (Técnico/Supervisor/Director) |
| POST | `/api/incidentes/:id/acusar` | Acuse de recibo (Técnico/Supervisor/Director) |
| POST | `/api/incidentes/:id/cerrar` | Cierre con causa raíz y CAPA (Técnico/Supervisor/Director) |
| GET | `/api/exportar/csv` | Exportar telemetría (Supervisor/Director) |
| GET | `/api/lecturas/historico` | Historial para gráficas |
| GET | `/api/inventario` | Productos, lotes y lotes afectados |
| POST | `/api/inventario/medicamentos` | Crear medicamento |
| POST | `/api/inventario/lotes` | Crear lote |
| POST | `/api/lotes-afectados/:id/evaluar` | Disposición final con 2FA |
| GET | `/api/notificaciones` | Historial de alertas enviadas (Técnico/Supervisor/Director) |

> Los endpoints del motor de alertas/SLA, notificaciones y configuración SLA aplican RBAC en el backend. El rol `INVENTARIO` recibe `403 Forbidden` aunque intente invocarlos directamente.

---

## 6. Guía de Puesta en Marcha

### Prerrequisitos
- **Node.js** 22.18+ o 24.12+ (ver `engines` en `package.json`).
- **pnpm 12+** (gestor oficial del proyecto; `corepack enable` lo habilita).
- **PostgreSQL 12+** instalado y en ejecución (con la base de datos `coldchain_sentinel2`).

### Paso 1: Instalar dependencias
```bash
pnpm install
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
- `db/02_migracion.sql` añade las columnas que la aplicación necesita (SLA, 2FA, estados de cuenta…) y convierte cuentas heredadas `PENDIENTE` a `INACTIVO`.
- `db/03_seed.sql` carga roles, usuarios, equipos, medicamentos y lotes de prueba. **Edítalo para poner tus propios correos y usuarios.**

### Paso 4: Iniciar Servidor Backend IoT (API REST + WebSockets)
```bash
pnpm run server
```
*El servidor inicia en `http://localhost:3000`, se conecta a PostgreSQL y arranca la simulación de telemetría.*

### Paso 5: Iniciar Frontend (Vite + Vue 3)
En otra terminal:
```bash
pnpm run dev
```
*Abre la URL indicada (habitualmente `http://localhost:5173`) en tu navegador.*

---

## 6.1 Conexión a PostgreSQL

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

## 6.2 Alertas Visuales y Notificación por Correo

La interfaz incorpora un **Centro de Alertas** (campana en la barra superior):

- **Alerta visual inmediata** por WebSocket cuando un sensor registra lecturas fuera del rango GxP (`2°C – 8°C`), incluso antes de abrir el incidente formal.
- **Toasts emergentes** al crear un incidente, escalar de nivel o cerrar la incidencia.
- **Señal sonora** distinta según la severidad (emergencia Nivel 3 incluida).
- **Panel desplegable** con historial de las últimas alertas, contador de no leídas y control de silencio.

> El Centro de Alertas y el selector de velocidad SLA solo se renderizan para `TECNICO`, `SUPERVISOR` y `DIRECTOR`. El rol `INVENTARIO` no ve la campana ni el control SLA, y el backend rechaza sus llamadas a los endpoints de alertas/SLA.

En paralelo, el backend envía **correos automáticos**. La primera lectura fuera de rango genera una **advertencia por correo al Técnico**; al abrirse el incidente formal, la notificación inicial se envía de inmediato a **todos los usuarios ACTIVOS de todos los roles** en ese momento. Después, el escalamiento SLA mantiene avisos específicos por nivel:

| Nivel | Rol notificado |
| :--- | :--- |
| Advertencia / Nivel 1 | Técnico de Turno (`TECNICO`) |
| Apertura del incidente | Todos los roles con usuarios `ACTIVO` |
| Nivel 2 | Supervisor de Calidad (`SUPERVISOR`) |
| Nivel 3 (Emergencia) | Director del Laboratorio (`DIRECTOR`) |

Cada envío queda auditado en la tabla `notificacion` con estado `ENVIADA`, `FALLIDA` o `NO_CONFIGURADO`. El correo se despacha en segundo plano para no retrasar la alerta visual.

Configura el SMTP y las direcciones de respaldo en el `.env`:

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
> Con Gmail debes usar una **contraseña de aplicación** (no la normal). Si `SMTP_ENABLED=false`, las alertas visuales siguen funcionando y los correos quedan registrados como `NO_CONFIGURADO`. Al iniciar, el backend verifica las credenciales SMTP y muestra en consola si la autenticación falla.

---

## 6.3 Gráficas Históricas

El **Dashboard principal (Inicio)** incluye un panel de gráficas (Chart.js) que muestra:

- Evolución de **temperatura** o **humedad** por equipo.
- Filtro de rango temporal (1h / 2h / 6h).
- Actualización automática cada 10 segundos.
- Datos leídos de la tabla `lectura` mediante `GET /api/lecturas/historico`.

---

## 6.4 Paleta Visual "Sage & Teal"

Toda la interfaz usa una paleta cálida y botánica, con **fondo arena, tarjetas teal y acentos salvia**:

| Uso | Color | HEX |
| :--- | :--- | :--- |
| Fondo principal y contenedores | Arena cálida | `#F4EBDB` |
| Tarjetas, módulos y secciones | Teal medio | `#537072` |
| Elementos secundarios, bordes y acentos | Salvia | `#8E9B97` |
| Texto principal, botones destacados y highlights | Teal profundo | `#2C4A52` |

La interfaz incorpora gradientes suaves, brillos ambientales, sombras luminosas y microanimaciones en tarjetas, botones, sidebar y login. Los colores semáforo GxP (verde, ámbar y rojo) se conservan para estados, alertas y criticidad.

---

## 7. Credenciales Pre-configuradas para Pruebas

La pantalla de login **no incluye accesos rápidos**: el ingreso se realiza únicamente escribiendo el correo institucional y la contraseña.

| Rol | Correo Electrónico | Contraseña | Capacidades Destacadas |
| :--- | :--- | :--- | :--- |
| **Director del Laboratorio** | `director@coldchain.com` | `admin123` | **Acceso total**: IAM para crear usuarios y activar/suspender cuentas, Auditoría, Lotes 2FA. |
| **Supervisor de Calidad** | `supervisor@coldchain.com` | `supervisor123` | Dashboard, Historial, Auditoría MTTR y Disposición 2FA de lotes. |
| **Técnico de Turno** | `tecnico@coldchain.com` | `tecnico123` | Simulador IoT, Dashboard, Alertas, Acuse de recibo y cierre de incidentes. |
| **Gestor de Inventario** | `inventario@coldchain.com` | `inventario123` | Dashboard con telemetría en vivo, Historial, CRUD de medicamentos y registro de nuevos lotes. Sin acceso al Simulador IoT, Alertas/SLA ni campana de alertas. |

> Las cuentas demo distintas del Director pueden estar en estado `INACTIVO`. Actívelas desde **Módulo 6: Gestión IAM** con el botón **Activar** antes de iniciar sesión.

> **Código 2FA sugerido para pruebas de disposición de lotes:** `741258` (o cualquier código numérico de 6 dígitos).
