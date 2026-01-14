// src/icons/LibIcon.tsx
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ArrowRight,
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
  Calculator,
  DollarSign,
  Clock,
  BarChart3,
  PieChart,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  User,
  Home,
  BookOpen,
  Github,
  Mail,
  AlertCircle,
  Info,
  Loader,
  Activity,
  LineChart,
  Bot,
  Cpu,
  Wand2
} from "lucide-react";
import { jsx } from "react/jsx-runtime";
var LiberationIcons = {
  // Navigation
  Menu: (props) => /* @__PURE__ */ jsx(Menu, { ...props }),
  Close: (props) => /* @__PURE__ */ jsx(X, { ...props }),
  ChevronLeft: (props) => /* @__PURE__ */ jsx(ChevronLeft, { ...props }),
  ChevronRight: (props) => /* @__PURE__ */ jsx(ChevronRight, { ...props }),
  ExternalLink: (props) => /* @__PURE__ */ jsx(ExternalLink, { ...props }),
  Arrow: (props) => /* @__PURE__ */ jsx(ArrowRight, { ...props }),
  // Core Liberation Concepts
  Direction: (props) => /* @__PURE__ */ jsx(Compass, { ...props, "aria-label": "Find your direction" }),
  NewBeginning: (props) => /* @__PURE__ */ jsx(Sunrise, { ...props, "aria-label": "New dawn and fresh start" }),
  Growth: (props) => /* @__PURE__ */ jsx(Sprout, { ...props, "aria-label": "Personal growth and development" }),
  Progress: (props) => /* @__PURE__ */ jsx(TrendingUp, { ...props, "aria-label": "Progress and advancement" }),
  Focus: (props) => /* @__PURE__ */ jsx(Target, { ...props, "aria-label": "Focus and intentionality" }),
  Freedom: (props) => /* @__PURE__ */ jsx(Unlock, { ...props, "aria-label": "Freedom and liberation" }),
  Privacy: (props) => /* @__PURE__ */ jsx(Shield, { ...props, "aria-label": "Privacy and protection" }),
  Wellbeing: (props) => /* @__PURE__ */ jsx(Heart, { ...props, "aria-label": "Health and wellbeing" }),
  Mind: (props) => /* @__PURE__ */ jsx(Brain, { ...props, "aria-label": "Mental health and cognition" }),
  Energy: (props) => /* @__PURE__ */ jsx(Zap, { ...props, "aria-label": "Energy and vitality" }),
  // Tool Categories
  RunwayCalculator: (props) => /* @__PURE__ */ jsx(Calculator, { ...props, "aria-label": "Runway calculator tool" }),
  WageAnalysis: (props) => /* @__PURE__ */ jsx(DollarSign, { ...props, "aria-label": "Wage analysis tool" }),
  CognitiveDebt: (props) => /* @__PURE__ */ jsx(Brain, { ...props, "aria-label": "Cognitive debt assessment" }),
  TimeTracking: (props) => /* @__PURE__ */ jsx(Clock, { ...props, "aria-label": "Time tracking and analysis" }),
  DataVisualization: (props) => /* @__PURE__ */ jsx(BarChart3, { ...props, "aria-label": "Data visualization" }),
  Analytics: (props) => /* @__PURE__ */ jsx(PieChart, { ...props, "aria-label": "Analytics and insights" }),
  // Status Indicators
  Decline: (props) => /* @__PURE__ */ jsx(TrendingDown, { ...props, "aria-label": "Declining trend" }),
  Warning: (props) => /* @__PURE__ */ jsx(AlertTriangle, { ...props, "aria-label": "Warning" }),
  Success: (props) => /* @__PURE__ */ jsx(CheckCircle, { ...props, "aria-label": "Success" }),
  Error: (props) => /* @__PURE__ */ jsx(XCircle, { ...props, "aria-label": "Error" }),
  Info: (props) => /* @__PURE__ */ jsx(Info, { ...props, "aria-label": "Information" }),
  Alert: (props) => /* @__PURE__ */ jsx(AlertCircle, { ...props, "aria-label": "Alert" }),
  Loading: (props) => /* @__PURE__ */ jsx(Loader, { ...props, "aria-label": "Loading" }),
  // Interface
  Settings: (props) => /* @__PURE__ */ jsx(Settings, { ...props, "aria-label": "Settings" }),
  Profile: (props) => /* @__PURE__ */ jsx(User, { ...props, "aria-label": "User profile" }),
  Home: (props) => /* @__PURE__ */ jsx(Home, { ...props, "aria-label": "Home" }),
  Documentation: (props) => /* @__PURE__ */ jsx(BookOpen, { ...props, "aria-label": "Documentation" }),
  Contact: (props) => /* @__PURE__ */ jsx(Mail, { ...props, "aria-label": "Contact" }),
  // External Links
  GitHub: (props) => /* @__PURE__ */ jsx(Github, { ...props, "aria-label": "GitHub repository" }),
  // Charts & Data
  ActivityChart: (props) => /* @__PURE__ */ jsx(Activity, { ...props, "aria-label": "Activity chart" }),
  LineChart: (props) => /* @__PURE__ */ jsx(LineChart, { ...props, "aria-label": "Line chart" }),
  // AI & Technology
  AICopilot: (props) => /* @__PURE__ */ jsx(Bot, { ...props, "aria-label": "AI copilot assistant" }),
  Processing: (props) => /* @__PURE__ */ jsx(Cpu, { ...props, "aria-label": "Processing" }),
  Magic: (props) => /* @__PURE__ */ jsx(Wand2, { ...props, "aria-label": "AI magic and automation" })
};
var AnimatedIcon = ({ icon, animation, className = "", ...props }) => {
  const IconComponent = LiberationIcons[icon];
  if (!IconComponent) {
    console.warn(`Icon "${String(icon)}" not found in LiberationIcons`);
    return /* @__PURE__ */ jsx(
      "div",
      {
        className: `inline-block w-4 h-4 bg-gray-200 rounded ${className}`,
        "aria-label": props["aria-label"] || `${String(icon)} icon`
      }
    );
  }
  const animationClasses = {
    pulse: "animate-pulse",
    spin: "animate-spin",
    bounce: "animate-bounce",
    float: "animate-bounce"
  };
  const animationClass = animation ? animationClasses[animation] : "";
  return /* @__PURE__ */ jsx(
    IconComponent,
    {
      ...props,
      className: `text-current ${className} ${animationClass}`.trim()
    }
  );
};
var IconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64
};
var LibIcon = ({ icon, size = "md", className = "", animation, ...props }) => {
  const iconSize = IconSizes[size] || IconSizes.md;
  return /* @__PURE__ */ jsx(
    AnimatedIcon,
    {
      icon,
      size: iconSize,
      className,
      animation,
      ...props
    }
  );
};

