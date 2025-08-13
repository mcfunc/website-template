import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(null);
  const [brandProfile, setBrandProfile] = useState('default');
  const [loading, setLoading] = useState(true);
  const [featureFlags, setFeatureFlags] = useState({});

  useEffect(() => {
    loadTheme();
    loadFeatureFlags();
  }, [brandProfile]);

  const loadTheme = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/theming/user/theme?brandProfile=${brandProfile}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const themeData = await response.json();
        setCurrentTheme(themeData);
        applyTheme(themeData);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFeatureFlags = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/plugins/features/user-flags', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const flags = await response.json();
        setFeatureFlags(flags);
      }
    } catch (error) {
      console.error('Failed to load feature flags:', error);
    }
  };

  const applyTheme = (themeData) => {
    if (!themeData || !themeData.effective_config) return;

    const { effective_config } = themeData;
    const root = document.documentElement;

    // Apply brand colors
    root.style.setProperty('--brand-primary', effective_config.primary_color);
    root.style.setProperty('--brand-secondary', effective_config.secondary_color);
    root.style.setProperty('--brand-accent', effective_config.accent_color);
    root.style.setProperty('--brand-background', effective_config.background_color);
    root.style.setProperty('--brand-text', effective_config.text_color);
    root.style.setProperty('--brand-font-family', effective_config.font_family);

    // Apply CSS variables
    if (effective_config.css_variables) {
      for (const [property, value] of Object.entries(effective_config.css_variables)) {
        root.style.setProperty(property, value);
      }
    }

    // Apply theme type class
    document.body.className = document.body.className
      .split(' ')
      .filter(cls => !cls.startsWith('theme-'))
      .concat(`theme-${effective_config.theme_type}`)
      .join(' ');
  };

  const switchTheme = async (themeName) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      setLoading(true);

      const response = await fetch('/api/theming/user/switch-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          themeName,
          brandProfile
        })
      });

      if (!response.ok) {
        throw new Error('Failed to switch theme');
      }

      const result = await response.json();
      setCurrentTheme(result.theme_config);
      applyTheme(result.theme_config);

      return { success: true };
    } catch (error) {
      console.error('Switch theme error:', error);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const updateThemePreference = async (themeId, customOverrides = {}) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/theming/user/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          themeId,
          customOverrides
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update theme preference');
      }

      await loadTheme(); // Reload theme after update
      return { success: true };
    } catch (error) {
      console.error('Update theme preference error:', error);
      return { success: false, error: error.message };
    }
  };

  const setBrandProfileName = (profileName) => {
    setBrandProfile(profileName);
  };

  const getFeatureFlag = (flagName) => {
    const flag = featureFlags[flagName];
    if (!flag) return { enabled: false, value: false };
    return flag;
  };

  const isFeatureEnabled = (flagName) => {
    const flag = getFeatureFlag(flagName);
    return flag.enabled && flag.value;
  };

  const generateThemeCSS = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/theming/generate-css', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          brandProfile
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate CSS');
      }

      const css = await response.text();
      return { success: true, css };
    } catch (error) {
      console.error('Generate theme CSS error:', error);
      return { success: false, error: error.message };
    }
  };

  const contextValue = {
    currentTheme,
    brandProfile,
    loading,
    featureFlags,
    
    // Theme methods
    switchTheme,
    updateThemePreference,
    setBrandProfileName,
    generateThemeCSS,
    
    // Feature flag methods
    getFeatureFlag,
    isFeatureEnabled,
    
    // Utility methods
    applyTheme,
    loadTheme,
    loadFeatureFlags
  };

  if (loading && !currentTheme) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}>
        Loading theme...
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;