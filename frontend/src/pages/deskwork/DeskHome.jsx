import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

export default function DeskHome() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [employees, setEmployees] = useState([])
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    Promise.all([
      api.get('/api/employees/'),
      api.get('/api/tasks/', { params: { task_date: today } }),
      api.get('/api/stock/'),
    ]).then(([e, t, s]) => {
      const emps = e.data.filter(emp => emp.role === 'technician')
      const tasks = t.data
      const lowStock = (s.data || []).filter(item => (item.quantity || 0) <= (item.min_quantity || 5))
      setEmployees(emps)
      setStats({
        technicians: emps.length,
        todayTasks: tasks.length,
        completedToday: tasks.filter(t => t.status === 'completed').length,
        pendingToday: tasks.filter(t => t.status === 'pending').length,
        lowStock: lowStock.length,
      })
    })
  }, [])

  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent2)' }}>Good day, {user?.name?.split(' ')[0]}! 👋</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{todayLabel}</div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            ['👷 Technicians', stats.technicians, 'var(--accent)'],
            ['📋 Tasks Today', stats.todayTasks, 'var(--yellow)'],
            ['✅ Completed', stats.completedToday, 'var(--green)'],
            ['⏳ Pending', stats.pendingToday, 'var(--yellow)'],
            ['⚠️ Low Stock', stats.lowStock, stats.lowStock > 0 ? 'var(--red)' : 'var(--green)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${color}22`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Today's employee task status */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
        Today's Employee Status
      </div>
      <TodayTaskStatus employees={employees} today={today} />
    </div>
  )
}

function TodayTaskStatus({ employees, today }) {
  const [taskMap, setTaskMap] = useState({})
  useEffect(() => {
    if (!employees.length) return
    Promise.all(employees.map(e => api.get('/api/tasks/', { params: { employee_id: e.id, task_date: today } })
      .then(r => ({ id: e.id, tasks: r.data }))
      .catch(() => ({ id: e.id, tasks: [] }))
    )).then(results => {
      const map = {}
      results.forEach(r => { map[r.id] = r.tasks })
      setTaskMap(map)
    })
  }, [employees, today])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
      {employees.map(emp => {
        const tasks = taskMap[emp.id] || []
        const done = tasks.filter(t => t.status === 'completed').length
        const total = tasks.length
        const pct = total > 0 ? Math.round(done / total * 100) : 0
        return (
          <div key={emp.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.name} <span style={{ fontSize: 10, color: 'var(--muted)' }}>[{emp.employee_code}]</span></div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{emp.mandal_name || 'No mandal'}</div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : pct > 0 ? 'var(--yellow)' : 'var(--border)', borderRadius: 3, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {total === 0 ? 'No tasks assigned' : `${done}/${total} tasks done (${pct}%)`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
