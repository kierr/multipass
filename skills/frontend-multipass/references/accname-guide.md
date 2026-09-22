# Accessible Name Computation (ACCNAME 1.2) Guide

Edge cases where intuitive assumptions about accessible names are wrong. Use this when reviewing elements with `title`, `aria-label`, `sr-only`, `alt`, or `aria-labelledby`.

## Key Rule: Name-From-Content Depends on Role

Not all elements compute their accessible name from child text content. The element's role determines whether name-from-content applies.

### Supports name-from-content
- Native semantic elements: `<button>`, `<a>`, `<h1>`-`<h6>`, `<summary>`, `<td>`, `<th>`, `<label>`, `<legend>`, `<option>`, `<figcaption>`
- ARIA roles with "name from content": `button`, `link`, `heading`, `treeitem`, `tab`, `menuitem`, `option`, `cell`, `gridcell`, `columnheader`, `rowheader`, `tooltip`

### Does NOT support name-from-content
- Generic roles: `<span>`, `<div>` (implicit `role="generic"`)
- `role="img"`, `role="meter"`, `role="progressbar"`, `role="scrollbar"`, `role="slider"`, `role="spinbutton"`
- `role="textbox"`, `role="combobox"`, `role="listbox"`, `role="searchbox"`
- Elements with `role="presentation"` or `role="none"`

## Common Patterns

### Pattern: `<span>` with `title` attribute + sr-only child text
```
<span title="Private">
  <span class="sr-only">Privacy: Private</span>
</span>
```
**Computed name:** "Private" (from `title` attribute via name-from-author).
**NOT** "Private Privacy: Private" — the sr-only text is NOT computed as an additional name because `<span>` (generic role) doesn't support name-from-content.

### Pattern: `<button>` with sr-only child text
```
<button>
  <svg aria-hidden="true">...</svg>
  <span class="sr-only">Close dialog</span>
</button>
```
**Computed name:** "Close dialog" — `<button>` supports name-from-content, so the sr-only text IS the accessible name. Correct pattern.

### Pattern: Element with both `aria-label` and child text
```
<a href="/" aria-label="Home">
  <img src="logo.png" alt="Company Logo">
</a>
```
**Computed name:** "Home" — `aria-label` takes precedence over name-from-content. The `alt` text from the child image is ignored. This is usually intentional but verify the label matches the visible text.

### Pattern: `aria-labelledby` pointing to hidden element
```
<div aria-labelledby="label-1">
  <span id="label-1" class="sr-only">Section title</span>
</div>
```
**Computed name:** "Section title" — `aria-labelledby` references work even when the target is visually hidden. This is correct and expected behavior.

## Framework-Specific Traps

### React `cloneElement` and aria-describedby
Components like shadcn/ui `FormField` use `React.cloneElement(child, { ...ariaAttrs })` to inject aria attributes. This **overwrites** any `aria-describedby` set on the child. If the component sets `aria-describedby` for error messages, any developer-added `aria-describedby` for hints is silently dropped.

**Verify** before recommending `aria-describedby` additions on inputs managed by form field components.

### Radix UI Dialog / Modal focus
Radix UI handles focus trapping and restoration automatically. Manual `autoFocus` props or focus management in `useEffect` may conflict with the library's focus management. Check the component's focus API before flagging missing focus management.

## Decision Tree

When reviewing an element's accessible name:
1. What is the element's role? (native HTML role or explicit ARIA role)
2. Does that role support name-from-content? (check the lists above)
3. Is there an `aria-labelledby`? → that wins (name-from-author)
4. Is there an `aria-label`? → that wins (name-from-author)
5. Is the element a native element with specific naming rules? (e.g., `<img>` uses `alt`, `<input>` uses associated `<label>`)
6. Is there a `title` attribute? → that's the name (name-from-author)
7. Only if the role supports name-from-content: child text contributes to the name

If you reach step 7 and the role doesn't support name-from-content, child text (including sr-only text) does NOT contribute to the accessible name.
