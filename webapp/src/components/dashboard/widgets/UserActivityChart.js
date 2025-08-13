import React, { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import './UserActivityChart.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const UserActivityChart = ({ config, widgetId, realTimeData, token }) => {
  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  const { 
    time_range = '1h', 
    chart_type = 'line',
    show_active_users = true,
    show_total_events = true
  } = config;

  // Fetch initial data
  useEffect(() => {
    fetchChartData();
  }, [widgetId, token, time_range]);

  // Update with real-time data
  useEffect(() => {
    if (realTimeData && realTimeData.data) {
      updateChartWithRealTimeData(realTimeData.data);
    }
  }, [realTimeData]);

  const fetchChartData = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        params: { time_range },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data && response.data.data.data) {
        processChartData(response.data.data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load chart data');
      console.error('Chart data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const processChartData = (data) => {
    if (!data.datasets) return;

    const processedData = {
      labels: data.labels || [],
      datasets: data.datasets.filter(dataset => {
        if (dataset.label === 'Active Users' && !show_active_users) return false;
        if (dataset.label === 'Total Events' && !show_total_events) return false;
        return true;
      }).map(dataset => ({
        ...dataset,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: chart_type === 'area'
      }))
    };

    setChartData(processedData);
  };

  const updateChartWithRealTimeData = (newData) => {
    if (!chartData || !newData.length) return;

    const chart = chartRef.current;
    if (!chart) return;

    // Add new data point
    const newPoint = newData[newData.length - 1];
    const newTime = new Date(newPoint.time_bucket).toLocaleTimeString();
    
    setChartData(prevData => {
      const updatedData = { ...prevData };
      
      // Add new label
      updatedData.labels = [...updatedData.labels, newTime];
      
      // Update datasets
      updatedData.datasets = updatedData.datasets.map(dataset => {
        let newValue = 0;
        if (dataset.label === 'Active Users') {
          newValue = parseInt(newPoint.active_users || 0);
        } else if (dataset.label === 'Total Events') {
          newValue = parseInt(newPoint.total_events || 0);
        }
        
        return {
          ...dataset,
          data: [...dataset.data, newValue]
        };
      });
      
      // Keep only last 60 data points for performance
      if (updatedData.labels.length > 60) {
        updatedData.labels = updatedData.labels.slice(-60);
        updatedData.datasets = updatedData.datasets.map(dataset => ({
          ...dataset,
          data: dataset.data.slice(-60)
        }));
      }
      
      return updatedData;
    });
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      title: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Count'
        },
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    animation: {
      duration: realTimeData ? 750 : 1000,
      easing: 'easeInOutQuart'
    }
  };

  if (isLoading) {
    return (
      <div className="user-activity-chart loading">
        <div className="loading-spinner"></div>
        <p>Loading activity data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-activity-chart error">
        <p>{error}</p>
        <button onClick={fetchChartData} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!chartData || !chartData.datasets.length) {
    return (
      <div className="user-activity-chart empty">
        <p>No activity data available for the selected time range.</p>
      </div>
    );
  }

  return (
    <div className="user-activity-chart">
      <div className="chart-container">
        <Line 
          ref={chartRef}
          data={chartData} 
          options={chartOptions} 
        />
      </div>
      <div className="chart-info">
        <span className="time-range">Range: {time_range}</span>
        {realTimeData && (
          <span className="live-indicator">● LIVE</span>
        )}
      </div>
    </div>
  );
};

export default UserActivityChart;