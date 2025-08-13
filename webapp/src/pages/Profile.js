import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/Profile.css';

const Profile = () => {
  const { user, updateUserProfile } = useAuth();
  const [profile, setProfile] = useState({
    display_name: '',
    bio: '',
    location: '',
    website_url: '',
    timezone: 'UTC',
    language: 'en',
    theme: 'light'
  });

  const [notifications, setNotifications] = useState({
    email_notifications: true,
    push_notifications: true,
    sms_notifications: false,
    marketing_emails: true,
    security_alerts: true,
    product_updates: true,
    weekly_digest: true,
    activity_notifications: true,
    comment_notifications: true,
    mention_notifications: true,
    frequency: 'immediate',
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00'
  });

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);

  const loadUserProfile = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sitetemplate_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          setProfile(data.profile);
        }
        if (data.notification_preferences) {
          setNotifications(data.notification_preferences);
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sitetemplate_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profile)
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        setProfile(updatedProfile);
        setMessage('Profile updated successfully!');
        
        // Update auth context if display name changed
        if (updateUserProfile) {
          updateUserProfile({ name: profile.display_name });
        }
      } else {
        setMessage('Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/user/notifications', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sitetemplate_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notifications)
      });

      if (response.ok) {
        const updatedNotifications = await response.json();
        setNotifications(updatedNotifications);
        setMessage('Notification preferences updated successfully!');
      } else {
        setMessage('Failed to update notification preferences');
      }
    } catch (error) {
      console.error('Error updating notifications:', error);
      setMessage('Error updating notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNotificationChange = (e) => {
    const { name, type, checked, value } = e.target;
    setNotifications(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const timezones = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
    'Australia/Sydney', 'Pacific/Auckland'
  ];

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' }
  ];

  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <h1>Please log in to access your profile</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>User Profile</h1>
        <p>Manage your account settings and preferences</p>
      </div>

      <div className="profile-tabs">
        <button 
          className={activeTab === 'profile' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('profile')}
        >
          Profile Settings
        </button>
        <button 
          className={activeTab === 'notifications' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
      </div>

      {message && (
        <div className={`message ${message.includes('Error') || message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="profile-section">
          <h2>Profile Information</h2>
          <form onSubmit={handleProfileSubmit} className="profile-form">
            <div className="form-group">
              <label htmlFor="display_name">Display Name</label>
              <input
                type="text"
                id="display_name"
                name="display_name"
                value={profile.display_name}
                onChange={handleProfileChange}
                placeholder="Your display name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                value={profile.bio}
                onChange={handleProfileChange}
                placeholder="Tell us about yourself..."
                rows="4"
              />
            </div>

            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                name="location"
                value={profile.location}
                onChange={handleProfileChange}
                placeholder="Your location"
              />
            </div>

            <div className="form-group">
              <label htmlFor="website_url">Website</label>
              <input
                type="url"
                id="website_url"
                name="website_url"
                value={profile.website_url}
                onChange={handleProfileChange}
                placeholder="https://yourwebsite.com"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="timezone">Timezone</label>
                <select
                  id="timezone"
                  name="timezone"
                  value={profile.timezone}
                  onChange={handleProfileChange}
                >
                  {timezones.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="language">Language</label>
                <select
                  id="language"
                  name="language"
                  value={profile.language}
                  onChange={handleProfileChange}
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="theme">Theme</label>
              <select
                id="theme"
                name="theme"
                value={profile.theme}
                onChange={handleProfileChange}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto</option>
              </select>
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="profile-section">
          <h2>Notification Preferences</h2>
          <form onSubmit={handleNotificationSubmit} className="notifications-form">
            <div className="notification-section">
              <h3>Communication Preferences</h3>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="email_notifications"
                    checked={notifications.email_notifications}
                    onChange={handleNotificationChange}
                  />
                  Email notifications
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="push_notifications"
                    checked={notifications.push_notifications}
                    onChange={handleNotificationChange}
                  />
                  Push notifications
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="sms_notifications"
                    checked={notifications.sms_notifications}
                    onChange={handleNotificationChange}
                  />
                  SMS notifications
                </label>
              </div>
            </div>

            <div className="notification-section">
              <h3>Content Preferences</h3>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="marketing_emails"
                    checked={notifications.marketing_emails}
                    onChange={handleNotificationChange}
                  />
                  Marketing emails
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="security_alerts"
                    checked={notifications.security_alerts}
                    onChange={handleNotificationChange}
                  />
                  Security alerts
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="product_updates"
                    checked={notifications.product_updates}
                    onChange={handleNotificationChange}
                  />
                  Product updates
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="weekly_digest"
                    checked={notifications.weekly_digest}
                    onChange={handleNotificationChange}
                  />
                  Weekly digest
                </label>
              </div>
            </div>

            <div className="notification-section">
              <h3>Activity Notifications</h3>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="activity_notifications"
                    checked={notifications.activity_notifications}
                    onChange={handleNotificationChange}
                  />
                  Activity notifications
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="comment_notifications"
                    checked={notifications.comment_notifications}
                    onChange={handleNotificationChange}
                  />
                  Comment notifications
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="mention_notifications"
                    checked={notifications.mention_notifications}
                    onChange={handleNotificationChange}
                  />
                  Mention notifications
                </label>
              </div>
            </div>

            <div className="notification-section">
              <h3>Timing Preferences</h3>
              <div className="form-group">
                <label htmlFor="frequency">Notification Frequency</label>
                <select
                  id="frequency"
                  name="frequency"
                  value={notifications.frequency}
                  onChange={handleNotificationChange}
                >
                  <option value="immediate">Immediate</option>
                  <option value="daily">Daily digest</option>
                  <option value="weekly">Weekly digest</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="quiet_hours_start">Quiet hours start</label>
                  <input
                    type="time"
                    id="quiet_hours_start"
                    name="quiet_hours_start"
                    value={notifications.quiet_hours_start}
                    onChange={handleNotificationChange}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="quiet_hours_end">Quiet hours end</label>
                  <input
                    type="time"
                    id="quiet_hours_end"
                    name="quiet_hours_end"
                    value={notifications.quiet_hours_end}
                    onChange={handleNotificationChange}
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Updating...' : 'Update Notifications'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Profile;