import axios from 'axios'

const BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'https://ams-dashboard-twu7.onrender.com'

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

// Ping backend every 4 mins to prevent Render free tier sleep (sleeps after 15 mins)
const BACKEND = 'https://ams-dashboard-twu7.onrender.com'
fetch(BACKEND + '/').catch(() => {}) // immediate ping on page load
setInterval(() => {
  fetch(BACKEND + '/').catch(() => {})
}, 240000)
