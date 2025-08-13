import React, { useState, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import './ABTesting.css';

const ABTesting = () => {
  const { isFeatureEnabled } = useTheme();
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('tests');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!isFeatureEnabled('enable_ab_testing')) {
      setError('A/B testing is not enabled');
      setLoading(false);
      return;
    }

    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/admin/ab-tests', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load A/B tests');
      }

      const data = await response.json();
      setTests(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTestResults = async (testName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/ab-tests/${testName}/results`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load test results');
      }

      const data = await response.json();
      setTestResults(data);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleTestSelect = (test) => {
    setSelectedTest(test);
    setActiveTab('results');
    loadTestResults(test.name);
  };

  const getStatusColor = (status) => {
    const colors = {
      active: '#28a745',
      draft: '#ffc107',
      paused: '#fd7e14',
      completed: '#6c757d',
      archived: '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  const calculateLift = (controlRate, variantRate) => {
    if (!controlRate || controlRate === 0) return 0;
    return ((variantRate - controlRate) / controlRate * 100).toFixed(2);
  };

  if (loading) {
    return (
      <div className="ab-testing-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading A/B tests...</p>
        </div>
      </div>
    );
  }

  if (error && !isFeatureEnabled('enable_ab_testing')) {
    return (
      <div className="ab-testing-page">
        <div className="feature-disabled">
          <h2>A/B Testing Disabled</h2>
          <p>A/B testing is not enabled. Please enable the "enable_ab_testing" feature flag.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ab-testing-page">
      <div className="page-header">
        <h1>A/B Testing</h1>
        <div className="header-actions">
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateForm(true)}
          >
            + New Test
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'tests' ? 'active' : ''}`}
            onClick={() => setActiveTab('tests')}
          >
            <span>🧪</span>
            Tests
          </button>
          <button 
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!selectedTest}
          >
            <span>📊</span>
            Results
          </button>
          <button 
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <span>📈</span>
            Analytics
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'tests' && (
          <TestsTab 
            tests={tests} 
            onTestSelect={handleTestSelect}
            onRefresh={loadTests}
          />
        )}
        
        {activeTab === 'results' && (
          <ResultsTab 
            selectedTest={selectedTest}
            testResults={testResults}
            onBack={() => setActiveTab('tests')}
          />
        )}
        
        {activeTab === 'analytics' && (
          <AnalyticsTab />
        )}
      </div>

      {/* Create Test Modal */}
      {showCreateForm && (
        <CreateTestModal 
          onClose={() => setShowCreateForm(false)}
          onCreated={loadTests}
        />
      )}
    </div>
  );
};

