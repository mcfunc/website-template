import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ConversionFunnel.css';

const ConversionFunnel = ({ config, widgetId, token }) => {
  const [funnelData, setFunnelData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { 
    funnel_steps = ['visit', 'signup', 'purchase'], 
    time_range = '24h' 
  } = config;

  useEffect(() => {
    fetchFunnelData();
  }, [widgetId, token, time_range]);

  const fetchFunnelData = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data && response.data.data.steps) {
        const steps = response.data.data.steps;
        // Calculate conversion percentages
        const totalVisitors = steps[0]?.count || 1;
        const processedSteps = steps.map((step, index) => ({
          ...step,
          percentage: ((step.count / totalVisitors) * 100).toFixed(1)
        }));
        setFunnelData(processedSteps);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load funnel data');
      console.error('Funnel data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="conversion-funnel loading">Loading funnel...</div>;
  }

  if (error) {
    return (
      <div className="conversion-funnel error">
        <p>{error}</p>
        <button onClick={fetchFunnelData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="conversion-funnel">
      <div className="funnel-steps">
        {funnelData.map((step, index) => (
          <div key={step.step} className="funnel-step">
            <div className="step-label">{step.step}</div>
            <div className="step-metrics">
              <span className="step-count">{step.count.toLocaleString()}</span>
              <span className="step-percentage">{step.percentage}%</span>
            </div>
            {index < funnelData.length - 1 && (
              <div className="step-connector">↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConversionFunnel;