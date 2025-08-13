import React, { useState, useEffect } from 'react';

const ThemeCustomizer = ({ 
  currentTheme = {}, 
  onThemeChange = () => {}, 
  brandProfile = {},
  userPermissions = []
}) => {
  const [themeConfig, setThemeConfig] = useState({
    primary_color: currentTheme.primary_color || '#007bff',
    secondary_color: currentTheme.secondary_color || '#6c757d',
    accent_color: currentTheme.accent_color || '#28a745',
    background_color: currentTheme.background_color || '#ffffff',
    text_color: currentTheme.text_color || '#212529',
    font_family: currentTheme.font_family || 'Inter, system-ui, sans-serif',
    theme_type: currentTheme.theme_type || 'light'
  });

  const [isOpen, setIsOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (previewMode) {
      applyThemePreview();
    } else {
      removeThemePreview();
    }
  }, [themeConfig, previewMode]);

  const handleColorChange = (property, value) => {
    setThemeConfig(prev => ({
      ...prev,
      [property]: value
    }));
  };

  const applyThemePreview = () => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', themeConfig.primary_color);
    root.style.setProperty('--brand-secondary', themeConfig.secondary_color);
    root.style.setProperty('--brand-accent', themeConfig.accent_color);
    root.style.setProperty('--brand-background', themeConfig.background_color);
    root.style.setProperty('--brand-text', themeConfig.text_color);
    root.style.setProperty('--brand-font-family', themeConfig.font_family);
  };

  const removeThemePreview = () => {
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-secondary');
    root.style.removeProperty('--brand-accent');
    root.style.removeProperty('--brand-background');
    root.style.removeProperty('--brand-text');
    root.style.removeProperty('--brand-font-family');
  };

  const saveTheme = () => {
    onThemeChange(themeConfig);
    setPreviewMode(false);
    setIsOpen(false);
  };

  const resetTheme = () => {
    setThemeConfig({
      primary_color: brandProfile.primary_color || '#007bff',
      secondary_color: brandProfile.secondary_color || '#6c757d',
      accent_color: brandProfile.accent_color || '#28a745',
      background_color: brandProfile.background_color || '#ffffff',
      text_color: brandProfile.text_color || '#212529',
      font_family: brandProfile.font_family || 'Inter, system-ui, sans-serif',
      theme_type: 'light'
    });
  };

  if (!userPermissions.includes('admin:themes')) {
    return null;
  }

  return (
    <div className="theme-customizer">
      <button 
        className="theme-customizer-toggle"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          background: 'var(--brand-primary, #007bff)',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          fontSize: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}
      >
        🎨
      </button>

      {isOpen && (
        <div 
          className="theme-customizer-panel"
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '90px',
            width: '320px',
            background: 'var(--brand-background, white)',
            border: '1px solid var(--border, #dee2e6)',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 1001,
            maxHeight: '70vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Theme Customizer</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => setPreviewMode(!previewMode)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border, #dee2e6)',
                  borderRadius: '4px',
                  background: previewMode ? 'var(--brand-primary, #007bff)' : 'transparent',
                  color: previewMode ? 'white' : 'var(--brand-text, #212529)',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                {previewMode ? 'Exit Preview' : 'Preview'}
              </button>
              <button
                onClick={resetTheme}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border, #dee2e6)',
                  borderRadius: '4px',
                  background: 'transparent',
                  color: 'var(--brand-text, #212529)',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ColorInput
              label="Primary Color"
              value={themeConfig.primary_color}
              onChange={(value) => handleColorChange('primary_color', value)}
            />
            <ColorInput
              label="Secondary Color"
              value={themeConfig.secondary_color}
              onChange={(value) => handleColorChange('secondary_color', value)}
            />
            <ColorInput
              label="Accent Color"
              value={themeConfig.accent_color}
              onChange={(value) => handleColorChange('accent_color', value)}
            />
            <ColorInput
              label="Background Color"
              value={themeConfig.background_color}
              onChange={(value) => handleColorChange('background_color', value)}
            />
            <ColorInput
              label="Text Color"
              value={themeConfig.text_color}
              onChange={(value) => handleColorChange('text_color', value)}
            />
            
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                Font Family
              </label>
              <select
                value={themeConfig.font_family}
                onChange={(e) => handleColorChange('font_family', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--border, #dee2e6)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="Inter, system-ui, sans-serif">Inter</option>
                <option value="system-ui, sans-serif">System UI</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Courier New', monospace">Courier New</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                Theme Type
              </label>
              <select
                value={themeConfig.theme_type}
                onChange={(e) => handleColorChange('theme_type', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--border, #dee2e6)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            <button
              onClick={saveTheme}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--brand-primary, #007bff)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Save Theme
            </button>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                color: 'var(--brand-text, #212529)',
                border: '1px solid var(--border, #dee2e6)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ColorInput = ({ label, value, onChange }) => (
  <div>
    <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
      {label}
    </label>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '40px',
          height: '32px',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          padding: '6px 8px',
          border: '1px solid var(--border, #dee2e6)',
          borderRadius: '4px',
          fontSize: '14px'
        }}
      />
    </div>
  </div>
);

export default ThemeCustomizer;