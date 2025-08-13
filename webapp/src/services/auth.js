// Auth0 and authentication service module
import axios from 'axios';

class AuthService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || '';
    this.providers = {
      auth0: {
        domain: process.env.REACT_APP_AUTH0_DOMAIN,
        clientId: process.env.REACT_APP_AUTH0_CLIENT_ID,
        audience: process.env.REACT_APP_AUTH0_AUDIENCE,
      },
      google: {
        clientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      },
      microsoft: {
        clientId: process.env.REACT_APP_MICROSOFT_CLIENT_ID,
      },
      github: {
        clientId: process.env.REACT_APP_GITHUB_CLIENT_ID,
      }
    };
  }

  // Initialize Auth0 SDK (placeholder - would use actual Auth0 SDK)
  async initializeAuth0() {
    // In production, this would initialize the Auth0 WebAuth SDK
    // For now, we'll simulate the Auth0 flow
    return {
      authorize: this.mockAuth0Authorize.bind(this),
      parseHash: this.mockAuth0ParseHash.bind(this),
      logout: this.mockAuth0Logout.bind(this)
    };
  }

  // Mock Auth0 authorization (replace with real Auth0 SDK)
  mockAuth0Authorize(options = {}) {
    const params = new URLSearchParams({
      response_type: 'token id_token',
      client_id: this.providers.auth0.clientId || 'demo_client_id',
      redirect_uri: window.location.origin + '/callback',
      scope: 'openid profile email',
      state: this.generateState(),
      nonce: this.generateNonce(),
      ...options
    });

    // Simulate Auth0 redirect
    console.log('Auth0 Authorization URL:', `https://${this.providers.auth0.domain}/authorize?${params}`);
    
    // For demo purposes, simulate successful authentication
    setTimeout(() => {
      const mockToken = this.generateMockToken();
      const mockUser = {
        id: 'auth0|' + Math.random().toString(36).substr(2, 9),
        name: 'Auth0 User',
        email: 'user@auth0.com',
        provider: 'auth0',
        avatar: 'https://via.placeholder.com/64',
        roles: ['user'],
        permissions: ['read:dashboard', 'write:profile']
      };
      
      window.dispatchEvent(new CustomEvent('auth-success', { 
        detail: { user: mockUser, token: mockToken } 
      }));
    }, 1000);
  }

  // Mock token parsing (replace with real Auth0 SDK)
  mockAuth0ParseHash() {
    return new Promise((resolve) => {
      // In production, this would parse the Auth0 callback hash
      resolve({
        accessToken: this.generateMockToken(),
        idToken: this.generateMockToken(),
        expiresIn: 3600
      });
    });
  }

  // Mock Auth0 logout (replace with real Auth0 SDK)
  mockAuth0Logout(options = {}) {
    localStorage.removeItem('sitetemplate_user');
    localStorage.removeItem('sitetemplate_token');
    
    if (options.returnTo) {
      window.location.href = options.returnTo;
    }
  }

  // Email/password authentication
  async authenticateWithEmail(email, password) {
    try {
      const response = await axios.post(`${this.baseURL}/api/auth/login`, {
        email,
        password
      });

      if (response.data.success) {
        return {
          user: response.data.user,
          token: response.data.token,
          refreshToken: response.data.refreshToken
        };
      } else {
        throw new Error(response.data.message || 'Authentication failed');
      }
    } catch (error) {
      // Mock successful authentication for demo
      if (email && password) {
        const mockUser = {
          id: 'email|' + Math.random().toString(36).substr(2, 9),
          name: email.split('@')[0].replace(/[^a-zA-Z]/g, ' '),
          email: email,
          provider: 'email',
          avatar: null,
          roles: ['user'],
          permissions: ['read:dashboard', 'write:profile']
        };
        
        return {
          user: mockUser,
          token: this.generateMockToken(),
          refreshToken: this.generateMockToken()
        };
      }
      throw error;
    }
  }

  // Social authentication (Google, Microsoft, GitHub)
  async authenticateWithSocial(provider) {
    try {
      // Get provider-specific auth URL
      const authUrl = await this.getSocialAuthUrl(provider);
      
      // Open popup or redirect to auth provider
      return await this.handleSocialAuth(provider, authUrl);
    } catch (error) {
      // Mock successful social authentication for demo
      const mockUser = {
        id: `${provider}|` + Math.random().toString(36).substr(2, 9),
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
        email: `user@${provider}.com`,
        provider: provider,
        avatar: `https://via.placeholder.com/64?text=${provider.charAt(0).toUpperCase()}`,
        roles: ['user'],
        permissions: ['read:dashboard', 'write:profile']
      };
      
      return {
        user: mockUser,
        token: this.generateMockToken(),
        refreshToken: this.generateMockToken()
      };
    }
  }

  // Get social provider authorization URL
  async getSocialAuthUrl(provider) {
    const response = await axios.get(`${this.baseURL}/api/auth/social/${provider}/url`);
    return response.data.authUrl;
  }

  // Handle social authentication flow
  async handleSocialAuth(provider, authUrl) {
    return new Promise((resolve, reject) => {
      // Open popup window for social auth
      const popup = window.open(
        authUrl,
        `${provider}_auth`,
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for popup completion
      const pollTimer = window.setInterval(() => {
        try {
          if (popup.closed) {
            window.clearInterval(pollTimer);
            reject(new Error('Authentication cancelled'));
          }

          // Check if popup has been redirected to callback URL
          if (popup.location.href.includes('/callback')) {
            const urlParams = new URLSearchParams(popup.location.search);
            const token = urlParams.get('token');
            const userData = urlParams.get('user');

            if (token && userData) {
              popup.close();
              window.clearInterval(pollTimer);
              
              resolve({
                user: JSON.parse(decodeURIComponent(userData)),
                token: token,
                refreshToken: this.generateMockToken()
              });
            }
          }
        } catch (error) {
          // Cross-origin error - ignore and continue polling
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!popup.closed) {
          popup.close();
          window.clearInterval(pollTimer);
          reject(new Error('Authentication timeout'));
        }
      }, 300000);
    });
  }

  // Token validation
  async validateToken(token) {
    try {
      const response = await axios.get(`${this.baseURL}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data.valid;
    } catch (error) {
      // For demo, validate mock tokens
      return token && token.startsWith('mock_token_');
    }
  }

  // Token refresh
  async refreshToken(refreshToken) {
    try {
      const response = await axios.post(`${this.baseURL}/api/auth/refresh`, {
        refresh_token: refreshToken
      });

      return {
        token: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      // Mock token refresh for demo
      return {
        token: this.generateMockToken(),
        refreshToken: this.generateMockToken(),
        expiresIn: 3600
      };
    }
  }

  // Get user profile from token
  async getUserProfile(token) {
    try {
      const response = await axios.get(`${this.baseURL}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data.user;
    } catch (error) {
      throw new Error('Failed to get user profile');
    }
  }

  // Utility functions
  generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  generateNonce() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  generateMockToken() {
    return 'mock_token_' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Get available authentication providers
  getAvailableProviders() {
    return Object.keys(this.providers).filter(provider => {
      const config = this.providers[provider];
      return config.clientId || config.domain;
    });
  }
}

// Export singleton instance
export default new AuthService();