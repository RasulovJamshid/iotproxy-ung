# Dark Mode Implementation Guide

## Overview

The IoTProxy frontend now includes comprehensive dark mode support with three theme options:
- **Light Mode** - Traditional light theme
- **Dark Mode** - Dark theme optimized for low-light environments
- **System** - Automatically matches OS preference

---

## Implementation Summary

### ✅ **Completed Components**

#### **Core UI Components**
- ✅ **Modal** - Dark backdrop, background, borders, text, and hover states
- ✅ **Badge** - All status variants (commissioning, connectivity, severity, alerts, exports)
- ✅ **EmptyState** - Icon background, title, and description text
- ✅ **ConfirmDialog** - Text colors
- ✅ **Spinner** - Blue color adjusted for dark mode
- ✅ **Tooltip** - Lighter background in dark mode for better contrast

#### **Global Styles (`index.css`)**
- ✅ **CSS Variables** - Dark mode color palette
- ✅ **Background** - Gradient backgrounds for both themes
- ✅ **Buttons** - Primary, secondary, ghost, danger variants
- ✅ **Inputs** - Form inputs, error states, disabled states
- ✅ **Labels** - Form labels and hints
- ✅ **Cards** - All card variants (card, card-flush, card-sm)
- ✅ **Tables** - Headers, rows, cells, hover states
- ✅ **Scrollbar** - Custom scrollbar styling
- ✅ **Focus Rings** - Accessible focus indicators
- ✅ **Utilities** - Text muted/faint, shadows, animations

#### **Layout Components**
- ✅ **App Shell** - Sidebar, header, navigation
- ✅ **Sidebar** - Dark gradient background, navigation items, user footer
- ✅ **Header** - Backdrop blur, borders, theme toggle
- ✅ **Theme Toggle** - Three-way toggle (light/system/dark)

#### **Page Components**
- ✅ **DashboardPage** - Charts, cards, stats, system status
- ✅ **All other pages** - Inherited from global styles

---

## Color Palette

### Light Mode
```css
--bg-0: #f8fafc;           /* Base background */
--bg-1: #e0f2fe;           /* Accent gradient 1 */
--bg-2: #f3e8ff;           /* Accent gradient 2 */
--surface: rgba(255, 255, 255, 0.85);
```

### Dark Mode
```css
--bg-0: #0f172a;           /* Base background (slate-900) */
--bg-1: #1e1b4b;           /* Accent gradient 1 (indigo-950) */
--bg-2: #020617;           /* Accent gradient 2 (slate-950) */
--surface: rgba(15, 23, 42, 0.85);
```

---

## Design Principles

### 1. **Contrast Ratios**
- Text on backgrounds meets WCAG AA standards
- Interactive elements have clear hover/focus states
- Status badges use semi-transparent backgrounds for better layering

### 2. **Consistency**
- All components use Tailwind's `dark:` variant
- Color tokens are semantic (e.g., `text-slate-700 dark:text-slate-300`)
- Gradients and shadows adjusted for each theme

### 3. **Accessibility**
- Focus rings visible in both themes
- Sufficient contrast for all text
- Status indicators use both color AND icons/text

### 4. **Performance**
- CSS-only theme switching (no JavaScript overhead)
- System preference detection via `prefers-color-scheme`
- Theme preference persisted in localStorage

---

## Component Patterns

### **Text Colors**
```tsx
// Headings
className="text-slate-900 dark:text-slate-100"

// Body text
className="text-slate-700 dark:text-slate-300"

// Muted text
className="text-slate-500 dark:text-slate-400"

// Faint text
className="text-slate-400 dark:text-slate-500"
```

### **Backgrounds**
```tsx
// Cards
className="bg-white/90 dark:bg-slate-900/90"

// Subtle backgrounds
className="bg-slate-50 dark:bg-slate-800"

// Interactive backgrounds
className="hover:bg-slate-100 dark:hover:bg-slate-800"
```

### **Borders**
```tsx
// Standard borders
className="border-slate-200 dark:border-slate-700"

// Subtle borders
className="border-slate-100 dark:border-slate-800"

// Ring borders
className="ring-slate-200/80 dark:ring-slate-800/80"
```

### **Shadows**
```tsx
// Light mode shadow
className="shadow-[0_24px_48px_-24px_rgba(15,23,42,0.65)]"

// Dark mode shadow
className="dark:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]"
```

---

## Badge Color System

All status badges support dark mode with semi-transparent backgrounds:

| **Status** | **Light BG** | **Dark BG** | **Text (Light)** | **Text (Dark)** |
|------------|--------------|-------------|------------------|-----------------|
| ACTIVE     | `bg-green-50` | `bg-green-900/30` | `text-green-700` | `text-green-400` |
| OFFLINE    | `bg-red-50` | `bg-red-900/30` | `text-red-700` | `text-red-400` |
| WARNING    | `bg-yellow-50` | `bg-yellow-900/30` | `text-yellow-700` | `text-yellow-400` |
| DISCOVERY  | `bg-purple-50` | `bg-purple-900/30` | `text-purple-700` | `text-purple-400` |
| UNKNOWN    | `bg-slate-100` | `bg-slate-800/50` | `text-slate-600` | `text-slate-400` |

---

## Theme Context

### **ThemeProvider**
Located in `frontend/src/contexts/ThemeContext.tsx`:

```tsx
type Theme = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'light' | 'dark';
}>({...});
```

### **Usage**
```tsx
import { useTheme } from '../contexts/ThemeContext';

function MyComponent() {
  const { theme, setTheme, actualTheme } = useTheme();
  
  // theme: user's preference ('light', 'dark', or 'system')
  // actualTheme: resolved theme ('light' or 'dark')
  
  return (
    <div className={actualTheme === 'dark' ? 'dark-specific' : 'light-specific'}>
      {/* ... */}
    </div>
  );
}
```

---

## Testing Dark Mode

### **Manual Testing**
1. Click theme toggle in header (sun/monitor/moon icons)
2. Verify all pages render correctly in both themes
3. Check charts, modals, tooltips, and interactive elements
4. Test system theme detection (change OS preference)

### **Visual Checklist**
- [ ] Text is readable on all backgrounds
- [ ] Hover states are visible
- [ ] Focus rings are clear
- [ ] Charts use appropriate colors
- [ ] Modals have proper backdrop
- [ ] Badges are legible
- [ ] Forms are usable
- [ ] Tables have clear row separation

---

## Browser Support

Dark mode works in all modern browsers:
- ✅ Chrome/Edge 76+
- ✅ Firefox 67+
- ✅ Safari 12.1+
- ✅ Opera 63+

System preference detection requires:
- `prefers-color-scheme` media query support
- Modern browsers (2019+)

---

## Future Enhancements

### **Potential Improvements**
1. **High Contrast Mode** - For accessibility
2. **Custom Color Themes** - User-defined accent colors
3. **Scheduled Theme Switching** - Auto dark mode at night
4. **Per-Page Theme Override** - Different themes for different sections

### **Chart Improvements**
- Dynamic chart colors based on theme
- Better contrast for data visualization
- Theme-aware export images

---

## Troubleshooting

### **Dark mode not applying?**
1. Check `<html>` element has `class="dark"` when in dark mode
2. Verify ThemeProvider wraps your app
3. Clear localStorage and refresh

### **Colors look wrong?**
1. Ensure Tailwind's `darkMode: 'class'` is configured
2. Check CSS variable definitions in `index.css`
3. Verify no inline styles override dark mode classes

### **System theme not detected?**
1. Check browser supports `prefers-color-scheme`
2. Verify OS has dark mode enabled
3. Test with browser DevTools (emulate color scheme)

---

## Code Examples

### **Adding Dark Mode to New Component**

```tsx
// ❌ Bad - No dark mode
<div className="bg-white text-slate-900 border-slate-200">
  <h2 className="text-slate-700">Title</h2>
  <p className="text-slate-500">Description</p>
</div>

// ✅ Good - Full dark mode support
<div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700">
  <h2 className="text-slate-700 dark:text-slate-300">Title</h2>
  <p className="text-slate-500 dark:text-slate-400">Description</p>
</div>
```

### **Using Utility Classes**

```tsx
// Use pre-defined utilities from index.css
<p className="text-muted">Muted text</p>
<p className="text-faint">Faint text</p>
<div className="card">Card with dark mode</div>
<input className="input" />
<button className="btn-primary">Primary button</button>
```

---

## Summary

✅ **Complete dark mode implementation** across all UI components  
✅ **Three theme modes**: Light, Dark, System  
✅ **Accessible** with proper contrast ratios  
✅ **Performant** CSS-only switching  
✅ **Consistent** design language  
✅ **Persistent** user preference  

The dark mode implementation follows modern best practices and provides a polished, professional experience for users who prefer darker interfaces.
