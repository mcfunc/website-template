import React, { useState, useEffect } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import axios from 'axios';

ChartJS.register(ArcElement, Tooltip, Legend);

const PieChart = ({ config, widgetId, token }) => {
  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchChartData();
  }, [widgetId, token]);

  const fetchChartData = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/dashboard/widgets/${widgetId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.data) {
        setChartData(response.data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load chart data');
    } finally {
      setIsLoading(false);
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' }
    }
  };

  if (isLoading) return <div>Loading chart...</div>;
  if (error) return <div>{error}</div>;
  if (!chartData) return <div>No data available</div>;

  return (
    <div style={{ height: '100%' }}>
      <Pie data={chartData} options={options} />
    </div>
  );
};

export default PieChart;