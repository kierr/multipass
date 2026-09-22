# Accessibility Checklist

Use this when frontend changes affect interactive UI, forms, navigation, dialogs, or custom-rendered controls.

## High-Value Checks

- Interactive elements are keyboard reachable and operable.
- Focus order is predictable after navigation, modal open/close, and async updates.
- Buttons, links, and form fields have semantic roles and accessible names.
- Error states are announced or discoverable without relying only on color.
- Loading and disabled states remain understandable to assistive technology.
- Custom controls expose state with semantic HTML or ARIA only when needed.
- Streaming or live-updating surfaces do not steal focus or hide new content from screen readers.

## Common Risks

- Clickable `div` or `span` without keyboard support
- Icon-only controls without an accessible label
- Modals or popovers without focus containment or return focus
- Form validation messages that are only visual
- Tool or chat transcript content that updates without any announced context
- Color-only status indicators
