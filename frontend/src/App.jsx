import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import Layout from './components/layout/Layout'
import EmployeeLayout from './components/layout/EmployeeLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Clients from './pages/Clients'
import Schools from './pages/Schools'
import Visits from './pages/Visits'
import AMCReports from './pages/AMCReports'
import Stock from './pages/Stock'
import Billing from './pages/Billing'
import Salary from './pages/Salary'
import Attendance from './pages/Attendance'
import Tasks from './pages/Tasks'
import Travel from './pages/Travel'
import EmployeeDashboard from './pages/employee/EmployeeDashboard'
import MyAttendance from './pages/employee/MyAttendance'
import MySalary from './pages/employee/MySalary'
import MyTasks from './pages/employee/MyTasks'
import PurchasedStock from './pages/employee/PurchasedStock'
import MyTravel from './pages/employee/MyTravel'
import MyVisits from './pages/employee/MyVisits'
import MyStock from './pages/employee/MyStock'
import ProofReview from './pages/ProofReview'
import Reports from './pages/Reports'
import UnitPage from './pages/UnitPage'
import DeskworkLayout from './components/layout/DeskworkLayout'
import DeskHome from './pages/deskwork/DeskHome'
import DeskTasks from './pages/deskwork/DeskTasks'
import DeskAttendance from './pages/deskwork/DeskAttendance'
import DeskStock from './pages/deskwork/DeskStock'
import DeskTravel from './pages/deskwork/DeskTravel'
import ServiceReports from './pages/ServiceReports'
import LiveTracking from './pages/LiveTracking'

function Guard({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

function RedirectByRole() {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'deskwork') return <Navigate to="/deskwork" replace />
  if (user?.role === 'technician') return <Navigate to="/employee" replace />
  return <Navigate to="/" replace />
}

function AdminGuard({ children }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/employee" replace />
  return children
}

function DeskworkGuard({ children }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'deskwork' && user?.role !== 'admin') return <Navigate to="/login" replace />
  return children
}

function EmployeeGuard({ children }) {
  const { user, token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'deskwork') return <Navigate to="/deskwork" replace />
  return children
}

export default function App() {
  const { theme } = useThemeStore()
  useEffect(() => {
    document.body.classList.toggle('light-theme', theme === 'light')
  }, [theme])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* EMPLOYEE ROUTES */}
      <Route path="/employee" element={<EmployeeGuard><EmployeeLayout /></EmployeeGuard>}>
        <Route index element={<EmployeeDashboard />} />
        <Route path="tasks"      element={<MyTasks />} />
        <Route path="visits"     element={<MyVisits />} />
        <Route path="travel"     element={<MyTravel />} />
        <Route path="purchases"  element={<PurchasedStock />} />
        <Route path="salary"     element={<MySalary />} />
        <Route path="attendance" element={<MyAttendance />} />
        <Route path="my-stock"   element={<MyStock />} />
      </Route>

      {/* DESKWORK ROUTES */}
      <Route path="/deskwork" element={<DeskworkGuard><DeskworkLayout /></DeskworkGuard>}>
        <Route index element={<DeskHome />} />
        <Route path="tasks"      element={<DeskTasks />} />
        <Route path="attendance" element={<DeskAttendance />} />
        <Route path="stock"      element={<DeskStock />} />
        <Route path="travel"          element={<DeskTravel />} />
        <Route path="service-reports" element={<ServiceReports />} />
        <Route path="live-tracking"   element={<LiveTracking />} />
        <Route path="schools"         element={<Schools />} />
        <Route path="clients"         element={<Clients />} />
        <Route path="unit/:unit"      element={<UnitPage />} />
      </Route>

      {/* ADMIN ROUTES */}
      <Route path="/" element={<AdminGuard><Layout /></AdminGuard>}>
        <Route index element={<Dashboard />} />
        <Route path="employees"    element={<Employees />} />
        <Route path="clients"      element={<Clients />} />
        <Route path="schools"      element={<Schools />} />
        <Route path="visits"       element={<Visits />} />
        <Route path="amc-reports"  element={<AMCReports />} />
        <Route path="stock"        element={<Stock />} />
        <Route path="billing"      element={<Billing />} />
        <Route path="salary"       element={<Salary />} />
        <Route path="attendance"   element={<Attendance />} />
        <Route path="tasks"        element={<Tasks />} />
        <Route path="travel"       element={<Travel />} />
        <Route path="proof-review"     element={<ProofReview />} />
        <Route path="reports"          element={<Reports />} />
        <Route path="service-reports"  element={<ServiceReports />} />
        <Route path="live-tracking"    element={<LiveTracking />} />
        <Route path="unit/:unit"   element={<UnitPage />} />
      </Route>

      <Route path="*" element={<RedirectByRole />} />
    </Routes>
  )
}
