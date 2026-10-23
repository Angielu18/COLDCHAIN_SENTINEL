import { ref } from 'vue'
import { api } from '../services/api'

export function useLogin(emit) {
  const cargando = ref(false)
  const errorMsg = ref('')
  const formLogin = ref({ email: '', password: '' })

  const ejecutarLogin = async () => {
    errorMsg.value = ''
    cargando.value = true
    try {
      const data = await api.post('/api/auth/login', formLogin.value, { auth: false })
      localStorage.setItem('coldchain_token', data.token)
      localStorage.setItem('coldchain_user', JSON.stringify(data.usuario))
      emit('login-exitoso', data.usuario)
    } catch (err) {
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.name === 'TypeError')) {
        errorMsg.value = 'No se pudo conectar con el servidor backend (puerto 3000). Asegúrese de iniciar el servidor con: npm run server'
      } else {
        errorMsg.value = err.message
      }
    } finally {
      cargando.value = false
    }
  }

  return { cargando, errorMsg, formLogin, ejecutarLogin }
}
