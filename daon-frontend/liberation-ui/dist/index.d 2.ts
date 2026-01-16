import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';
import { ClassValue } from 'clsx';

interface IconProps {
    size?: number;
    className?: string;
    'aria-label'?: string;
}
declare const LiberationIcons: {
    Menu: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Close: (props: IconProps) => react_jsx_runtime.JSX.Element;
    ChevronLeft: (props: IconProps) => react_jsx_runtime.JSX.Element;
    ChevronRight: (props: IconProps) => react_jsx_runtime.JSX.Element;
    ExternalLink: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Arrow: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Direction: (props: IconProps) => react_jsx_runtime.JSX.Element;
    NewBeginning: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Growth: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Progress: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Focus: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Freedom: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Privacy: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Wellbeing: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Mind: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Energy: (props: IconProps) => react_jsx_runtime.JSX.Element;
    RunwayCalculator: (props: IconProps) => react_jsx_runtime.JSX.Element;
    WageAnalysis: (props: IconProps) => react_jsx_runtime.JSX.Element;
    CognitiveDebt: (props: IconProps) => react_jsx_runtime.JSX.Element;
    TimeTracking: (props: IconProps) => react_jsx_runtime.JSX.Element;
    DataVisualization: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Analytics: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Decline: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Warning: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Success: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Error: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Info: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Alert: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Loading: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Settings: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Profile: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Home: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Documentation: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Contact: (props: IconProps) => react_jsx_runtime.JSX.Element;
    GitHub: (props: IconProps) => react_jsx_runtime.JSX.Element;
    ActivityChart: (props: IconProps) => react_jsx_runtime.JSX.Element;
    LineChart: (props: IconProps) => react_jsx_runtime.JSX.Element;
    AICopilot: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Processing: (props: IconProps) => react_jsx_runtime.JSX.Element;
    Magic: (props: IconProps) => react_jsx_runtime.JSX.Element;
};
declare const IconSizes: {
    readonly xs: 12;
    readonly sm: 16;
    readonly md: 20;
    readonly lg: 24;
    readonly xl: 32;
    readonly '2xl': 48;
    readonly '3xl': 64;
};
type IconSize = keyof typeof IconSizes;
declare const LibIcon: React.FC<{
    icon: keyof typeof LiberationIcons;
    size?: IconSize;
    className?: string;
    'aria-label'?: string;
    animation?: 'pulse' | 'spin' | 'bounce' | 'float';
}>;

interface KofiButtonProps$1 {
    size?: 'small' | 'medium' | 'large';
    variant?: 'button' | 'badge' | 'minimal';
    className?: string;
}
declare function KofiButton({ size, variant, className }: KofiButtonProps$1): react_jsx_runtime.JSX.Element;

/**
 * Utility function for combining class names
 * Perfect for conditional Tailwind classes in Liberation components
 */
declare function cn(...inputs: ClassValue[]): string;

type LibIconType = 'Menu' | 'Close' | 'ChevronLeft' | 'ChevronRight' | 'ExternalLink' | 'Arrow' | 'Direction' | 'NewBeginning' | 'Growth' | 'Progress' | 'Focus' | 'Freedom' | 'Privacy' | 'Wellbeing' | 'Mind' | 'Energy' | 'RunwayCalculator' | 'WageAnalysis' | 'CognitiveDebt' | 'TimeTracking' | 'DataVisualization' | 'Analytics' | 'Decline' | 'Warning' | 'Success' | 'Error' | 'Info' | 'Alert' | 'Loading' | 'Settings' | 'Profile' | 'Home' | 'Documentation' | 'Contact' | 'GitHub' | 'ActivityChart' | 'LineChart' | 'AICopilot' | 'Processing' | 'Magic';
type LibIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

interface KofiButtonProps {
    size?: KofiButtonSize;
    variant?: KofiButtonVariant;
    className?: string;
}
type KofiButtonSize = 'small' | 'medium' | 'large';
type KofiButtonVariant = 'button' | 'badge' | 'minimal';

declare const liberationTheme: {
    readonly colors: {
        readonly primary: {
            readonly 50: "#eff6ff";
            readonly 500: "#3b82f6";
            readonly 600: "#2563eb";
            readonly 700: "#1d4ed8";
        };
        readonly secondary: {
            readonly 50: "#ecfdf5";
            readonly 500: "#10b981";
            readonly 600: "#059669";
            readonly 700: "#047857";
        };
        readonly liberation: {
            readonly blue: "#3b82f6";
            readonly green: "#10b981";
            readonly purple: "#8b5cf6";
            readonly yellow: "#f59e0b";
            readonly red: "#ef4444";
        };
    };
    readonly values: {
        readonly privacy: "Privacy is a Human Right";
        readonly empowerment: "AI is a Partner, Not a Replacement";
        readonly empathy: "Radical Empathy in a Cold World";
        readonly openness: "Open and Replicable";
    };
};

declare const LIBERATION_COLORS: {
    readonly primary: {
        readonly 50: "#eff6ff";
        readonly 500: "#3b82f6";
        readonly 600: "#2563eb";
        readonly 700: "#1d4ed8";
    };
    readonly secondary: {
        readonly 50: "#ecfdf5";
        readonly 500: "#10b981";
        readonly 600: "#059669";
        readonly 700: "#047857";
    };
    readonly liberation: {
        readonly blue: "#3b82f6";
        readonly green: "#10b981";
        readonly purple: "#8b5cf6";
        readonly yellow: "#f59e0b";
        readonly red: "#ef4444";
    };
};
declare const LIBERATION_VALUES: {
    readonly privacy: "Privacy is a Human Right";
    readonly empowerment: "AI is a Partner, Not a Replacement";
    readonly empathy: "Radical Empathy in a Cold World";
    readonly openness: "Open and Replicable";
};

export { KofiButton, type KofiButtonProps, type KofiButtonSize, type KofiButtonVariant, LIBERATION_COLORS, LIBERATION_VALUES, LibIcon, type LibIconSize, type LibIconType, cn, liberationTheme };
