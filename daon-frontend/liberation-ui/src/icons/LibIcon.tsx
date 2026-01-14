/**
 * Liberation Platform Icon System
 * Using Lucide React for consistent, values-aligned iconography
 */

import React from 'react';
import {
  // Navigation & Actions
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  
  // Liberation Theme Icons
  Compass,
  Sunrise,
  Sprout,
  TrendingUp,
  Target,
  Unlock,
  Shield,
  Heart,
  Brain,
  Zap,
  
  // Tool-Specific Icons
  Calculator,
  DollarSign,
  Clock,
  BarChart3,
  PieChart,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  
  // Interface Elements
  Settings,
  User,
  Home,
  BookOpen,
  Github,
  Mail,
  Phone,
  
  // Status & Feedback
  AlertCircle,
  Info,
  Loader,
  
  // Data & Analytics
  Activity,
  LineChart,
  
  // AI & Technology
  Bot,
  Cpu,
  Wand2,
} from 'lucide-react';

// Base icon props for consistent styling
interface IconProps {
  size?: number;
  className?: string;
  'aria-label'?: string;
}

// Liberation-themed icon components with semantic naming
export const LiberationIcons = {
  // Navigation
  Menu: (props: IconProps) => <Menu {...props} />,
  Close: (props: IconProps) => <X {...props} />,
  ChevronLeft: (props: IconProps) => <ChevronLeft {...props} />,
  ChevronRight: (props: IconProps) => <ChevronRight {...props} />,
  ExternalLink: (props: IconProps) => <ExternalLink {...props} />,
  Arrow: (props: IconProps) => <ArrowRight {...props} />,
  
  // Core Liberation Concepts
  Direction: (props: IconProps) => <Compass {...props} aria-label="Find your direction" />,
  NewBeginning: (props: IconProps) => <Sunrise {...props} aria-label="New dawn and fresh start" />,
  Growth: (props: IconProps) => <Sprout {...props} aria-label="Personal growth and development" />,
  Progress: (props: IconProps) => <TrendingUp {...props} aria-label="Progress and advancement" />,
  Focus: (props: IconProps) => <Target {...props} aria-label="Focus and intentionality" />,
  Freedom: (props: IconProps) => <Unlock {...props} aria-label="Freedom and liberation" />,
  Privacy: (props: IconProps) => <Shield {...props} aria-label="Privacy and protection" />,
  Wellbeing: (props: IconProps) => <Heart {...props} aria-label="Health and wellbeing" />,
  Mind: (props: IconProps) => <Brain {...props} aria-label="Mental health and cognition" />,
  Energy: (props: IconProps) => <Zap {...props} aria-label="Energy and vitality" />,
  
  // Tool Categories
  RunwayCalculator: (props: IconProps) => <Calculator {...props} aria-label="Runway calculator tool" />,
  WageAnalysis: (props: IconProps) => <DollarSign {...props} aria-label="Wage analysis tool" />,
  CognitiveDebt: (props: IconProps) => <Brain {...props} aria-label="Cognitive debt assessment" />,
  TimeTracking: (props: IconProps) => <Clock {...props} aria-label="Time tracking and analysis" />,
  DataVisualization: (props: IconProps) => <BarChart3 {...props} aria-label="Data visualization" />,
  Analytics: (props: IconProps) => <PieChart {...props} aria-label="Analytics and insights" />,
  
  // Status Indicators
  Decline: (props: IconProps) => <TrendingDown {...props} aria-label="Declining trend" />,
  Warning: (props: IconProps) => <AlertTriangle {...props} aria-label="Warning" />,
  Success: (props: IconProps) => <CheckCircle {...props} aria-label="Success" />,
  Error: (props: IconProps) => <XCircle {...props} aria-label="Error" />,
  Info: (props: IconProps) => <Info {...props} aria-label="Information" />,
  Alert: (props: IconProps) => <AlertCircle {...props} aria-label="Alert" />,
  Loading: (props: IconProps) => <Loader {...props} aria-label="Loading" />,
  
  // Interface
  Settings: (props: IconProps) => <Settings {...props} aria-label="Settings" />,
  Profile: (props: IconProps) => <User {...props} aria-label="User profile" />,
  Home: (props: IconProps) => <Home {...props} aria-label="Home" />,
  Documentation: (props: IconProps) => <BookOpen {...props} aria-label="Documentation" />,
  Contact: (props: IconProps) => <Mail {...props} aria-label="Contact" />,
  
  // External Links
  GitHub: (props: IconProps) => <Github {...props} aria-label="GitHub repository" />,
  
  // Charts & Data
  ActivityChart: (props: IconProps) => <Activity {...props} aria-label="Activity chart" />,
  LineChart: (props: IconProps) => <LineChart {...props} aria-label="Line chart" />,
  
  // AI & Technology
  AICopilot: (props: IconProps) => <Bot {...props} aria-label="AI copilot assistant" />,
  Processing: (props: IconProps) => <Cpu {...props} aria-label="Processing" />,
  Magic: (props: IconProps) => <Wand2 {...props} aria-label="AI magic and automation" />,
};

// Utility component for animated icons
export const AnimatedIcon: React.FC<{
  icon: keyof typeof LiberationIcons;
  size?: number;
  className?: string;
  'aria-label'?: string;
  animation?: 'pulse' | 'spin' | 'bounce' | 'float';
}> = ({ icon, animation, className = '', ...props }) => {
  const IconComponent = LiberationIcons[icon];
  
  if (!IconComponent) {
    console.warn(`Icon "${String(icon)}" not found in LiberationIcons`);
    return (
      <div 
        className={`inline-block w-4 h-4 bg-gray-200 rounded ${className}`}
        aria-label={props['aria-label'] || `${String(icon)} icon`}
      />
    );
  }
  
  const animationClasses = {
    pulse: 'animate-pulse',
    spin: 'animate-spin',
    bounce: 'animate-bounce',
    float: 'animate-bounce'
  };
  
  const animationClass = animation ? animationClasses[animation] : '';
  
  return (
    <IconComponent 
      {...props} 
      className={`text-current ${className} ${animationClass}`.trim()} 
    />
  );
};

// Preset icon sizes for consistency
export const IconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export type IconSize = keyof typeof IconSizes;

// Helper component with preset sizes
export const LibIcon: React.FC<{
  icon: keyof typeof LiberationIcons;
  size?: IconSize;
  className?: string;
  'aria-label'?: string;
  animation?: 'pulse' | 'spin' | 'bounce' | 'float';
}> = ({ icon, size = 'md', className = '', animation, ...props }) => {
  const iconSize = IconSizes[size] || IconSizes.md;
  
  return (
    <AnimatedIcon
      icon={icon}
      size={iconSize}
      className={className}
      animation={animation}
      {...props}
    />
  );
};