import axios from 'axios'

const BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'https://shc-dashboard-api.azurewebsites.net'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('ams_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ams_token')
      localStorage.removeItem('ams_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Backend runs on Azure App Service with "Always On" enabled — no keep-alive ping needed.