const TestsTab = ({ tests, onTestSelect, onRefresh }) => {
  return (
    <div className="tests-tab">
      <div className="tests-grid">
        {tests.map(test => (
          <div key={test.id} className={`test-card status-${test.status}`}>
            <div className="test-header">
              <div className="test-info">
                <h3>{test.display_name}</h3>
                <p className="test-name">{test.name}</p>
              </div>
              <div 
                className="test-status" 
                style={{ backgroundColor: getStatusColor(test.status) }}
              >
                {test.status}
              </div>
            </div>
            
            <div className="test-body">
              <p className="test-description">{test.description}</p>
              
              <div className="test-details">
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{test.test_type}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Traffic:</span>
                  <span className="detail-value">{test.traffic_allocation}%</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Variants:</span>
                  <span className="detail-value">{test.variants?.length || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Start Date:</span>
                  <span className="detail-value">{formatDate(test.start_date)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">End Date:</span>
                  <span className="detail-value">{formatDate(test.end_date)}</span>
                </div>
              </div>

              <div className="test-variants">
                {test.variants?.map(variant => (
                  <div key={variant.id} className={`variant-chip ${variant.is_control ? 'control' : 'treatment'}`}>
                    {variant.display_name}
                    <span className="variant-weight">({variant.traffic_weight}%)</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="test-actions">
              <button 
                className="btn btn-outline"
                onClick={() => onTestSelect(test)}
              >
                View Results
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {tests.length === 0 && (
        <div className="empty-state">
          <h3>No A/B Tests</h3>
          <p>Create your first A/B test to start optimizing user experience.</p>
        </div>
      )}
    </div>
  );
};

const ResultsTab = ({ selectedTest, testResults, onBack }) => {
  if (!selectedTest) {
    return (
      <div className="results-tab">
        <div className="no-test-selected">
          <h3>No Test Selected</h3>
          <p>Please select a test from the Tests tab to view results.</p>
          <button onClick={onBack} className="btn btn-primary">
            Back to Tests
          </button>
        </div>
      </div>
    );
  }

  if (!testResults) {
    return (
      <div className="results-tab">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading test results...</p>
        </div>
      </div>
    );
  }

  const controlVariant = testResults.results?.find(r => r.is_control);
  const treatmentVariants = testResults.results?.filter(r => !r.is_control) || [];

  return (
    <div className="results-tab">
      <div className="results-header">
        <button onClick={onBack} className="back-button">
          ← Back to Tests
        </button>
        <div className="test-info">
          <h2>{selectedTest.display_name}</h2>
          <p className="test-description">{selectedTest.description}</p>
        </div>
      </div>

      <div className="results-summary">
        <div className="summary-card">
          <div className="summary-label">Test Status</div>
          <div className={`summary-value status-${selectedTest.status}`}>
            {selectedTest.status}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Traffic Allocation</div>
          <div className="summary-value">{selectedTest.traffic_allocation}%</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total Variants</div>
          <div className="summary-value">{testResults.results?.length || 0}</div>
        </div>
      </div>

      {/* Control Variant */}
      {controlVariant && (
        <div className="variant-results control-variant">
          <h3>Control: {controlVariant.variant_display_name}</h3>
          <div className="metrics-grid">
            {Object.entries(controlVariant.metrics || {}).map(([metricName, metrics]) => (
              <div key={metricName} className="metric-card">
                <div className="metric-header">
                  <h4>{metricName.replace(/_/g, ' ')}</h4>
                  <span className="metric-type">{metrics.metric_type}</span>
                </div>
                <div className="metric-stats">
                  <div className="stat">
                    <span className="stat-label">Sample Size:</span>
                    <span className="stat-value">{metrics.sample_size}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Conversion Rate:</span>
                    <span className="stat-value">{metrics.conversion_rate}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Conversions:</span>
                    <span className="stat-value">{metrics.conversions}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Treatment Variants */}
      {treatmentVariants.map(variant => (
        <div key={variant.variant_name} className="variant-results treatment-variant">
          <h3>Treatment: {variant.variant_display_name}</h3>
          <div className="metrics-grid">
            {Object.entries(variant.metrics || {}).map(([metricName, metrics]) => {
              const controlMetrics = controlVariant?.metrics?.[metricName];
              const lift = controlMetrics ? 
                calculateLift(controlMetrics.conversion_rate, metrics.conversion_rate) : 0;
              
              return (
                <div key={metricName} className="metric-card">
                  <div className="metric-header">
                    <h4>{metricName.replace(/_/g, ' ')}</h4>
                    <span className="metric-type">{metrics.metric_type}</span>
                  </div>
                  <div className="metric-stats">
                    <div className="stat">
                      <span className="stat-label">Sample Size:</span>
                      <span className="stat-value">{metrics.sample_size}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Conversion Rate:</span>
                      <span className="stat-value">{metrics.conversion_rate}%</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Conversions:</span>
                      <span className="stat-value">{metrics.conversions}</span>
                    </div>
                    <div className="stat lift-stat">
                      <span className="stat-label">Lift:</span>
                      <span className={`stat-value ${lift >= 0 ? 'positive' : 'negative'}`}>
                        {lift >= 0 ? '+' : ''}{lift}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const AnalyticsTab = () => {
  return (
    <div className="analytics-tab">
      <div className="analytics-content">
        <h3>A/B Testing Analytics</h3>
        <p>Advanced analytics and insights coming soon...</p>
        
        <div className="analytics-placeholder">
          <div className="placeholder-chart">
            <div className="chart-title">Conversion Rate Trends</div>
            <div className="chart-area">
              <div className="chart-bars">
                <div className="bar" style={{height: '60%'}}></div>
                <div className="bar" style={{height: '80%'}}></div>
                <div className="bar" style={{height: '45%'}}></div>
                <div className="bar" style={{height: '90%'}}></div>
                <div className="bar" style={{height: '70%'}}></div>
              </div>
            </div>
          </div>
          
          <div className="analytics-metrics">
            <div className="analytics-metric">
              <div className="metric-label">Tests Running</div>
              <div className="metric-value">3</div>
            </div>
            <div className="analytics-metric">
              <div className="metric-label">Avg Lift</div>
              <div className="metric-value">+12.5%</div>
            </div>
            <div className="analytics-metric">
              <div className="metric-label">Significance</div>
              <div className="metric-value">95%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateTestModal = ({ onClose, onCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    test_type: 'split',
    traffic_allocation: 100,
    success_metrics: { primary: 'conversion_rate' },
    variants: [
      { name: 'control', display_name: 'Control', is_control: true, traffic_weight: 50 },
      { name: 'treatment', display_name: 'Treatment', is_control: false, traffic_weight: 50 }
    ]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/ab-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to create test');
      }

      onCreated();
      onClose();
    } catch (error) {
      alert('Error creating test: ' + error.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create New A/B Test</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="test-form">
          <div className="form-group">
            <label>Test Name (internal):</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Display Name:</label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({...formData, display_name: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows="3"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Test Type:</label>
              <select
                value={formData.test_type}
                onChange={(e) => setFormData({...formData, test_type: e.target.value})}
              >
                <option value="split">A/B Split</option>
                <option value="multivariate">Multivariate</option>
                <option value="redirect">Redirect</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Traffic Allocation (%):</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.traffic_allocation}
                onChange={(e) => setFormData({...formData, traffic_allocation: parseInt(e.target.value)})}
              />
            </div>
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Test
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper function (moved outside component to avoid recreation)
const getStatusColor = (status) => {
  const colors = {
    active: '#28a745',
    draft: '#ffc107',
    paused: '#fd7e14',
    completed: '#6c757d',
    archived: '#dc3545'
  };
  return colors[status] || '#6c757d';
};

export default ABTesting;