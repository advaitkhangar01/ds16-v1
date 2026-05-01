// client/src/App.jsx
// Main router - protected routes with role-based redirects

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetail from './pages/ProjectDetail';
import AttendancePage from './pages/AttendancePage';
import VendorsPage from './pages/VendorsPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetail from './pages/admin/ClientDetail';
import InvoicePage from './pages/admin/InvoicePage';
import TasksPage from './pages/TasksPage';
import AccountingPage from './pages/admin/AccountingPage';
import SettingsPage from './pages/admin/SettingsPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/employee/dashboard" replace />;
  return children;
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'admin'
    ? <Navigate to="/admin/dashboard" replace />
    : <Navigate to="/employee/dashboard" replace />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RoleRouter />} />

      {/* Admin */}
      <Route path="/admin/dashboard" element={
        <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/invoice" element={
        <ProtectedRoute adminOnly><InvoicePage /></ProtectedRoute>
      } />
      <Route path="/admin/accounting" element={
        <ProtectedRoute adminOnly><AccountingPage /></ProtectedRoute>
      } />
      <Route path="/admin/settings" element={
        <ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>
      } />

      {/* Employee */}
      <Route path="/employee/dashboard" element={
        <ProtectedRoute><EmployeeDashboard /></ProtectedRoute>
      } />

      {/* Shared */}
      <Route path="/projects" element={
        <ProtectedRoute><ProjectsPage /></ProtectedRoute>
      } />
      <Route path="/projects/:id" element={
        <ProtectedRoute><ProjectDetail /></ProtectedRoute>
      } />
      <Route path="/attendance" element={
        <ProtectedRoute><AttendancePage /></ProtectedRoute>
      } />
      <Route path="/tasks" element={
        <ProtectedRoute><TasksPage /></ProtectedRoute>
      } />
      <Route path="/vendors" element={
        <ProtectedRoute><VendorsPage /></ProtectedRoute>
      } />
      <Route path="/clients" element={
        <ProtectedRoute><ClientsPage /></ProtectedRoute>
      } />
      <Route path="/clients/:id" element={
        <ProtectedRoute adminOnly><ClientDetail /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#FFFFFF',
              color: '#1A1A1A',
              border: '1px solid #E0E0E0',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#FFFFFF' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#FFFFFF' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
