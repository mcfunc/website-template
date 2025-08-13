import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ 
  children, 
  requiredRole = null, 
  requiredPermission = null,
  fallback = null 
}) => {
  const { isAuthenticated, user, loading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (requiredRole && !hasRole(requiredRole)) {
    return fallback || (
      <div className="access-denied">
        <div className="access-denied-content">
          <h2>Access Denied</h2>
          <p>You don't have the required role ({requiredRole}) to access this page.</p>
          <p>Current role: {user?.role || 'None'}</p>
        </div>
      </div>
    );
  }

  // Check permission-based access
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return fallback || (
      <div className="access-denied">
        <div className="access-denied-content">
          <h2>Access Denied</h2>
          <p>You don't have the required permission ({requiredPermission}) to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;