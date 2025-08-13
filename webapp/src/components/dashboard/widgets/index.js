// Widget Library - Central registry of all available widgets
import UserActivityChart from './UserActivityChart';
import ConversionFunnel from './ConversionFunnel';
import RealTimeMetrics from './RealTimeMetrics';
import LineChart from './LineChart';
import BarChart from './BarChart';
import PieChart from './PieChart';
import AlertList from './AlertList';
import SystemHealth from './SystemHealth';

// Widget registry - maps widget type names to React components
const WidgetLibrary = {
  user_activity_chart: UserActivityChart,
  conversion_funnel: ConversionFunnel,
  real_time_metrics: RealTimeMetrics,
  line_chart: LineChart,
  bar_chart: BarChart,
  pie_chart: PieChart,
  alert_list: AlertList,
  system_health: SystemHealth
};

export default WidgetLibrary;