// src/support/KofiButton.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function KofiButton({
  size = "medium",
  variant = "button",
  className = ""
}) {
  const handleKofiClick = () => {
    window.open("https://ko-fi.com/greenfieldoverride", "_blank", "noopener,noreferrer");
  };
  const sizeClasses = {
    small: "px-3 py-2 text-xs",
    medium: "px-4 py-2 text-sm",
    large: "px-6 py-3 text-base"
  };
  if (variant === "badge") {
    return /* @__PURE__ */ jsxs(
      "a",
      {
        href: "https://ko-fi.com/greenfieldoverride",
        target: "_blank",
        rel: "noopener noreferrer",
        className: `inline-flex items-center gap-2 ${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${className}`,
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u2615" }),
          /* @__PURE__ */ jsx2("span", { className: "font-medium", children: "Support on Ko-fi" })
        ]
      }
    );
  }
  if (variant === "minimal") {
    return /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: handleKofiClick,
        className: `inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors ${className}`,
        children: [
          /* @__PURE__ */ jsx2("span", { children: "\u2615" }),
          /* @__PURE__ */ jsx2("span", { className: "text-sm underline", children: "Ko-fi" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs(
    "button",
    {
      onClick: handleKofiClick,
      className: `inline-flex items-center gap-2 ${sizeClasses[size]} bg-white border-2 border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg ${className}`,
      children: [
        /* @__PURE__ */ jsx2(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "currentColor",
            className: "flex-shrink-0",
            children: /* @__PURE__ */ jsx2("path", { d: "M4 19V7c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v4h1c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-1v2c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2zm2-2h10v-2h1v-2h-1V7H6v10zm2-8h2v2H8V9zm4 0h2v2h-2V9z" })
          }
        ),
        /* @__PURE__ */ jsx2("span", { children: "Support on Ko-fi" })
      ]
    }
  );
}

// src/utils/cn.ts
import { clsx } from "clsx";
function cn(...inputs) {
  return clsx(inputs);
}

// src/theme/liberation.ts
var liberationTheme = {
  colors: {
    primary: {
      50: "#eff6ff",
      500: "#3b82f6",
      600: "#2563eb",
      700: "#1d4ed8"
    },
    secondary: {
      50: "#ecfdf5",
      500: "#10b981",
      600: "#059669",
      700: "#047857"
    },
    liberation: {
      blue: "#3b82f6",
      green: "#10b981",
      purple: "#8b5cf6",
      yellow: "#f59e0b",
      red: "#ef4444"
    }
  },
  values: {
    privacy: "Privacy is a Human Right",
    empowerment: "AI is a Partner, Not a Replacement",
    empathy: "Radical Empathy in a Cold World",
    openness: "Open and Replicable"
  }
};

// src/index.ts
var LIBERATION_COLORS = {
  primary: {
    50: "#eff6ff",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8"
  },
  secondary: {
    50: "#ecfdf5",
    500: "#10b981",
    600: "#059669",
    700: "#047857"
  },
  liberation: {
    blue: "#3b82f6",
    green: "#10b981",
    purple: "#8b5cf6",
    yellow: "#f59e0b",
    red: "#ef4444"
  }
};
var LIBERATION_VALUES = {
  privacy: "Privacy is a Human Right",
  empowerment: "AI is a Partner, Not a Replacement",
  empathy: "Radical Empathy in a Cold World",
  openness: "Open and Replicable"
};
export {
  KofiButton,
  LIBERATION_COLORS,
  LIBERATION_VALUES,
  LibIcon,
  cn,
  liberationTheme
};
// @license Liberation-1.0
//# sourceMappingURL=index.mjs.map