# Account Settings — Screen Spec

## Description

A settings screen that allows authenticated users to view and update their personal account
information. The screen covers identity (name, email, avatar), security (password change), and
account lifecycle (danger zone). It is accessed from the primary navigation and is a standalone
destination — not a modal or drawer.

**User goal:** Update personal data, change credentials, and manage account status without
confusion or friction.

**Context:** Web application, desktop-first. Authenticated users only. Low-frequency task;
accuracy and trust are priorities over speed.

**Figma:** _(to be filled in after design generation)_

---

## Visual Reference

> Identifies which design pattern this screen follows.
> Layout structure is based on the Settings pattern (sidebar nav + content area).

| | |
|---|---|
| **Pattern** | Settings — Sidebar navigation + stacked form sections |
| **Screenshots studied** | _(none yet — add to `knowledge-base/ui-references/screenshots/` and re-validate)_ |
| **Key composition rules** | Left sidebar ~240px fixed; content area fills remaining width; sections stacked vertically with dividers; form fields left-aligned in a max-width column (~560px) centered or left-anchored in the content area |

**Composition notes:**
- Sidebar carries global settings nav (vertical list of links, one active state)
- Content area is a single scrollable column — no secondary sidebar or tabs within the content
- Each logical section (Profile, Security, Danger Zone) is a visually separated card/panel
- Form fields are stacked vertically, full-width within the content column
- CTAs (Save, Cancel) are anchored below each section, not in a sticky footer
- Destructive actions (Delete Account) are isolated at the bottom with clear visual warning treatment

---

## Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  Top Nav (app-level — outside this screen's scope)   │
├──────────────┬───────────────────────────────────────┤
│  Settings    │  Content Area                         │
│  Sidebar     │                                       │
│              │  ┌─────────────────────────────────┐  │
│  · Account   │  │  Section: Profile Information   │  │
│  · Security  │  │  Avatar · Full Name · Email      │  │
│  · Billing   │  │  [Save Changes]                 │  │
│  · Notifs    │  └─────────────────────────────────┘  │
│  · Privacy   │                                       │
│              │  ┌─────────────────────────────────┐  │
│              │  │  Section: Change Password        │  │
│              │  │  Current · New · Confirm         │  │
│              │  │  [Update Password]              │  │
│              │  └─────────────────────────────────┘  │
│              │                                       │
│              │  ┌─────────────────────────────────┐  │
│              │  │  Section: Danger Zone            │  │
│              │  │  Delete Account                 │  │
│              │  └─────────────────────────────────┘  │
├──────────────┴───────────────────────────────────────┤
│  Footer (app-level — outside scope)                  │
└──────────────────────────────────────────────────────┘
```

---

## Sections

### 1. Settings Sidebar

- **Purpose**: Global settings navigation. Shows the user which settings category they're in.
- **DS Components used**: Navigation list / vertical nav item (active + default variants)
- **Content**:
  - Account ← active (current screen)
  - Security
  - Billing
  - Notifications
  - Privacy & Data
- **Behavior**: Each item navigates to its settings sub-page. Active item is visually highlighted.

---

### 2. Section Header (page-level)

- **Purpose**: Orient the user — "Account Information"
- **DS Components used**: Heading (h1/display), optional subtitle text
- **Content**:
  - Title: "Account Information"
  - Subtitle: "Update your name, email, and profile photo."

---

### 3. Profile Information

- **Purpose**: Let the user view and update identity fields.
- **DS Components used**:
  - Avatar (large, with upload/change action)
  - Text Input (full name, email)
  - Button (primary — "Save Changes", default — "Cancel")
  - Form label
  - Helper text / inline error
- **Content**:
  - Avatar: current user photo or initials fallback. "Change photo" link/button below.
  - Full Name: text input, placeholder "Jane Doe"
  - Email Address: text input, placeholder "jane@example.com". Helper text: "We'll send a confirmation to the new address."
  - Username (read-only, if applicable): displayed as static text with a lock/info icon
- **Behavior**:
  - "Save Changes" is disabled until at least one field is dirty
  - On save: inline success confirmation replaces CTA row briefly, then returns to default
  - Email change triggers verification flow (out of scope for this spec; treated as a note)
  - Avatar upload: click opens file picker; supports JPG/PNG ≤5MB

---

### 4. Change Password

- **Purpose**: Let the user update their login credentials.
- **DS Components used**:
  - Text Input (password type, with show/hide toggle)
  - Button (primary — "Update Password")
  - Inline error / helper text
  - Divider (section separator)
- **Content**:
  - Current Password
  - New Password (with strength indicator)
  - Confirm New Password
- **Behavior**:
  - "Update Password" disabled until all three fields are non-empty and new ≡ confirm
  - Password strength: weak / fair / strong — shown below New Password field as a bar + label
  - On success: fields clear, inline success message shown
  - On error (wrong current password): inline error on the Current Password field

---

### 5. Danger Zone

- **Purpose**: Destructive account lifecycle actions, isolated and visually distinct.
- **DS Components used**:
  - Card/Panel (danger variant — red border or warning background)
  - Button (destructive — "Delete Account")
  - Body text
  - Divider
- **Content**:
  - Heading: "Danger Zone"
  - Description: "Permanently delete your account and all associated data. This action cannot be undone."
  - CTA: "Delete Account" (destructive button)
- **Behavior**:
  - Clicking "Delete Account" opens a confirmation modal (separate flow, out of scope for this screen spec — noted as dependency)

---

## States

| State | Description |
|-------|-------------|
| Default / Populated | All fields pre-filled with current user data. CTAs disabled (no changes). |
| Dirty (unsaved changes) | One or more fields edited. "Save Changes" enabled. "Cancel" enabled (resets fields). |
| Saving | "Save Changes" shows loading state (spinner / disabled). |
| Save Success | Inline success confirmation (checkmark + "Changes saved") replaces CTA row for 3s. |
| Save Error | Inline error message below affected field(s). CTA returns to default. |
| Password Update Success | Password fields clear. "Password updated successfully" inline message. |
| Password Error | Inline error on incorrect current password. |

---

## DS Components Used

> Keys are placeholders — fill from `knowledge-base/registries/components.json` after `setup`.

| Component | Variant / Size | Figma Key | Location |
|-----------|---------------|-----------|----------|
| `TextInput` | default, error, disabled | _(fill after setup)_ | Profile, Password sections |
| `Button` | primary / md | _(fill after setup)_ | Save Changes, Update Password |
| `Button` | default / md | _(fill after setup)_ | Cancel |
| `Button` | destructive / md | _(fill after setup)_ | Danger Zone |
| `Avatar` | large (64px), with action | _(fill after setup)_ | Profile section |
| `FormLabel` | default | _(fill after setup)_ | All form fields |
| `HelperText` | default, error | _(fill after setup)_ | Email, Password fields |
| `NavItem` | default, active | _(fill after setup)_ | Settings Sidebar |
| `Divider` | horizontal | _(fill after setup)_ | Between sections |
| `Card` / `Panel` | danger / warning | _(fill after setup)_ | Danger Zone |
| `Heading` | h1 (page), h2 (section) | _(fill after setup)_ | Page header, section titles |
| `PasswordInput` | with show/hide toggle | _(fill after setup)_ | Password section |
| `ProgressBar` / `StrengthBar` | 3-step | _(fill after setup)_ | Password strength indicator |
| `InlineAlert` | success, error | _(fill after setup)_ | Save/update feedback |

---

## New DS Components Required

> UI patterns not clearly covered by common DS primitives. Each needs `spec → design → done` before screen design.

| Component Name | Used In | Description | Variants Needed |
|---------------|---------|-------------|-----------------|
| `PasswordStrengthBar` | Change Password | Horizontal progress bar below New Password field showing password strength in 3 steps (weak / fair / strong) with a label. Not a generic ProgressBar — semantically tied to password strength with color-coded states. | weak (red), fair (amber), strong (green) |
| `AvatarUpload` | Profile Information | Avatar with an overlay or adjacent "Change photo" trigger. Combines Avatar display with a file upload affordance. Not a plain Avatar component. | default (with photo), initials fallback, uploading (spinner), error |

---

## Content Structure

**Profile section — realistic example:**
- Avatar: initials "JD" on a teal background (no photo yet)
- Full Name: "Jane Doe"
- Email: "jane.doe@example.com"
- Username: "@janedoe" (read-only)

**Password section:**
- All fields empty by default (never pre-filled)

**Danger Zone:**
- Static copy only, no dynamic content

---

## Design Tokens

### Layout
| Token | Value (approx) | Usage |
|-------|----------------|-------|
| `spacing/sidebar-width` | 240px | Settings sidebar fixed width |
| `spacing/content-max-width` | 560px | Max width of form column in content area |
| `spacing/section-gap` | 32–40px | Vertical gap between sections |
| `spacing/field-gap` | 16–20px | Vertical gap between form fields within a section |
| `spacing/card-padding` | 24px | Internal padding of each section card |

### Colors
| Token | Usage |
|-------|-------|
| `color/background/page` | Page background |
| `color/background/surface` | Section card/panel background |
| `color/border/default` | Section card border |
| `color/border/danger` | Danger Zone card border |
| `color/text/primary` | Body and label text |
| `color/text/secondary` | Helper text, subtitles |
| `color/text/danger` | Danger Zone heading, destructive button |
| `color/feedback/success` | Save success state |
| `color/feedback/error` | Inline error states |

### Typography
| Token | Usage |
|-------|-------|
| `text/display/sm` or `text/heading/lg` | Page title "Account Information" |
| `text/heading/sm` or `text/label/lg` | Section headings (Profile, Password, Danger Zone) |
| `text/body/md` | Field labels, body copy |
| `text/body/sm` | Helper text, captions |

---

## Responsive Rules

| Breakpoint | Layout change |
|-----------|---------------|
| Desktop (>1024px) | Sidebar (240px) + content area side-by-side |
| Tablet (768–1024px) | Sidebar collapses to icon-only or top horizontal nav; content area full width |
| Mobile (<768px) | Sidebar hidden behind hamburger or bottom nav; content is single-column, full-bleed with tighter padding |

---

## Acceptance Criteria

- [ ] Settings sidebar renders with 5 nav items; "Account" is active
- [ ] Profile section shows avatar, full name, email, and (if applicable) read-only username
- [ ] Avatar supports click-to-upload; displays initials fallback when no photo
- [ ] "Save Changes" is disabled on initial load and enables when any field is dirty
- [ ] "Cancel" resets all dirty fields to their saved values
- [ ] Email change field includes helper text about confirmation email
- [ ] Password section has three fields with show/hide toggles
- [ ] Password strength bar updates in real-time as user types in New Password field
- [ ] "Update Password" disabled until all three fields are filled and New ≡ Confirm
- [ ] Danger Zone is visually distinct (warning/danger treatment) and isolated at bottom
- [ ] "Delete Account" opens a confirmation modal (out-of-scope dependency — stub the click)
- [ ] All form feedback (success, error) is inline — no toast/modal for non-destructive actions
- [ ] Screen passes DS token audit: no hardcoded hex or px values
- [ ] Responsive: sidebar collapses correctly at tablet and mobile breakpoints

---

## Open Questions

1. **Email verification flow** — Is changing email address handled in-page (inline confirm) or does it kick off a separate multi-step flow? Impacts the Email field's CTA and helper text.
2. **Username field** — Is username editable or always read-only? If editable, does it go in Profile section or a separate Identifiers section?
3. **Avatar upload constraints** — Accepted formats, max file size, crop behavior (free-form vs forced square)?
4. **Password requirements** — What are the actual rules (min length, special chars, etc.) that drive the strength bar thresholds?
5. **Danger Zone scope** — Only "Delete Account", or also "Deactivate Account" (reversible) as a separate action?
6. **DS component gaps** — `PasswordStrengthBar` and `AvatarUpload` are flagged as new components. Do they exist under different names in the DS? Confirm after `setup` extracts the registry.
