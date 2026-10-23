export const ROLE_LABELS = {
  DIRECTOR: 'Director del Laboratorio',
  SUPERVISOR: 'Supervisora de Calidad',
  TECNICO: 'Técnico de Turno',
  INVENTARIO: 'Gestora de Inventario',
  PENDIENTE: 'Pendiente de Asignación'
}

export const ALERT_ROLES = ['TECNICO', 'SUPERVISOR', 'DIRECTOR']

export const MODULOS = [
  {
    id: 'inicio',
    nombre: 'Inicio / Dashboard',
    shortLabel: 'Inicio',
    roles: ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR', 'PENDIENTE'],
    desc: 'Vista general del estado de la cadena de frío y de todos los módulos.'
  },
  {
    id: 'simulador',
    nombre: '1. Simulador de Telemetría (IoT)',
    shortLabel: 'Simulador IoT',
    roles: ['TECNICO', 'SUPERVISOR', 'DIRECTOR'],
    desc: 'Emisión de lecturas e inyección de fallos térmicos controlados.'
  },
  {
    id: 'alertas',
    nombre: '2. Motor de Alertas y SLA',
    shortLabel: 'Alertas & SLA',
    roles: ALERT_ROLES,
    desc: 'Escalamiento temporal por minutos y gestión de incidentes.'
  },
  {
    id: 'historial',
    nombre: '3. Historial de Incidencias',
    shortLabel: 'Historial',
    roles: ['TECNICO', 'SUPERVISOR', 'INVENTARIO', 'DIRECTOR'],
    desc: 'Consulta filtrada de incidencias y exportación de la selección.'
  },
  {
    id: 'auditoria',
    nombre: '4. Auditoría, Métricas y Bitácora',
    shortLabel: 'Auditoría & Bitácora',
    roles: ['SUPERVISOR', 'DIRECTOR'],
    desc: 'Cálculo de MTTR, bitácora filtrable y exportación selectiva.'
  },
  {
    id: 'inventario',
    nombre: '5. Gestión de Inventario',
    shortLabel: 'Inventario & Lotes',
    roles: ['INVENTARIO', 'DIRECTOR'],
    desc: 'CRUD de insumos y evaluación manual de lotes afectados con 2FA.'
  },
  {
    id: 'iam',
    nombre: '6. Gestión IAM (Permisos)',
    shortLabel: 'Gestión IAM',
    roles: ['DIRECTOR'],
    desc: 'Panel exclusivo del Director para crear usuarios y gestionar su estado.'
  }
]

export const getRole = (usuario) => (usuario?.rol || '').toString().trim().toUpperCase()

export const tieneRol = (usuario, roles) => roles.includes(getRole(usuario))

export const getAccessibleModules = (rol) => {
  const normalized = (rol || '').toString().trim().toUpperCase()
  const accesibles = MODULOS.filter(m => m.roles.map(r => r.toUpperCase()).includes(normalized))
  return accesibles.length > 0 ? accesibles : MODULOS.filter(m => m.roles.includes('TECNICO'))
}
