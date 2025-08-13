const { Pool } = require('pg');
const cacheManager = require('./cacheManager');
const auditLogger = require('./auditLogger');

class KPICalculator {
  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'sitetemplate',
      user: process.env.POSTGRES_USER || 'admin',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: false,
    });

    // KPI calculation definitions
    this.kpiDefinitions = {
      users: {
        total_count: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'users\' AND user_id = $1',
        new_today: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'users\' AND user_id = $1 AND DATE(created_at) = CURRENT_DATE',
        growth_rate: 'custom_calculation',
        data_quality: 'SELECT AVG(quality_score) FROM api.data_quality_metrics WHERE data_type = \'users\' AND metric_date >= CURRENT_DATE - INTERVAL \'7 days\'',
        last_updated: 'SELECT MAX(created_at) FROM api.processed_data WHERE data_type = \'users\' AND user_id = $1'
      },
      posts: {
        total_count: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'posts\' AND user_id = $1',
        total_words: 'SELECT SUM((normalized_data->>\'word_count\')::int) FROM api.processed_data WHERE data_type = \'posts\' AND user_id = $1',
        avg_words_per_post: 'SELECT AVG((normalized_data->>\'word_count\')::int) FROM api.processed_data WHERE data_type = \'posts\' AND user_id = $1',
        posts_today: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'posts\' AND user_id = $1 AND DATE(created_at) = CURRENT_DATE',
        engagement_rate: 'custom_calculation',
        last_updated: 'SELECT MAX(created_at) FROM api.processed_data WHERE data_type = \'posts\' AND user_id = $1'
      },
      transactions: {
        total_count: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'transactions\' AND user_id = $1',
        total_amount: 'SELECT SUM((normalized_data->>\'amount_cents\')::int) FROM api.processed_data WHERE data_type = \'transactions\' AND user_id = $1',
        avg_transaction: 'SELECT AVG((normalized_data->>\'amount_cents\')::int) FROM api.processed_data WHERE data_type = \'transactions\' AND user_id = $1',
        transactions_today: 'SELECT COUNT(*) FROM api.processed_data WHERE data_type = \'transactions\' AND user_id = $1 AND DATE(created_at) = CURRENT_DATE',
        revenue_trend: 'custom_calculation',
        last_updated: 'SELECT MAX(created_at) FROM api.processed_data WHERE data_type = \'transactions\' AND user_id = $1'
      }
    };

    // Time periods for KPI calculations
    this.timePeriods = {
      today: {
        label: 'Today',
        sql: 'DATE(created_at) = CURRENT_DATE'
      },
      week: {
        label: 'This Week',
        sql: 'created_at >= DATE_TRUNC(\'week\', CURRENT_DATE)'
      },
      month: {
        label: 'This Month',
        sql: 'created_at >= DATE_TRUNC(\'month\', CURRENT_DATE)'
      },
      quarter: {
        label: 'This Quarter',
        sql: 'created_at >= DATE_TRUNC(\'quarter\', CURRENT_DATE)'
      },
      year: {
        label: 'This Year',
        sql: 'created_at >= DATE_TRUNC(\'year\', CURRENT_DATE)'
      },
      last_7_days: {
        label: 'Last 7 Days',
        sql: 'created_at >= CURRENT_DATE - INTERVAL \'7 days\''
      },
      last_30_days: {
        label: 'Last 30 Days',
        sql: 'created_at >= CURRENT_DATE - INTERVAL \'30 days\''
      }
    };
  }

  // Calculate KPIs for a specific data type and user
  async calculateKPIs(dataType, userId, period = 'all', options = {}) {
    const startTime = Date.now();
    const { useCache = true, forceRefresh = false } = options;
    
    try {
      // Check cache first
      const cacheKey = `kpi:${dataType}:${userId}:${period}`;
      if (useCache && !forceRefresh) {
        const cached = await cacheManager.get(cacheKey);
        if (cached && cached.calculated_at > Date.now() - (15 * 60 * 1000)) { // 15 minutes
          return {
            success: true,
            kpis: cached.kpis,
            metadata: cached.metadata,
            cached: true,
            calculationTime: Date.now() - startTime
          };
        }
      }

      // Get KPI definitions for this data type
      const definitions = this.kpiDefinitions[dataType];
      if (!definitions) {
        throw new Error(`No KPI definitions found for data type: ${dataType}`);
      }

      const kpis = {};
      const metadata = {
        dataType,
        userId,
        period,
        calculatedAt: new Date().toISOString(),
        source: 'database'
      };

      // Calculate each KPI
      for (const [kpiName, definition] of Object.entries(definitions)) {
        try {
          let value;
          
          if (definition === 'custom_calculation') {
            value = await this.calculateCustomKPI(kpiName, dataType, userId, period);
          } else {
            value = await this.executeKPIQuery(definition, userId, period);
          }
          
          kpis[kpiName] = {
            value,
            label: this.getKPILabel(kpiName),
            format: this.getKPIFormat(kpiName),
            calculatedAt: new Date().toISOString()
          };
          
        } catch (kpiError) {
          console.error(`Error calculating KPI ${kpiName}:`, kpiError);
          kpis[kpiName] = {
            value: null,
            error: kpiError.message,
            label: this.getKPILabel(kpiName),
            format: this.getKPIFormat(kpiName)
          };
        }
      }

      // Calculate derived KPIs
      const derivedKPIs = await this.calculateDerivedKPIs(kpis, dataType, userId, period);
      Object.assign(kpis, derivedKPIs);

      // Cache the results
      const result = { kpis, metadata };
      await cacheManager.set(cacheKey, {
        ...result,
        calculated_at: Date.now()
      }, 900); // 15 minutes

      // Store snapshot in database
      await this.storeKPISnapshot(dataType, userId, period, kpis, metadata);

      const calculationTime = Date.now() - startTime;
      
      // Log KPI calculation
      await auditLogger.logDataAccess(
        userId, 'kpi_calculation', null, 'calculate',
        { data_type: dataType, period, calculation_time_ms: calculationTime }
      );

      return {
        success: true,
        kpis,
        metadata,
        cached: false,
        calculationTime
      };

    } catch (error) {
      console.error('KPI calculation error:', error);
      return {
        success: false,
        error: error.message,
        calculationTime: Date.now() - startTime
      };
    }
  }

  // Execute a KPI query
  async executeKPIQuery(query, userId, period) {
    const client = await this.pool.connect();
    try {
      // Modify query for time period if needed
      let modifiedQuery = query;
      if (period !== 'all' && this.timePeriods[period]) {
        modifiedQuery = query.replace(
          'WHERE data_type =',
          `WHERE ${this.timePeriods[period].sql} AND data_type =`
        );
      }

      const result = await client.query(modifiedQuery, [userId]);
      return result.rows[0] ? Object.values(result.rows[0])[0] : 0;
    } finally {
      client.release();
    }
  }

  // Calculate custom KPIs
  async calculateCustomKPI(kpiName, dataType, userId, period) {
    switch (kpiName) {
      case 'growth_rate':
        return await this.calculateGrowthRate(dataType, userId, period);
      case 'engagement_rate':
        return await this.calculateEngagementRate(dataType, userId, period);
      case 'revenue_trend':
        return await this.calculateRevenueTrend(userId, period);
      default:
        return 0;
    }
  }

  // Calculate growth rate
  async calculateGrowthRate(dataType, userId, period) {
    const client = await this.pool.connect();
    try {
      // Get current period count
      const currentQuery = `
        SELECT COUNT(*) as current_count
        FROM api.processed_data
        WHERE data_type = $1 AND user_id = $2
        AND ${this.timePeriods[period]?.sql || '1=1'}
      `;
      
      // Get previous period count (same duration, shifted back)
      const previousQuery = `
        SELECT COUNT(*) as previous_count
        FROM api.processed_data
        WHERE data_type = $1 AND user_id = $2
        AND created_at >= CURRENT_DATE - INTERVAL '${this.getPeriodInterval(period)}' * 2
        AND created_at < CURRENT_DATE - INTERVAL '${this.getPeriodInterval(period)}'
      `;

      const [currentResult, previousResult] = await Promise.all([
        client.query(currentQuery, [dataType, userId]),
        client.query(previousQuery, [dataType, userId])
      ]);

      const current = parseInt(currentResult.rows[0]?.current_count || 0);
      const previous = parseInt(previousResult.rows[0]?.previous_count || 0);

      if (previous === 0) return current > 0 ? 100 : 0;
      
      return ((current - previous) / previous) * 100;
    } finally {
      client.release();
    }
  }

  // Calculate engagement rate (for posts)
  async calculateEngagementRate(dataType, userId, period) {
    if (dataType !== 'posts') return 0;

    const client = await this.pool.connect();
    try {
      // Simulate engagement calculation (in real scenario, this would use actual engagement data)
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_posts,
          AVG((normalized_data->>'word_count')::int) as avg_words
        FROM api.processed_data
        WHERE data_type = 'posts' AND user_id = $1
        ${period !== 'all' && this.timePeriods[period] ? `AND ${this.timePeriods[period].sql}` : ''}
      `, [userId]);

      const { total_posts, avg_words } = result.rows[0] || {};
      
      // Simple engagement rate calculation: higher word count = higher engagement
      if (!total_posts || total_posts === 0) return 0;
      
      const baseRate = Math.min((avg_words || 0) / 100, 10); // Max 10% base rate
      return parseFloat((baseRate * (1 + total_posts / 100)).toFixed(2));
    } finally {
      client.release();
    }
  }

  // Calculate revenue trend (for transactions)
  async calculateRevenueTrend(userId, period) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          SUM((normalized_data->>'amount_cents')::int) as daily_revenue
        FROM api.processed_data
        WHERE data_type = 'transactions' AND user_id = $1
        ${period !== 'all' && this.timePeriods[period] ? `AND ${this.timePeriods[period].sql}` : ''}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
        LIMIT 7
      `;

      const result = await client.query(query, [userId]);
      
      if (result.rows.length < 2) return 0;
      
      const revenues = result.rows.map(row => parseInt(row.daily_revenue || 0));
      const firstHalf = revenues.slice(0, Math.floor(revenues.length / 2));
      const secondHalf = revenues.slice(Math.floor(revenues.length / 2));
      
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      if (secondAvg === 0) return firstAvg > 0 ? 100 : 0;
      
      return ((firstAvg - secondAvg) / secondAvg) * 100;
    } finally {
      client.release();
    }
  }

  // Calculate derived KPIs based on existing KPIs
  async calculateDerivedKPIs(baseKPIs, dataType, userId, period) {
    const derived = {};

    // Calculate percentiles and rankings
    if (baseKPIs.total_count?.value > 0) {
      derived.data_completeness = {
        value: await this.calculateDataCompleteness(dataType, userId),
        label: 'Data Completeness',
        format: 'percentage'
      };
    }

    // Calculate efficiency metrics
    if (dataType === 'transactions' && baseKPIs.total_amount?.value > 0 && baseKPIs.total_count?.value > 0) {
      derived.avg_transaction_efficiency = {
        value: (baseKPIs.total_amount.value / baseKPIs.total_count.value / 100).toFixed(2), // Convert cents to dollars
        label: 'Average Transaction Value',
        format: 'currency'
      };
    }

    // Calculate velocity metrics
    if (baseKPIs.total_count?.value > 0) {
      derived.data_velocity = {
        value: await this.calculateDataVelocity(dataType, userId, period),
        label: 'Data Velocity (records/day)',
        format: 'number'
      };
    }

    return derived;
  }

  // Calculate data completeness score
  async calculateDataCompleteness(dataType, userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          AVG(
            CASE 
              WHEN normalized_data IS NOT NULL AND normalized_data != '{}' THEN 1 
              ELSE 0 
            END
          ) * 100 as completeness_score
        FROM api.processed_data
        WHERE data_type = $1 AND user_id = $2
      `, [dataType, userId]);

      return parseFloat((result.rows[0]?.completeness_score || 0).toFixed(2));
    } finally {
      client.release();
    }
  }

  // Calculate data velocity (records per day)
  async calculateDataVelocity(dataType, userId, period) {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_records,
          EXTRACT(DAYS FROM (MAX(created_at) - MIN(created_at))) + 1 as days
        FROM api.processed_data
        WHERE data_type = $1 AND user_id = $2
        ${period !== 'all' && this.timePeriods[period] ? `AND ${this.timePeriods[period].sql}` : ''}
      `;

      const result = await client.query(query, [dataType, userId]);
      const { total_records, days } = result.rows[0] || {};

      if (!days || days === 0) return 0;
      
      return parseFloat((total_records / days).toFixed(2));
    } finally {
      client.release();
    }
  }

  // Store KPI snapshot in database
  async storeKPISnapshot(dataType, userId, period, kpis, metadata) {
    const client = await this.pool.connect();
    try {
      await client.query(
        'SELECT api.create_kpi_snapshot($1, $2, $3)',
        [dataType, userId, new Date().toISOString().split('T')[0]]
      );

      // Also store detailed KPI data
      await client.query(`
        INSERT INTO api.kpi_detailed (
          data_type, user_id, period, kpi_data, metadata, calculated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (data_type, user_id, period, DATE(calculated_at))
        DO UPDATE SET 
          kpi_data = EXCLUDED.kpi_data,
          metadata = EXCLUDED.metadata,
          calculated_at = NOW()
      `, [dataType, userId, period, JSON.stringify(kpis), JSON.stringify(metadata)]);

    } catch (error) {
      console.error('Error storing KPI snapshot:', error);
    } finally {
      client.release();
    }
  }

  // Get historical KPI trends
  async getKPITrends(dataType, userId, kpiName, days = 30) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          DATE(calculated_at) as date,
          (kpi_data->>$1)::jsonb->>'value' as value
        FROM api.kpi_detailed
        WHERE data_type = $2 AND user_id = $3
        AND calculated_at >= CURRENT_DATE - INTERVAL '${days} days'
        AND kpi_data ? $1
        ORDER BY date ASC
      `, [kpiName, dataType, userId]);

      return {
        success: true,
        trends: result.rows.map(row => ({
          date: row.date,
          value: parseFloat(row.value) || 0
        }))
      };
    } catch (error) {
      console.error('Error getting KPI trends:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Compare KPIs across users or time periods
  async compareKPIs(dataType, kpiName, options = {}) {
    const { userIds = [], periods = ['last_7_days', 'last_30_days'], limit = 10 } = options;
    const client = await this.pool.connect();
    
    try {
      const results = {};
      
      for (const period of periods) {
        const comparisons = [];
        
        // If specific users provided, compare them
        if (userIds.length > 0) {
          for (const userId of userIds.slice(0, limit)) {
            const kpiResult = await this.calculateKPIs(dataType, userId, period, { useCache: true });
            if (kpiResult.success && kpiResult.kpis[kpiName]) {
              comparisons.push({
                userId,
                value: kpiResult.kpis[kpiName].value,
                label: kpiResult.kpis[kpiName].label
              });
            }
          }
        } else {
          // Compare top users by this KPI
          const query = `
            SELECT 
              user_id,
              (kpi_data->>$1)::jsonb->>'value' as value
            FROM api.kpi_detailed
            WHERE data_type = $2 AND period = $3
            AND kpi_data ? $1
            AND calculated_at >= CURRENT_DATE - INTERVAL '1 day'
            ORDER BY ((kpi_data->>$1)::jsonb->>'value')::numeric DESC
            LIMIT $4
          `;
          
          const result = await client.query(query, [kpiName, dataType, period, limit]);
          
          for (const row of result.rows) {
            comparisons.push({
              userId: row.user_id,
              value: parseFloat(row.value) || 0,
              label: this.getKPILabel(kpiName)
            });
          }
        }
        
        results[period] = comparisons.sort((a, b) => b.value - a.value);
      }
      
      return {
        success: true,
        comparisons: results
      };
    } catch (error) {
      console.error('Error comparing KPIs:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  // Utility methods
  getPeriodInterval(period) {
    const intervals = {
      today: '1 day',
      week: '1 week',
      month: '1 month',
      quarter: '3 months',
      year: '1 year',
      last_7_days: '7 days',
      last_30_days: '30 days'
    };
    return intervals[period] || '1 day';
  }

  getKPILabel(kpiName) {
    const labels = {
      total_count: 'Total Records',
      new_today: 'New Today',
      growth_rate: 'Growth Rate (%)',
      data_quality: 'Data Quality Score',
      last_updated: 'Last Updated',
      total_words: 'Total Words',
      avg_words_per_post: 'Average Words per Post',
      posts_today: 'Posts Today',
      engagement_rate: 'Engagement Rate (%)',
      total_amount: 'Total Amount (cents)',
      avg_transaction: 'Average Transaction (cents)',
      transactions_today: 'Transactions Today',
      revenue_trend: 'Revenue Trend (%)',
      data_completeness: 'Data Completeness (%)',
      avg_transaction_efficiency: 'Average Transaction Value',
      data_velocity: 'Data Velocity (records/day)'
    };
    return labels[kpiName] || kpiName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getKPIFormat(kpiName) {
    const formats = {
      growth_rate: 'percentage',
      engagement_rate: 'percentage',
      revenue_trend: 'percentage',
      data_quality: 'percentage',
      data_completeness: 'percentage',
      total_amount: 'currency_cents',
      avg_transaction: 'currency_cents',
      avg_transaction_efficiency: 'currency',
      last_updated: 'datetime'
    };
    return formats[kpiName] || 'number';
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  // Cleanup method
  async close() {
    await this.pool.end();
  }
}

module.exports = new KPICalculator();