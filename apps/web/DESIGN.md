# apps/web/DESIGN.md

Design spec for the landing page. This is separate from the root `DESIGN.md`, which covers the product and CLI. Read that first for principles; this file covers only the page.

## 1. Purpose

One job: get a developer from "what is this?" to a working install in under 5 minutes.

The page is **documentation with a headline on top**, not a marketing site. If a section doesn't help someone install, run, or trust the harness, cut it.

**Primary action:** copy the install commands.
**Secondary action:** open the GitHub repo.

## 2. Constraints

- Static files only: `index.html`, `style.css`, optional `copy.js`.
- No framework, no build step, no bundler, no web fonts, no external requests.
- Works with JavaScript disabled. JS only enables the copy buttons.
- Total page weight under 50 KB.
- Hostable on any static host (GitHub Pages, Netlify, Cloudflare Pages).

## 3. Page structure

Single page, single column, top to bottom:

| # | Section | Content |
|---|---|---|
| 1 | Header | Project name, links: Install, Safety, GitHub |
| 2 | Hero | One-line pitch, one supporting sentence, install command with copy button, GitHub button |
| 3 | How it works | 3 numbered steps: Install, Add your key, Run in your directory |
| 4 | Install guide | Prerequisites, clone, build, PATH. OS tabs: Linux, macOS, Windows (WSL) |
| 5 | Usage | A realistic terminal session showing a goal, tool steps, a diff, and an approval prompt |
| 6 | Safety | What is sandboxed, what is not, why commands need approval |
| 7 | FAQ | Where the key is stored, what gets sent where, how to uninstall |
| 8 | Footer | GitHub link, license, version |

No testimonials, pricing, logos, newsletter signup, or feature grids.

## 4. Copy

**Hero headline:** Bring your own key. Point it at a directory. Let it code.
**Subhead:** A small, local AI coding harness. Your code and your API key stay on your machine.

Rules:
- Plain sentences. No "powerful", "seamless", "revolutionary".
- State the cost honestly: you pay your provider for tokens; the harness is free.
- State the limit honestly: this is not a container-grade sandbox. Use version control.
- Commands are written exactly as they should be pasted. No placeholders without an obvious marker like `<repo-url>`.

## 5. Visual design

### Direction
Terminal-flavored and quiet. It should look like good documentation, closer to a README rendered well than a startup site. Dark by default, light via `prefers-color-scheme`.

### Design tokens

```css
:root {
  --bg:        #0e1116;
  --surface:   #161b22;
  --border:    #262d36;
  --text:      #e6e9ee;
  --text-dim:  #9aa4b2;
  --accent:    #5eead4;
  --warn:      #fbbf24;
  --radius:    8px;
  --measure:   720px;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #ffffff;  --surface: #f5f7fa;  --border: #dde2e8;
    --text: #12161c; --text-dim: #5a6472; --accent: #0f766e; --warn: #b45309;
  }
}
```

Accent is used for exactly three things: links, the copy button, and focus rings. Nothing else is colored except the warning callout.

### Typography
- System font stacks only, no downloads.
- Headings and code: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`
- Body: `system-ui, -apple-system, "Segoe UI", sans-serif`
- Scale: 16px base body, 1.6 line height. h1 40px, h2 24px, h3 18px. Code 14px.

### Layout
- Single centered column, max width `720px`, `24px` side padding on mobile.
- Section vertical spacing: `64px` desktop, `40px` mobile.
- No multi-column grids except the three "how it works" steps, which stack on mobile.
- Hero is left-aligned, not centered.

## 6. Components

**Code block**
- Surface background, 1px border, 8px radius, `16px` padding.
- Horizontal scroll on overflow, never wrap commands.
- Copy button top-right: text label "Copy" that changes to "Copied" for 2 seconds.
- Shell prompt `$` is rendered but excluded from the copied text.

**OS tabs (Install guide)**
- Implemented without JS using `<details>` elements or radio-input tabs.
- Default open: the tab matching the visitor's OS is a nice-to-have, not required. Linux open by default.

**Terminal demo (Usage)**
- A static styled block, not an animation or video.
- Shows: the goal typed, three tool-step lines, a diff with `+`/`-` lines, the approval prompt, and the closing summary with step count and token estimate.
- Diff additions use the accent color, removals use the dim text color. Never rely on color alone: keep the `+` and `-` characters.

**Warning callout (Safety)**
- Left border in `--warn`, surface background.
- Used once, for the "not a container-grade sandbox" statement.

**Buttons**
- Two styles only: primary (accent fill, used for Copy and GitHub) and plain text links.
- Minimum tap target 44x44px.

## 7. Responsive behavior

- Single breakpoint at `640px`.
- Below it: steps stack, header links collapse to inline text, hero headline drops to 32px.
- The page body must never scroll horizontally. Wide content (code, diffs) scrolls inside its own container.

## 8. Accessibility

- Semantic landmarks: `header`, `main`, `section` with headings, `footer`.
- One `h1`. Heading levels never skip.
- Text contrast at least 4.5:1 in both themes.
- Visible `:focus-visible` outline on every interactive element.
- Copy buttons have an accessible name that includes what they copy (e.g. "Copy install commands").
- Respect `prefers-reduced-motion`. The page has no motion by default, so keep it that way.
- A "Skip to content" link as the first focusable element.

## 9. Metadata and SEO

- `<title>`: Project name, a short descriptor, under 60 characters.
- Meta description under 160 characters, same plain wording as the subhead.
- Open Graph title, description and a single static image (1200x630).
- Inline SVG or emoji favicon so there is no extra file request.
- `lang="en"` on `<html>`.

## 10. Performance budget

| Metric | Target |
|---|---|
| Total transfer | < 50 KB |
| Requests | ≤ 3 (HTML, CSS, JS) |
| Largest Contentful Paint | < 1s on a mid-range phone |
| Layout shift | 0 (no late-loading fonts or images) |

## 11. Out of scope

- Blog, changelog page, docs site (the repo `docs/` folder handles these)
- Analytics or cookies. If you add analytics later, update the "nothing is collected" claim on the page first.
- Interactive playground or hosted demo
- Localization

## 12. Definition of done

- A first-time visitor can install and run the harness using only this page.
- Every command on the page was run on a clean machine and works.
- Passes Lighthouse accessibility and performance checks at 95+.
- Reads correctly in both themes, on a 360px-wide phone and a 1440px desktop.
- The safety section says nothing the codebase doesn't actually enforce.
