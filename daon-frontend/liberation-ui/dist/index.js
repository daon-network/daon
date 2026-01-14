"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  KofiButton: () => KofiButton,
  LIBERATION_COLORS: () => LIBERATION_COLORS,
  LIBERATION_VALUES: () => LIBERATION_VALUES,
  LibIcon: () => LibIcon,
  cn: () => cn,
  liberationTheme: () => liberationTheme
});
module.exports = __toCommonJS(index_exports);

// src/icons/LibIcon.tsx
var import_lucide_react = require("lucide-react");
var import_jsx_runtime = require("react/jsx-runtime");
var LiberationIcons = {
  // Navigation
  Menu: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Menu, { ...props }),
  Close: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { ...props }),
  ChevronLeft: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronLeft, { ...props }),
  ChevronRight: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronRight, { ...props }),
  ExternalLink: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ExternalLink, { ...props }),
  Arrow: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ArrowRight, { ...props }),
  // Core Liberation Concepts
  Direction: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Compass, { ...props, "aria-label": "Find your direction" }),
  NewBeginning: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Sunrise, { ...props, "aria-label": "New dawn and fresh start" }),
  Growth: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Sprout, { ...props, "aria-label": "Personal growth and development" }),
  Progress: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.TrendingUp, { ...props, "aria-label": "Progress and advancement" }),
  Focus: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Target, { ...props, "aria-label": "Focus and intentionality" }),
  Freedom: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Unlock, { ...props, "aria-label": "Freedom and liberation" }),
  Privacy: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Shield, { ...props, "aria-label": "Privacy and protection" }),
  Wellbeing: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Heart, { ...props, "aria-label": "Health and wellbeing" }),
  Mind: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Brain, { ...props, "aria-label": "Mental health and cognition" }),
  Energy: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Zap, { ...props, "aria-label": "Energy and vitality" }),
  // Tool Categories
  RunwayCalculator: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Calculator, { ...props, "aria-label": "Runway calculator tool" }),
  WageAnalysis: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.DollarSign, { ...props, "aria-label": "Wage analysis tool" }),
  CognitiveDebt: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Brain, { ...props, "aria-label": "Cognitive debt assessment" }),
  TimeTracking: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Clock, { ...props, "aria-label": "Time tracking and analysis" }),
  DataVisualization: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.BarChart3, { ...props, "aria-label": "Data visualization" }),
  Analytics: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.PieChart, { ...props, "aria-label": "Analytics and insights" }),
  // Status Indicators
  Decline: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.TrendingDown, { ...props, "aria-label": "Declining trend" }),
  Warning: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.AlertTriangle, { ...props, "aria-label": "Warning" }),
  Success: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.CheckCircle, { ...props, "aria-label": "Success" }),
  Error: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.XCircle, { ...props, "aria-label": "Error" }),
  Info: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Info, { ...props, "aria-label": "Information" }),
  Alert: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.AlertCircle, { ...props, "aria-label": "Alert" }),
  Loading: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader, { ...props, "aria-label": "Loading" }),
  // Interface
  Settings: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Settings, { ...props, "aria-label": "Settings" }),
  Profile: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.User, { ...props, "aria-label": "User profile" }),
  Home: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Home, { ...props, "aria-label": "Home" }),
  Documentation: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.BookOpen, { ...props, "aria-label": "Documentation" }),
  Contact: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Mail, { ...props, "aria-label": "Contact" }),
  // External Links
  GitHub: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Github, { ...props, "aria-label": "GitHub repository" }),
  // Charts & Data
  ActivityChart: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Activity, { ...props, "aria-label": "Activity chart" }),
  LineChart: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.LineChart, { ...props, "aria-label": "Line chart" }),
  // AI & Technology
  AICopilot: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Bot, { ...props, "aria-label": "AI copilot assistant" }),
  Processing: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Cpu, { ...props, "aria-label": "Processing" }),
  Magic: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Wand2, { ...props, "aria-label": "AI magic and automation" })
};
var AnimatedIcon = ({ icon, animation, className = "", ...props }) => {
  const IconComponent = LiberationIcons[icon];
  if (!IconComponent) {
    console.warn(`Icon "${String(icon)}" not found in LiberationIcons`);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
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
var import_jsx_runtime2 = require("react/jsx-runtime");
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "a",
      {
        href: "https://ko-fi.com/greenfieldoverride",
        target: "_blank",
        rel: "noopener noreferrer",
        className: `inline-flex items-center gap-2 ${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${className}`,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u2615" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "font-medium", children: "Support on Ko-fi" })
        ]
      }
    );
  }
  if (variant === "minimal") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        onClick: handleKofiClick,
        className: `inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors ${className}`,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u2615" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-sm underline", children: "Ko-fi" })
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      onClick: handleKofiClick,
      className: `inline-flex items-center gap-2 ${sizeClasses[size]} bg-white border-2 border-blue-500 text-blue-500 rounded-lg hover:bg-blue-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg ${className}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "svg",
          {
            width: "20",
            height: "20",
            viewBox: "0 0 24 24",
            fill: "currentColor",
            className: "flex-shrink-0",
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M4 19V7c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v4h1c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2h-1v2c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2zm2-2h10v-2h1v-2h-1V7H6v10zm2-8h2v2H8V9zm4 0h2v2h-2V9z" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Support on Ko-fi" })
      ]
    }
  );
}

// src/utils/cn.ts
var import_clsx = require("clsx");
function cn(...inputs) {
  return (0, import_clsx.clsx)(inputs);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KofiButton,
  LIBERATION_COLORS,
  LIBERATION_VALUES,
  LibIcon,
  cn,
  liberationTheme
});
// @license Liberation-1.0
//# sourceMappingURL=index.js.map