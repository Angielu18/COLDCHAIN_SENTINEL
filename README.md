# ColdChain Sentinel

Sistema de monitoreo continuo y gestion de contingencias para la cadena de frio farmaceutica y biologica.

---

## 1. Que es ColdChain Sentinel?

ColdChain Sentinel es una aplicacion creada para proteger medicamentos delicados, vacunas e insumos biologicos que necesitan mantenerse a temperaturas muy especificas (habitualmente entre 2.0 y 8.0 grados Celsius).

Si una nevera o un cuarto frio sufre una averia o se deja la puerta abierta:
- La temperatura empieza a subir y pone en peligro las medicinas.
- ColdChain Sentinel detecta de inmediato la variacion en tiempo real.
- Emite una alarma visual para alertar al personal de turno.
- Pone en cuarentena preventiva los lotes de medicamentos almacenados en ese equipo.
- Permite registrar acciones correctivas o trasladar los productos a otra nevera de respaldo antes de que se echen a perder.

---

## 2. Como esta compuesto el sistema?

El proyecto se divide en tres partes principales que trabajan juntas:

1. Base de Datos (PostgreSQL):
   Almacena la estructura formal del hospital o laboratorio: lista de usuarios, roles permitidos, equipos frigorificos, medicamentos, lotes y el historial de lecturas y traslados.

2. Servidor Backend (Node.js con Express y WebSockets):
   Actua como el cerebro del sistema. Simula los sensores de temperatura y humedad en tiempo real, evalua si hay lecturas fuera de rango, calcula tiempos de respuesta (SLA) y envia los datos segundo a segundo al navegador.

3. Interfaz Visual Frontend (Vue 3 con Vite):
   Es la pantalla que ven los operadores, tecnicos, supervisores y directores. Permite ver el estado de cada cuarto frio, simular fallas para pruebas, atender alertas y autorizar decisiones con doble factor de autenticacion (2FA).

---

## 3. Roles de usuario y permisos

El sistema cuenta con un control de accesos para que cada persona tenga responsabilidades claras:

- Tecnico de Turno:
  Atiende las alarmas inmediatas en la sala de maquinas. Puede registrar el acuse de recibo de una alarma y cerrar el incidente cuando el equipo vuelve a estar frio.

- Supervisora de Calidad:
  Revisa las alertas escaladas y analiza si los medicamentos sufrieron dano termico. Es la encargada de aprobar o rechazar lotes afectados usando un codigo de confirmacion 2FA.

- Director del Laboratorio:
  Tiene acceso de maximo nivel para consultar auditorias completas, evaluar tiempos medios de resolucion (MTTR) y autorizar descarte o uso excepcional de medicamentos de alto valor.

- Gestora de Inventario:
  Supervisa el stock disponible, da de alta nuevos lotes de productos y coordina traslados de emergencia hacia otras neveras disponibles.

---

## 4. Requisitos para usar el proyecto

Para ejecutar el proyecto en tu computadora necesitas:

- Node.js version 20 o superior instalada.
- Gestor de paquetes npm o pnpm.
- Navegador web moderno (Google Chrome, Microsoft Edge, Firefox, Brave).
- PostgreSQL (opcional, para desplegar el script SQL en una base de datos real).

---

## 5. Guia paso a paso para ejecutar el proyecto

Sigue estos sencillos pasos desde la terminal o consola de comandos:

### Paso 1: Instalar dependencias

Abre una terminal en la carpeta principal del proyecto y ejecuta:

```bash
npm install
```

### Paso 2: Iniciar el servidor backend

En una primera ventana de la terminal, inicia el servidor de telemetria y WebSockets:

```bash
npm run server
```

El servidor quedara escuchando en el puerto 3000 y mostrara un mensaje confirmando que el simulador de sensores esta activo.

### Paso 3: Iniciar la interfaz web

En una segunda ventana de la terminal, inicia el entorno de desarrollo visual:

```bash
npm run dev
```

