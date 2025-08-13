import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './components/ThemeProvider';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Themes from './pages/Themes';
import Plugins from './pages/Plugins';
import AdminDashboard from './pages/AdminDashboard';
import ABTesting from './pages/ABTesting';
import './App.css';

function AppContent() {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="App">
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar />
      <Routes>
        <Route 
          path="/" 
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Landing />} 
        />
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={login} />} 
        />
        <Route 
          path="/register" 
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={login} />} 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/themes" 
          element={
            <ProtectedRoute>
              <Themes />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/plugins" 
          element={
            <ProtectedRoute>
              <Plugins />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute requiredPermissions={['admin:dashboard']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/ab-testing" 
          element={
            <ProtectedRoute requiredPermissions={['admin:ab_testing']}>
              <ABTesting />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <div className="page-placeholder">
                <h2>Settings Page</h2>
                <p>Application settings coming soon...</p>
              </div>
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;