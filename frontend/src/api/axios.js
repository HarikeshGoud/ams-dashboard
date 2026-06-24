import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

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
