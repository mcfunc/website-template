import React, { useState, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import './Themes.css';

const Themes = () => {
  const { 
    currentTheme, 
    switchTheme, 
    isFeatureEnabled, 
    loading: themeLoading 
  } = useTheme();

  const [themes, setThemes] = useState([]);
  const [brandProfiles, setBrandProfiles] = useState([]);
  const [selectedBrandProfile, setSelectedBrandProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadThemes(), loadBrandProfiles()]);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadThemes = async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/theming/themes', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load themes');
    }

    const themesData = await response.json();
    setThemes(themesData);
  };

  const loadBrandProfiles = async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Not authenticated');

    const response = await fetch('/api/theming/brand-profiles', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load brand profiles');
    }

    const profilesData = await response.json();
    setBrandProfiles(profilesData);
  };

  const handleSwitchTheme = async (themeName) => {
    try {
      setSwitching(themeName);
      const result = await switchTheme(themeName);
      
      if (!result.success) {
        setError(result.error);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setSwitching(null);
    }
  };

  const getThemeDisplayColor = (theme) => {
    try {
      const cssVars = theme.css_variables || {};
      return cssVars['--brand-primary'] || '#007bff';
    } catch {
      return '#007bff';
    }
  };

  const getCurrentThemeName = () => {
    if (!currentTheme?.theme?.name) return null;
    return currentTheme.theme.name;
  };

  if (loading || themeLoading) {
    return (
      <div className="themes-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading themes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="themes-page">
      <div className="themes-header">
        <h1>Themes</h1>
        <p>Customize your application's appearance with different themes and brand profiles.</p>
        
        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
      </div>

      {/* Feature Flag Notices */}
      <div className="feature-notices">
        {!isFeatureEnabled('enable_dark_mode') && (
          <div className="feature-notice">
            <span>💡</span>
            Dark mode is currently disabled. Contact your administrator to enable it.
          </div>
        )}
        
        {isFeatureEnabled('enable_custom_themes') && (
          <div className="feature-notice feature-enabled">
            <span>🎨</span>
            Custom theme creation is available! You can create your own themes.
          </div>
        )}
        
        {isFeatureEnabled('enable_theme_preview') && (
          <div className="feature-notice feature-enabled">
            <span>👁️</span>
            Live theme preview is enabled for instant theme switching.
          </div>
        )}
      </div>

      {/* Brand Profiles Section */}
      {brandProfiles.length > 0 && (
        <div className="brand-profiles-section">
          <h2>Brand Profiles</h2>
          <div className="brand-profiles-grid">
            {brandProfiles.map(profile => (
              <div 
                key={profile.id}
                className={`brand-profile-card ${selectedBrandProfile === profile.id ? 'selected' : ''}`}
                onClick={() => setSelectedBrandProfile(profile.id)}
              >
                <div 
                  className="brand-profile-preview"
                  style={{
                    background: `linear-gradient(135deg, ${profile.primary_color}, ${profile.secondary_color})`
                  }}
                >
                  {profile.logo_url && (
                    <img src={profile.logo_url} alt={profile.display_name} />
                  )}
                </div>
                <div className="brand-profile-info">
                  <h3>{profile.display_name}</h3>
                  <p>{profile.description}</p>
                  <div className="brand-profile-colors">
                    <div 
                      className="color-dot" 
                      style={{ backgroundColor: profile.primary_color }}
                      title="Primary"
                    ></div>
                    <div 
                      className="color-dot" 
                      style={{ backgroundColor: profile.secondary_color }}
                      title="Secondary"
                    ></div>
                    <div 
                      className="color-dot" 
                      style={{ backgroundColor: profile.accent_color }}
                      title="Accent"
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Themes Section */}
      <div className="themes-section">
        <h2>Available Themes</h2>
        <div className="themes-grid">
          {themes.map(theme => (
            <div 
              key={theme.id}
              className={`theme-card ${getCurrentThemeName() === theme.name ? 'active' : ''}`}
            >
              <div 
                className="theme-preview"
                style={{
                  backgroundColor: getThemeDisplayColor(theme)
                }}
              >
                <div className="theme-preview-content">
                  <div className="preview-header" style={{
                    backgroundColor: theme.theme_type === 'dark' ? '#1a1a1a' : '#ffffff',
                    color: theme.theme_type === 'dark' ? '#ffffff' : '#000000'
                  }}>
                    Header
                  </div>
                  <div className="preview-body" style={{
                    backgroundColor: theme.theme_type === 'dark' ? '#2a2a2a' : '#f8f9fa'
                  }}>
                    Content
                  </div>
                </div>
              </div>
              
              <div className="theme-info">
                <h3>{theme.display_name}</h3>
                <p>{theme.description}</p>
                
                <div className="theme-details">
                  <span className={`theme-type ${theme.theme_type}`}>
                    {theme.theme_type}
                  </span>
                  {theme.brand_profile_name && (
                    <span className="brand-profile-tag">
                      {theme.brand_profile_name}
                    </span>
                  )}
                </div>

                <div className="theme-actions">
                  {getCurrentThemeName() === theme.name ? (
                    <span className="current-theme-indicator">
                      ✓ Current Theme
                    </span>
                  ) : (
                    <button
                      className="switch-theme-btn"
                      onClick={() => handleSwitchTheme(theme.name)}
                      disabled={switching === theme.name}
                    >
                      {switching === theme.name ? 'Switching...' : 'Apply Theme'}
                    </button>
                  )}
                  
                  {isFeatureEnabled('enable_theme_preview') && getCurrentThemeName() !== theme.name && (
                    <button 
                      className="preview-theme-btn"
                      onClick={() => {/* TODO: Implement preview */}}
                    >
                      Preview
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Theme Info */}
      {currentTheme && (
        <div className="current-theme-section">
          <h2>Current Theme Configuration</h2>
          <div className="current-theme-details">
            <div className="theme-config-grid">
              <div className="config-item">
                <label>Theme Name:</label>
                <span>{currentTheme.theme?.display_name || 'Default'}</span>
              </div>
              <div className="config-item">
                <label>Theme Type:</label>
                <span>{currentTheme.effective_config?.theme_type || 'light'}</span>
              </div>
              <div className="config-item">
                <label>Brand Profile:</label>
                <span>{currentTheme.brand_profile?.display_name || 'Default'}</span>
              </div>
              <div className="config-item">
                <label>Font Family:</label>
                <span>{currentTheme.effective_config?.font_family || 'System Default'}</span>
              </div>
            </div>
            
            <div className="color-scheme">
              <h3>Color Scheme</h3>
              <div className="color-palette">
                <div className="color-item">
                  <div 
                    className="color-swatch"
                    style={{ backgroundColor: currentTheme.effective_config?.primary_color }}
                  ></div>
                  <span>Primary</span>
                </div>
                <div className="color-item">
                  <div 
                    className="color-swatch"
                    style={{ backgroundColor: currentTheme.effective_config?.secondary_color }}
                  ></div>
                  <span>Secondary</span>
                </div>
                <div className="color-item">
                  <div 
                    className="color-swatch"
                    style={{ backgroundColor: currentTheme.effective_config?.accent_color }}
                  ></div>
                  <span>Accent</span>
                </div>
                <div className="color-item">
                  <div 
                    className="color-swatch"
                    style={{ backgroundColor: currentTheme.effective_config?.background_color }}
                  ></div>
                  <span>Background</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Theme Creation (if enabled) */}
      {isFeatureEnabled('enable_custom_themes') && (
        <div className="custom-theme-section">
          <h2>Create Custom Theme</h2>
          <div className="custom-theme-actions">
            <button className="create-theme-btn">
              Create New Theme
            </button>
            <button className="import-theme-btn">
              Import Theme
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Themes;