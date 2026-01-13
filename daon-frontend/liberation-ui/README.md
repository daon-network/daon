# @greenfieldoverride/liberation-ui

> Values-aligned UI components for building ethical technology

A complete component library for the Liberation Platform, featuring semantic icons, community-support components, and a liberation-themed design system.

## Installation

```bash
npm install @greenfieldoverride/liberation-ui
# or
pnpm add @greenfieldoverride/liberation-ui
```

## Components

### LibIcon - 39 Semantic Liberation Icons

```tsx
import { LibIcon } from '@greenfieldoverride/liberation-ui';

<LibIcon icon="Freedom" size="lg" className="text-blue-600" />
<LibIcon icon="Growth" size="md" animation="pulse" />
```

**Available Icons:**
- Core Concepts: Freedom, Growth, Progress, Focus, Direction, NewBeginning, Wellbeing, Mind, Energy
- Tools: RunwayCalculator, WageAnalysis, CognitiveDebt, TimeTracking, DataVisualization, Analytics
- Status: Success, Error, Warning, Loading, Info, Alert
- Navigation: Menu, Close, ChevronLeft, ChevronRight, Arrow, ExternalLink
- Interface: Settings, Profile, Home, Documentation, Contact, GitHub
- And more...

### KofiButton - Community Support

```tsx
import { KofiButton } from '@greenfieldoverride/liberation-ui';

<KofiButton variant="button" size="medium" />
<KofiButton variant="badge" size="large" />
<KofiButton variant="minimal" />
```

### Liberation Theme

```tsx
import { liberationTheme, LIBERATION_COLORS } from '@greenfieldoverride/liberation-ui';

const primaryColor = LIBERATION_COLORS.primary;
```

## Development

View component documentation locally:

```bash
cd packages/liberation-ui
pnpm components
```

Open http://localhost:61000 to browse the component library.

## Building

```bash
pnpm build
```

## License

Liberation License  - Building tools for corporate escapees

## Support

Support the Liberation Platform: https://ko-fi.com/greenfieldoverride
