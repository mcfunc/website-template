import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';
import './D3TreeMap.css';

const D3TreeMap = ({ config, token }) => {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    width = 800,
    height = 600,
    paddingInner = 1,
    paddingOuter = 1,
    colorScheme = 'blues',
    showLabels = true,
    showValues = true
  } = config;

  useEffect(() => {
    fetchTreeMapData();
  }, [config, token]);

  useEffect(() => {
    if (data && svgRef.current) {
      drawTreeMap();
    }
  }, [data, width, height, paddingInner, paddingOuter, colorScheme, showLabels, showValues]);

  const fetchTreeMapData = async () => {
    try {
      setIsLoading(true);
      
      // This would typically fetch hierarchical data like page views by section
      const response = await axios.get('/api/analytics/treemap-data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Sample hierarchical data structure
      const sampleData = {
        name: 'Website',
        children: [
          {
            name: 'Pages',
            children: [
              { name: 'Home', value: 1500 },
              { name: 'Products', value: 1200 },
              { name: 'About', value: 600 },
              { name: 'Contact', value: 400 },
              { name: 'Blog', value: 800 }
            ]
          },
          {
            name: 'User Actions',
            children: [
              { name: 'Sign Up', value: 300 },
              { name: 'Login', value: 800 },
              { name: 'Purchase', value: 150 },
              { name: 'Download', value: 250 }
            ]
          },
          {
            name: 'Traffic Sources',
            children: [
              { name: 'Direct', value: 2000 },
              { name: 'Search', value: 1500 },
              { name: 'Social', value: 800 },
              { name: 'Referral', value: 600 }
            ]
          },
          {
            name: 'Devices',
            children: [
              { name: 'Desktop', value: 2500 },
              { name: 'Mobile', value: 2000 },
              { name: 'Tablet', value: 400 }
            ]
          }
        ]
      };

      setData(response.data || sampleData);
      setError(null);
    } catch (err) {
      console.error('TreeMap data fetch error:', err);
      // Use sample data on error
      const sampleData = {
        name: 'Website',
        children: [
          {
            name: 'Pages',
            children: [
              { name: 'Home', value: 1500 },
              { name: 'Products', value: 1200 },
              { name: 'About', value: 600 }
            ]
          },
          {
            name: 'Actions',
            children: [
              { name: 'Sign Up', value: 300 },
              { name: 'Login', value: 800 }
            ]
          }
        ]
      };
      
      setData(sampleData);
      setError('Using sample data');
    } finally {
      setIsLoading(false);
    }
  };

  const drawTreeMap = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('width', width)
      .attr('height', height);

    // Create hierarchy
    const root = d3.hierarchy(data)
      .sum(d => d.value)
      .sort((a, b) => b.value - a.value);

    // Create treemap layout
    const treemap = d3.treemap()
      .size([width, height])
      .paddingInner(paddingInner)
      .paddingOuter(paddingOuter)
      .round(true);

    treemap(root);

    // Color scale based on depth
    const colorSchemes = {
      blues: d3.schemeBlues[9],
      greens: d3.schemeGreens[9],
      oranges: d3.schemeOranges[9],
      purples: d3.schemePurples[9],
      reds: d3.schemeReds[9]
    };

    const colors = colorSchemes[colorScheme] || colorSchemes.blues;
    const color = d3.scaleOrdinal(colors);

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip treemap-tooltip')
      .style('opacity', 0);

    // Create cells
    const cell = svg.selectAll('g')
      .data(root.leaves())
      .enter().append('g')
      .attr('class', 'treemap-cell')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    // Add rectangles
    cell.append('rect')
      .attr('id', d => `rect-${d.data.name.replace(/\s+/g, '-')}`)
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .style('fill', d => color(d.parent.data.name))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .style('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .style('opacity', 1)
          .style('stroke-width', 3);
        
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        tooltip.html(`<strong>${d.data.name}</strong><br/>
                     Category: ${d.parent.data.name}<br/>
                     Value: ${d.data.value.toLocaleString()}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .style('opacity', 0.8)
          .style('stroke-width', 2);
        
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });

    // Add labels if enabled
    if (showLabels) {
      cell.append('text')
        .attr('class', 'treemap-label')
        .style('font-size', d => {
          const area = (d.x1 - d.x0) * (d.y1 - d.y0);
          return Math.min(14, Math.sqrt(area) / 8) + 'px';
        })
        .style('font-family', 'Arial, sans-serif')
        .style('font-weight', '600')
        .style('fill', '#333')
        .style('text-anchor', 'middle')
        .style('pointer-events', 'none')
        .attr('x', d => (d.x1 - d.x0) / 2)
        .attr('y', d => (d.y1 - d.y0) / 2 - 5)
        .text(d => {
          const width = d.x1 - d.x0;
          const text = d.data.name;
          if (width < 60) return '';
          return text.length > width / 8 ? text.substring(0, width / 8) + '...' : text;
        });

      // Add values if enabled
      if (showValues) {
        cell.append('text')
          .attr('class', 'treemap-value')
          .style('font-size', d => {
            const area = (d.x1 - d.x0) * (d.y1 - d.y0);
            return Math.min(12, Math.sqrt(area) / 10) + 'px';
          })
          .style('font-family', 'Arial, sans-serif')
          .style('fill', '#666')
          .style('text-anchor', 'middle')
          .style('pointer-events', 'none')
          .attr('x', d => (d.x1 - d.x0) / 2)
          .attr('y', d => (d.y1 - d.y0) / 2 + 10)
          .text(d => {
            const width = d.x1 - d.x0;
            if (width < 40) return '';
            return d.data.value.toLocaleString();
          });
      }
    }

    // Add legend
    const legendData = [...new Set(root.leaves().map(d => d.parent.data.name))];
    
    const legend = svg.append('g')
      .attr('class', 'treemap-legend')
      .attr('transform', 'translate(20, 20)');

    const legendItems = legend.selectAll('.legend-item')
      .data(legendData)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 25})`);

    legendItems.append('rect')
      .attr('width', 18)
      .attr('height', 18)
      .style('fill', d => color(d))
      .style('stroke', '#fff')
      .style('stroke-width', 1);

    legendItems.append('text')
      .attr('x', 25)
      .attr('y', 9)
      .attr('dy', '0.35em')
      .style('font-size', '12px')
      .style('font-family', 'Arial, sans-serif')
      .style('fill', '#333')
      .text(d => d);

    // Cleanup tooltip on unmount
    return () => {
      d3.select('.treemap-tooltip').remove();
    };
  };

  if (isLoading) {
    return (
      <div className="d3-treemap loading">
        <div className="loading-spinner"></div>
        <p>Loading treemap data...</p>
      </div>
    );
  }

  return (
    <div className="d3-treemap">
      <div className="treemap-controls">
        <button onClick={fetchTreeMapData} className="refresh-btn">
          Refresh Data
        </button>
        {error && (
          <span className="error-notice">{error}</span>
        )}
      </div>
      <div className="treemap-container">
        <svg ref={svgRef}></svg>
      </div>
      <div className="treemap-info">
        <p>Hierarchical data visualization showing proportional relationships.</p>
        <p><strong>Usage:</strong> Hover over rectangles for detailed information.</p>
      </div>
    </div>
  );
};

export default D3TreeMap;