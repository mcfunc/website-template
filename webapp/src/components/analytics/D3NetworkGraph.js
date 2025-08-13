import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import axios from 'axios';
import './D3NetworkGraph.css';

const D3NetworkGraph = ({ config, token }) => {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    width = 800,
    height = 600,
    nodeRadius = 8,
    linkDistance = 100,
    charge = -300,
    showLabels = true,
    colorScheme = 'category10'
  } = config;

  useEffect(() => {
    fetchNetworkData();
  }, [config, token]);

  useEffect(() => {
    if (data && svgRef.current) {
      drawNetwork();
    }
  }, [data, width, height, nodeRadius, linkDistance, charge, showLabels, colorScheme]);

  const fetchNetworkData = async () => {
    try {
      setIsLoading(true);
      
      // This would typically fetch user interaction data, page relationships, etc.
      // For now, we'll generate sample network data
      const response = await axios.get('/api/analytics/network-data', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // If API doesn't exist, use sample data
      const sampleData = {
        nodes: [
          { id: 'home', group: 'page', value: 100, label: 'Home Page' },
          { id: 'products', group: 'page', value: 80, label: 'Products' },
          { id: 'about', group: 'page', value: 45, label: 'About Us' },
          { id: 'contact', group: 'page', value: 30, label: 'Contact' },
          { id: 'blog', group: 'page', value: 60, label: 'Blog' },
          { id: 'login', group: 'auth', value: 40, label: 'Login' },
          { id: 'signup', group: 'auth', value: 25, label: 'Sign Up' },
          { id: 'dashboard', group: 'user', value: 35, label: 'Dashboard' },
          { id: 'profile', group: 'user', value: 20, label: 'Profile' },
          { id: 'settings', group: 'user', value: 15, label: 'Settings' }
        ],
        links: [
          { source: 'home', target: 'products', value: 50 },
          { source: 'home', target: 'about', value: 25 },
          { source: 'home', target: 'blog', value: 35 },
          { source: 'home', target: 'login', value: 30 },
          { source: 'products', target: 'contact', value: 15 },
          { source: 'login', target: 'signup', value: 10 },
          { source: 'login', target: 'dashboard', value: 25 },
          { source: 'dashboard', target: 'profile', value: 15 },
          { source: 'dashboard', target: 'settings', value: 10 },
          { source: 'blog', target: 'contact', value: 8 }
        ]
      };

      setData(response.data || sampleData);
      setError(null);
    } catch (err) {
      console.error('Network data fetch error:', err);
      // Use sample data on error
      const sampleData = {
        nodes: [
          { id: 'home', group: 'page', value: 100, label: 'Home Page' },
          { id: 'products', group: 'page', value: 80, label: 'Products' },
          { id: 'about', group: 'page', value: 45, label: 'About Us' },
          { id: 'contact', group: 'page', value: 30, label: 'Contact' },
          { id: 'blog', group: 'page', value: 60, label: 'Blog' }
        ],
        links: [
          { source: 'home', target: 'products', value: 50 },
          { source: 'home', target: 'about', value: 25 },
          { source: 'home', target: 'blog', value: 35 },
          { source: 'products', target: 'contact', value: 15 },
          { source: 'blog', target: 'contact', value: 8 }
        ]
      };
      
      setData(sampleData);
      setError('Using sample data');
    } finally {
      setIsLoading(false);
    }
  };

  const drawNetwork = () => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svg
      .attr('width', width)
      .attr('height', height);

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const g = container.append('g');

    // Define color scale
    const color = d3.scaleOrdinal(d3[`scheme${colorScheme.charAt(0).toUpperCase() + colorScheme.slice(1)}`] || d3.schemeCategory10);

    // Create simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(charge))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => Math.sqrt(d.value) + 5));

    // Create links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.links)
      .enter().append('line')
      .attr('class', 'link')
      .style('stroke', '#999')
      .style('stroke-opacity', 0.6)
      .style('stroke-width', d => Math.sqrt(d.value));

    // Create nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(data.nodes)
      .enter().append('circle')
      .attr('class', 'node')
      .attr('r', d => Math.max(nodeRadius, Math.sqrt(d.value) * 2))
      .style('fill', d => color(d.group))
      .style('stroke', '#fff')
      .style('stroke-width', 2)
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', Math.max(nodeRadius, Math.sqrt(d.value) * 2.5))
          .style('stroke-width', 4);
        
        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'd3-tooltip')
          .style('opacity', 0);
        
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        tooltip.html(`<strong>${d.label}</strong><br/>
                     Value: ${d.value}<br/>
                     Group: ${d.group}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', Math.max(nodeRadius, Math.sqrt(d.value) * 2))
          .style('stroke-width', 2);
        
        // Remove tooltip
        d3.select('.d3-tooltip').remove();
      });

    // Add labels if enabled
    if (showLabels) {
      const labels = g.append('g')
        .attr('class', 'labels')
        .selectAll('text')
        .data(data.nodes)
        .enter().append('text')
        .attr('class', 'label')
        .style('font-size', '10px')
        .style('font-family', 'Arial, sans-serif')
        .style('fill', '#333')
        .style('text-anchor', 'middle')
        .style('pointer-events', 'none')
        .text(d => d.label);

      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);

        labels
          .attr('x', d => d.x)
          .attr('y', d => d.y + 4);
      });
    } else {
      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);
      });
    }

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Add legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', 'translate(20, 20)');

    const groups = [...new Set(data.nodes.map(d => d.group))];
    
    const legendItems = legend.selectAll('.legend-item')
      .data(groups)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 20})`);

    legendItems.append('circle')
      .attr('r', 6)
      .style('fill', d => color(d))
      .style('stroke', '#fff')
      .style('stroke-width', 1);

    legendItems.append('text')
      .attr('x', 15)
      .attr('y', 4)
      .style('font-size', '12px')
      .style('font-family', 'Arial, sans-serif')
      .style('fill', '#333')
      .style('text-transform', 'capitalize')
      .text(d => d);
  };

  if (isLoading) {
    return (
      <div className="d3-network-graph loading">
        <div className="loading-spinner"></div>
        <p>Loading network data...</p>
      </div>
    );
  }

  return (
    <div className="d3-network-graph">
      <div className="graph-controls">
        <button onClick={fetchNetworkData} className="refresh-btn">
          Refresh Data
        </button>
        {error && (
          <span className="error-notice">{error}</span>
        )}
      </div>
      <div className="graph-container">
        <svg ref={svgRef}></svg>
      </div>
      <div className="graph-info">
        <p>Interactive network visualization showing page relationships and user flow patterns.</p>
        <p><strong>Usage:</strong> Drag nodes to rearrange, zoom with mouse wheel, hover for details.</p>
      </div>
    </div>
  );
};

export default D3NetworkGraph;