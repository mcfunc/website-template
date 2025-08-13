import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';
import './D3ScatterPlot.css';

const D3ScatterPlot = ({ config, token }) => {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    width = 800,
    height = 600,
    margin = { top: 40, right: 120, bottom: 60, left: 60 },
    dotRadius = 5,
    xField = 'x',
    yField = 'y',
    colorField = 'category',
    sizeField = null,
    showTrend = true,
    colorScheme = 'category10'
  } = config;

  useEffect(() => {
    fetchScatterData();
  }, [config, token]);

  useEffect(() => {
    if (data && svgRef.current) {
      drawScatterPlot();
    }
  }, [data, width, height, margin, dotRadius, xField, yField, colorField, sizeField, showTrend, colorScheme]);

  const fetchScatterData = async () => {
    try {
      setIsLoading(true);
      
      // This would typically fetch correlation data between different metrics
      const response = await axios.get('/api/analytics/scatter-data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Sample scatter plot data showing user engagement metrics
      const sampleData = [
        { x: 120, y: 85, category: 'High Engagement', size: 45, label: 'Power Users' },
        { x: 95, y: 72, category: 'High Engagement', size: 38, label: 'Active Users' },
        { x: 140, y: 91, category: 'High Engagement', size: 52, label: 'Premium Users' },
        { x: 110, y: 78, category: 'High Engagement', size: 41, label: 'Regular Users' },
        { x: 85, y: 65, category: 'Medium Engagement', size: 32, label: 'Casual Users' },
        { x: 70, y: 58, category: 'Medium Engagement', size: 28, label: 'Occasional Users' },
        { x: 92, y: 69, category: 'Medium Engagement', size: 35, label: 'Weekend Users' },
        { x: 78, y: 62, category: 'Medium Engagement', size: 30, label: 'Mobile Users' },
        { x: 45, y: 35, category: 'Low Engagement', size: 18, label: 'New Users' },
        { x: 52, y: 42, category: 'Low Engagement', size: 22, label: 'Trial Users' },
        { x: 38, y: 28, category: 'Low Engagement', size: 15, label: 'Inactive Users' },
        { x: 60, y: 48, category: 'Low Engagement', size: 25, label: 'One-time Users' },
        { x: 155, y: 95, category: 'High Engagement', size: 58, label: 'VIP Users' },
        { x: 125, y: 82, category: 'High Engagement', size: 47, label: 'Enterprise Users' },
        { x: 88, y: 67, category: 'Medium Engagement', size: 33, label: 'Standard Users' },
        { x: 102, y: 75, category: 'Medium Engagement', size: 39, label: 'Social Users' },
        { x: 67, y: 55, category: 'Medium Engagement', size: 27, label: 'Desktop Users' },
        { x: 35, y: 25, category: 'Low Engagement', size: 12, label: 'Dormant Users' },
        { x: 42, y: 38, category: 'Low Engagement', size: 19, label: 'Bounced Users' },
        { x: 75, y: 60, category: 'Medium Engagement', size: 29, label: 'Returning Users' }
      ];

      setData(response.data || sampleData);
      setError(null);
    } catch (err) {
      console.error('Scatter plot data fetch error:', err);
      // Use sample data on error
      const sampleData = [
        { x: 120, y: 85, category: 'High Engagement', size: 45, label: 'Power Users' },
        { x: 95, y: 72, category: 'High Engagement', size: 38, label: 'Active Users' },
        { x: 85, y: 65, category: 'Medium Engagement', size: 32, label: 'Casual Users' },
        { x: 70, y: 58, category: 'Medium Engagement', size: 28, label: 'Occasional Users' },
        { x: 45, y: 35, category: 'Low Engagement', size: 18, label: 'New Users' },
        { x: 52, y: 42, category: 'Low Engagement', size: 22, label: 'Trial Users' }
      ];
      
      setData(sampleData);
      setError('Using sample data');
    } finally {
      setIsLoading(false);
    }
  };

  const drawScatterPlot = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xExtent = d3.extent(data, d => d[xField]);
    const yExtent = d3.extent(data, d => d[yField]);
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] * 0.9, xExtent[1] * 1.1])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] * 0.9, yExtent[1] * 1.1])
      .range([innerHeight, 0]);

    // Size scale if sizeField is specified
    const sizeScale = sizeField ? d3.scaleSqrt()
      .domain(d3.extent(data, d => d[sizeField]))
      .range([3, 15]) : null;

    // Color scale
    const colorSchemes = {
      category10: d3.schemeCategory10,
      set3: d3.schemeSet3,
      pastel1: d3.schemePastel1,
      dark2: d3.schemeDark2
    };
    const colors = colorSchemes[colorScheme] || d3.schemeCategory10;
    const colorScale = d3.scaleOrdinal(colors);

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d3.format('.0f'));
    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d3.format('.0f'));

    // Add axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append('g')
      .attr('class', 'y-axis')
      .call(yAxis);

    // Add axis labels
    g.append('text')
      .attr('class', 'axis-label')
      .attr('text-anchor', 'middle')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .text(config.xLabel || 'Session Duration (minutes)');

    g.append('text')
      .attr('class', 'axis-label')
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -40)
      .text(config.yLabel || 'Engagement Score');

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip scatter-tooltip')
      .style('opacity', 0);

    // Add trend line if enabled
    if (showTrend) {
      const xValues = data.map(d => d[xField]);
      const yValues = data.map(d => d[yField]);
      
      // Simple linear regression
      const n = data.length;
      const sumX = d3.sum(xValues);
      const sumY = d3.sum(yValues);
      const sumXY = d3.sum(data.map(d => d[xField] * d[yField]));
      const sumXX = d3.sum(xValues.map(x => x * x));
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      const trendLine = d3.line()
        .x(d => xScale(d))
        .y(d => yScale(slope * d + intercept));
      
      const xRange = xScale.domain();
      
      g.append('path')
        .datum(xRange)
        .attr('class', 'trend-line')
        .attr('d', trendLine)
        .style('stroke', '#ff6b6b')
        .style('stroke-width', 2)
        .style('stroke-dasharray', '5,5')
        .style('fill', 'none')
        .style('opacity', 0.7);
      
      // Add trend line equation
      g.append('text')
        .attr('class', 'trend-equation')
        .attr('x', innerWidth - 10)
        .attr('y', 15)
        .attr('text-anchor', 'end')
        .style('font-size', '11px')
        .style('fill', '#ff6b6b')
        .text(`y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`);
    }

    // Add dots
    const dots = g.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d[xField]))
      .attr('cy', d => yScale(d[yField]))
      .attr('r', d => sizeScale ? sizeScale(d[sizeField]) : dotRadius)
      .style('fill', d => colorScale(d[colorField]))
      .style('stroke', '#fff')
      .style('stroke-width', 1.5)
      .style('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', (sizeScale ? sizeScale(d[sizeField]) : dotRadius) * 1.5)
          .style('opacity', 1)
          .style('stroke-width', 3);
        
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        const tooltipContent = `
          <strong>${d.label || 'Data Point'}</strong><br/>
          ${config.xLabel || 'X'}: ${d[xField]}<br/>
          ${config.yLabel || 'Y'}: ${d[yField]}<br/>
          Category: ${d[colorField]}
          ${sizeField ? `<br/>Size: ${d[sizeField]}` : ''}
        `;
        
        tooltip.html(tooltipContent)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', sizeScale ? sizeScale(d[sizeField]) : dotRadius)
          .style('opacity', 0.8)
          .style('stroke-width', 1.5);
        
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      })
      .on('click', function(event, d) {
        console.log('Clicked data point:', d);
        // Could trigger additional analysis or drill-down
      });

    // Add animation
    dots
      .style('opacity', 0)
      .transition()
      .duration(800)
      .delay((d, i) => i * 50)
      .style('opacity', 0.8);

    // Add legend
    const categories = [...new Set(data.map(d => d[colorField]))];
    
    const legend = svg.append('g')
      .attr('class', 'scatter-legend')
      .attr('transform', `translate(${width - 110}, ${margin.top + 20})`);

    const legendItems = legend.selectAll('.legend-item')
      .data(categories)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 20})`);

    legendItems.append('circle')
      .attr('r', 6)
      .style('fill', d => colorScale(d))
      .style('stroke', '#fff')
      .style('stroke-width', 1);

    legendItems.append('text')
      .attr('x', 12)
      .attr('y', 4)
      .style('font-size', '11px')
      .style('font-family', 'Arial, sans-serif')
      .style('fill', '#333')
      .text(d => d);

    // Add correlation coefficient if trend is shown
    if (showTrend) {
      const correlation = calculateCorrelation(data, xField, yField);
      
      g.append('text')
        .attr('class', 'correlation-text')
        .attr('x', innerWidth - 10)
        .attr('y', 35)
        .attr('text-anchor', 'end')
        .style('font-size', '11px')
        .style('fill', '#666')
        .text(`R² = ${correlation.toFixed(3)}`);
    }

    // Cleanup tooltip on unmount
    return () => {
      d3.select('.scatter-tooltip').remove();
    };
  };

  const calculateCorrelation = (data, xField, yField) => {
    const n = data.length;
    const xValues = data.map(d => d[xField]);
    const yValues = data.map(d => d[yField]);
    
    const xMean = d3.mean(xValues);
    const yMean = d3.mean(yValues);
    
    const numerator = d3.sum(data.map(d => (d[xField] - xMean) * (d[yField] - yMean)));
    const xVariance = d3.sum(xValues.map(x => (x - xMean) ** 2));
    const yVariance = d3.sum(yValues.map(y => (y - yMean) ** 2));
    
    const correlation = numerator / Math.sqrt(xVariance * yVariance);
    return correlation ** 2; // R-squared
  };

  if (isLoading) {
    return (
      <div className="d3-scatter-plot loading">
        <div className="loading-spinner"></div>
        <p>Loading scatter plot data...</p>
      </div>
    );
  }

  return (
    <div className="d3-scatter-plot">
      <div className="scatter-controls">
        <button onClick={fetchScatterData} className="refresh-btn">
          Refresh Data
        </button>
        {error && (
          <span className="error-notice">{error}</span>
        )}
      </div>
      <div className="scatter-container">
        <svg ref={svgRef}></svg>
      </div>
      <div className="scatter-info">
        <p>Correlation analysis showing relationships between user engagement metrics.</p>
        <p><strong>Usage:</strong> Hover over points for details, click for detailed analysis.</p>
        {showTrend && <p><strong>Trend:</strong> Red dashed line shows linear regression with R² correlation.</p>}
      </div>
    </div>
  );
};

export default D3ScatterPlot;