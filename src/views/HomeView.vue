<script setup>
import '../assets/home.css'
import HomeSidebar from '../components/home/HomeSidebar.vue'
import DashboardPanel from '../components/home/DashboardPanel.vue'
import SimulatorPanel from '../components/home/SimulatorPanel.vue'
import AlertsPanel from '../components/home/AlertsPanel.vue'
import HistoryPanel from '../components/home/HistoryPanel.vue'
import AuditPanel from '../components/home/AuditPanel.vue'
import InventoryPanel from '../components/home/InventoryPanel.vue'
import IamPanel from '../components/home/IamPanel.vue'
import CloseIncidentModal from '../components/home/modals/CloseIncidentModal.vue'
import TwoFactorModal from '../components/home/modals/TwoFactorModal.vue'
import NewMedicineModal from '../components/home/modals/NewMedicineModal.vue'
import NewBatchModal from '../components/home/modals/NewBatchModal.vue'
import NewUserModal from '../components/home/modals/NewUserModal.vue'
import { useHome } from '../composables/useHome'
import { useHomeActions } from '../composables/useHomeActions'

const {
  usuarioActivo,
  sensores,
  lotes,
  lotesAfectados,
  metricas,
  usuariosIAM,
  conectado,
  modulosAccesibles,
  tabActiva,
  irAModulo,
  incidentesNormalizados,
  incidentesActivos,
  lotesPendientes,
  usuariosSuspendidos,
  resumenModulos
} = useHome()

const {
  modalCerrar,
  modal2FA,
  modalNuevoMedicamento,
  modalNuevoLote,
  modalNuevoUsuario,
  inyectarFallo,
  enviarTelemetriaManual,
  darAcuse,
  abrirModalCerrar,
  confirmarCierreIncidente,
  abrirModal2FA,
  confirmarEvaluacion2FA,
  guardarNuevoMedicamento,
  guardarNuevoLote,
  cambiarEstadoUsuario,
  abrirModalNuevoUsuario,
  guardarNuevoUsuario
} = useHomeActions()
</script>

<template>
  <div class="workspace-layout">
    <HomeSidebar
      :modulos="modulosAccesibles"
      :active="tabActiva"
      :alert-count="incidentesActivos.length"
      :batch-count="lotesPendientes.length"
      :user-count="usuariosSuspendidos.length"
      :connected="conectado"
      @select="irAModulo"
    />

    <div class="workspace-content">
      <DashboardPanel
        v-if="tabActiva === 'inicio'"
        :sensores="sensores"
        :metricas="metricas"
        :incidentes-activos="incidentesActivos"
        :lotes-pendientes="lotesPendientes"
        :usuarios-suspendidos="usuariosSuspendidos"
        :usuario="usuarioActivo"
        :resumen-modulos="resumenModulos"
        @select="irAModulo"
      />

      <SimulatorPanel
        v-if="tabActiva === 'simulador'"
        :sensores="sensores"
        @inject="inyectarFallo"
        @manual="enviarTelemetriaManual"
      />

      <AlertsPanel
        v-if="tabActiva === 'alertas'"
        :incidentes="incidentesActivos"
        @ack="darAcuse"
        @close="abrirModalCerrar"
        @history="irAModulo('historial')"
      />

      <HistoryPanel
        v-if="tabActiva === 'historial'"
        :incidentes="incidentesNormalizados"
      />

      <AuditPanel
        v-if="tabActiva === 'auditoria'"
        :sensores="sensores"
        :incidentes="incidentesNormalizados"
        :metricas="metricas"
        :lotes-afectados="lotesAfectados"
        :usuario="usuarioActivo"
      />

      <InventoryPanel
        v-if="tabActiva === 'inventario'"
        :lotes-afectados="lotesAfectados"
        :lotes="lotes"
        @new-medicine="modalNuevoMedicamento.visible = true"
        @new-batch="modalNuevoLote.visible = true"
        @evaluate="abrirModal2FA"
      />

      <IamPanel
        v-if="tabActiva === 'iam'"
        :usuarios="usuariosIAM"
        :usuarios-suspendidos="usuariosSuspendidos"
        :usuario-activo="usuarioActivo"
        @toggle-status="cambiarEstadoUsuario"
        @new-user="abrirModalNuevoUsuario"
      />
    </div>

    <CloseIncidentModal v-model="modalCerrar" @confirm="confirmarCierreIncidente" />
    <TwoFactorModal v-model="modal2FA" @confirm="confirmarEvaluacion2FA" />
    <NewMedicineModal v-model="modalNuevoMedicamento" :sensores="sensores" @confirm="guardarNuevoMedicamento" />
    <NewBatchModal v-model="modalNuevoLote" :sensores="sensores" @confirm="guardarNuevoLote" />
    <NewUserModal v-model="modalNuevoUsuario" @confirm="guardarNuevoUsuario" />
  </div>
</template>
