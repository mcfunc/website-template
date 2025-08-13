import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check for stored authentication on app load
    const checkAuth = async () => {
      try {
        const storedUser = localStorage.getItem('sitetemplate_user');
        const storedToken = localStorage.getItem('sitetemplate_token');
        
        if (storedUser && storedToken) {
          // Validate token with backend
          const response = await fetch('/api/auth/validate', {
            headers: {
              'Authorization': `Bearer ${storedToken}`
            }
          });
          
          if (response.ok) {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            setIsAuthenticated(true);
          } else {
            // Invalid token, clear storage
            localStorage.removeItem('sitetemplate_user');
            localStorage.removeItem('sitetemplate_token');
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Clear potentially corrupted data
        localStorage.removeItem('sitetemplate_user');
        localStorage.removeItem('sitetemplate_token');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (userData, token) => {
    try {
      // Store user data and token
      localStorage.setItem('sitetemplate_user', JSON.stringify(userData));
      localStorage.setItem('sitetemplate_token', token || 'mock_token');
      
      setUser(userData);
      setIsAuthenticated(true);
      
      // Log authentication event
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || 'mock_token'}`
        },
        body: JSON.stringify({
          event_type: 'auth',
          action: 'login',
          details: {
            user_id: userData.id,
            provider: userData.provider || 'email',
            ip_address: 'auto-detected',
            user_agent: navigator.userAgent
          }
        })
      });
      
      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('sitetemplate_token');
      
      // Log logout event
      if (user && token) {
        await fetch('/api/audit/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            event_type: 'auth',
            action: 'logout',
            details: {
              user_id: user.id,
              ip_address: 'auto-detected',
              user_agent: navigator.userAgent
            }
          })
        });
      }
      
      // Clear local storage
      localStorage.removeItem('sitetemplate_user');
      localStorage.removeItem('sitetemplate_token');
      
      // Reset state
      setUser(null);
      setIsAuthenticated(false);
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if logging fails
      localStorage.removeItem('sitetemplate_user');
      localStorage.removeItem('sitetemplate_token');
      setUser(null);
      setIsAuthenticated(false);
      return { success: false, error: error.message };
    }
  };

  const updateUser = (updatedUserData) => {
    const newUserData = { ...user, ...updatedUserData };
    localStorage.setItem('sitetemplate_user', JSON.stringify(newUserData));
    setUser(newUserData);
  };

  const updateUserProfile = (profileData) => {
    const newUserData = { ...user, ...profileData };
    localStorage.setItem('sitetemplate_user', JSON.stringify(newUserData));
    setUser(newUserData);
  };

  const hasRole = (role) => {
    return user?.roles?.includes(role) || user?.role === role;
  };

  const hasPermission = (permission) => {
    return user?.permissions?.includes(permission) || hasRole('admin');
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    updateUser,
    updateUserProfile,
    hasRole,
    hasPermission
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};