La consola te indicara la direccion local (habitualmente http://localhost:5173). Abre esa direccion en tu navegador para ver la pantalla de monitoreo.

---

## 6. Fragmentos de codigo explicados

A continuacion se presentan fragmentos clave del sistema explicados de manera sencilla para comprender como funciona por dentro:

### Fragmento A: Conexion en tiempo real desde la pantalla (Vue 3)

Este bloque de codigo se encuentra en el archivo src/App.vue. Se encarga de abrir un canal de comunicacion permanente con el servidor (WebSocket). Gracias a esto, la pantalla se actualiza sola sin necesidad de recargar la pagina.

```javascript
// Abrir el canal de comunicacion continua con el servidor
const conectarWebSocket = () => {
  socket = new WebSocket('ws://localhost:3000')

  // Cuando la conexion es exitosa, marcamos el sistema como en linea
  socket.onopen = () => {
    conectado.value = true
  }

  // Cada vez que el servidor manda nuevas lecturas de temperatura:
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.tipo === 'ACTUALIZACION_COMPLETA') {
      sensores.value = data.sensores || []
      incidentes.value = data.incidentes || []
      metricas.value = data.metricas || metricas.value
    }
  }

  // Si se interrumpe la conexion, intentamos reconectar
  socket.onclose = () => {
    conectado.value = false
  }
}
```

### Fragmento B: Generacion y envio continuo de telemetria (Backend)

Este bloque se encuentra en server.js. El servidor ejecuta un temporizador cada segundo que actualiza la temperatura de cada cuarto frio y notifica a todas las pantallas conectadas.

```javascript
// Cada segundo se evalua la temperatura de cada sensor
setInterval(() => {
  sensores.forEach(s => {
    // Si se activo una falla, la temperatura sube progresivamente
    if (s.modoFallo === 'AUMENTO_PAULATINO') {
      s.temp = Number((s.temp + 0.45).toFixed(1))
    }

    // Si la temperatura supera el limite maximo permitido (ej. 8.0 C)
    if (s.temp > s.tempMax || s.temp < s.tempMin) {
      s.estado = 'Alerta'
      // Se genera automaticamente un incidente y se escalan notificaciones
      crearOActualizarIncidente(s)
    }
  })

  // Enviar el nuevo estado a todas las pantallas abiertas
  broadcast({
    tipo: 'ACTUALIZACION_COMPLETA',
    sensores,
    incidentes,
    metricas
  })
}, 1000)
```

### Fragmento C: Estructura de la base de datos para registrar lecturas (SQL)

Este fragmento pertenece a coldchain_sentinel.sql. Define la tabla donde queda guardado cada dato registrado por un sensor, asegurando la trazabilidad historica requerida por las normas sanitarias.

```sql
CREATE TABLE Lectura (
    id_lectura BIGSERIAL PRIMARY KEY,
    id_equipo INT NOT NULL REFERENCES Equipo(id_equipo) ON DELETE CASCADE,
    temperatura NUMERIC(4, 2) NOT NULL,
    humedad NUMERIC(4, 2) NOT NULL,
    bateria_porcentaje NUMERIC(4, 1) DEFAULT 100.0,
    fuera_de_rango BOOLEAN DEFAULT FALSE,
    fecha_hora TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Flujo tipico de un incidente paso a paso

Para entender como se utiliza la aplicacion en el dia a dia, imagina la siguiente situacion en el hospital:

1. Deteccion:
   El compresor de la Nevera 1 empieza a recalentarse. La temperatura sube a 8.5 grados.

2. Alarma automatica:
   El sensor SEN-02 detecta que sobrepaso los 8.0 grados. La tarjeta de la nevera se pinta de color rojo en pantalla y se crea un nuevo incidente clasificado como excursion termica.

3. Cuarentena de lotes:
   Los lotes de insulina guardados en esa nevera pasan automaticamente al estado En Revision, impidiendo que el personal los despache por error a pacientes.

4. Atencion del personal:
   El Tecnico de Turno presiona el boton "Dar Acuse de Recibo", lo que frena el cronometro de urgencia y avisa a los supervisores que ya hay alguien atendiendo el problema.

5. Accion correctiva o traslado:
   Si el equipo no enfria rapido, el personal utiliza el boton "Plan de Traslado" para mover temporalmente las cajas de insulina hacia el Cuarto Frio 1 que si esta funcionando correctamente.

6. Cierre y liberacion segura:
   La Supervisora de Calidad evalua cuanto tiempo duro la falla. Si la temperatura no dano el producto, ingresa su codigo 2FA de autorizacion para regresar los lotes al estado Apto y archivar el incidente con su informe tecnico.

---

## 8. Estructura de carpetas del proyecto

- src/
  - assets/: Hojas de estilo y logotipos del sistema.
  - components/: Componentes visuales y elementos reutilizables.
  - router/: Configuracion de las rutas de navegacion.
  - views/: Pantallas principales (HomeView.vue para el panel de control y AboutView.vue).
  - App.vue: Componente raiz que gestiona el estado global y la conexion en vivo.
  - main.js: Punto de entrada de la aplicacion Vue.
- public/: Recursos estaticos como el icono de pestana (favicon).
- server.js: Servidor backend con la simulacion de sensores y WebSockets.
- coldchain_sentinel.sql: Script de creacion de tablas y datos iniciales para PostgreSQL.
- package.json: Declaracion de dependencias y comandos de ejecucion.
- vite.config.js: Configuracion de compilacion rapida con Vite.

---

## 9. Licencia y proposito

Este proyecto fue desarrollado con fines educativos y de gestion tecnologica hospitalaria para garantizar la seguridad de pacientes mediante el cuidado estricto de la cadena de frio.
