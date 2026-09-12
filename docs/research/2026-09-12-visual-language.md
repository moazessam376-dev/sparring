# Visual language for sparring

Date: 2026-09-12. Question: what visual language, natural dark palette, glass treatment and meaningful motion should a local-first desktop learning application use if it takes cues from Codex, T3 Code and the best desktop developer tools without looking like a generated web app? Sources are numbered at the end. `P` means verified in a primary product, platform or research source; `2` means a secondary source or digital reconstruction; `O` means my observation of public screenshots or product pages on 2026-09-12. Values marked `O` are estimates, not hidden design tokens. Hex-to-OKLCH conversions and WCAG contrast ratios in this report are calculated values; they are not claims that the source product uses OKLCH internally.

## Findings

### 1. What makes these apps look expensive

The common feature is not a particular color or corner radius. It is a controlled hierarchy. These products spend their visual budget on a small number of surfaces, a clear density rhythm, real platform conventions and meaningful state changes. They do not make every object equally loud. Linear describes this in its 2026 refresh as “Structure should be felt not seen”: fewer separators, softer contrast and rounded edges [S1, P]. Raycast describes its redesign as fitting naturally into macOS Tahoe, and its technical account explains that the team kept native popovers, settings windows, cursors and interaction conventions rather than recreating a web dashboard [S2, P]. The pattern is relevant to sparring: the content lesson should be the visual priority, while the sidebar should be a quieter instrument panel.

The measurements below have two different statuses. A published color, type size or effect is identified as such. A sidebar width, row height, radius or screenshot color is an estimate made from current public screenshots at roughly 1440-pixel desktop proportions. Window size, display scale, OS theme, browser zoom and compression can move those observations by several pixels. None of the products publishes a complete token sheet containing all of the requested values.

#### 1.1 Linear

`P`: Linear's brand page publishes Mercury White `#F4F5F8` and Nordic Gray `#222326`, and describes its primary brand color as a subtle desaturated blue [S3]. Those are brand colors, not a complete application dark-theme specification. Linear's redesign article says it uses variables and LCH to generate custom themes and to reason about elevations including background, foreground, panels, dialogs and modals [S4, P]. Its public theme examples include Midnight with a near-black `#0F0F10` and a red accent `#D25E65`; the page does not document every tuple position as CSS token names, so only those visible values should be treated as verified.

`O`: the application reads as near-black charcoal rather than pure black, approximately `#0F1011` to `#17181A` across content and panels. I saw no evidence that the product's main ground is literal `#000000`. The sidebar is usually one quiet surface step darker than the main pane, with an estimated luminance contrast of roughly 1.05:1 to 1.12:1. Separation comes from position, type weight, selection fill and spacing more than from a visible border. Screenshot observation is approximately 240–264 pixels for the left rail, 32–36 pixels for compact navigation rows, 13–14 pixels for regular UI text and 6–8 pixels for most small controls. The type looks like a restrained sans close to Inter or a modified product sans, but I found no public Linear UI font-family or size specification. This is an observation, not a claim about the shipped font. The key expensive choice is that inactive navigation recedes without becoming unreadable, while the content pane gets the highest contrast and largest typographic moments [S1, O].

#### 1.2 Raycast

`P`: Raycast's press kit publishes `#151515` as its preferred dark background and `#202123` as an alternate dark background, with Brand Red `#FF6363` [S5]. Its theme documentation exposes background, primary text and support colors as user-editable theme roles, and its colors API says standard colors adapt to the active theme and can be contrast-adjusted [S6, S7, P]. Raycast's technical deep dive says the original app used AppKit and custom native components, while the newer architecture uses web technologies with native rendering; settings, popovers and tooltips remain native windows where appropriate, and the team deliberately avoided browser-like pointer and hover conventions [S2, P].

`O`: the launcher is a floating, centered surface rather than a persistent sidebar application. A typical panel is approximately 640–720 pixels wide, with 40–44-pixel result rows, 13–14-pixel UI type that reads as SF Pro or another macOS system sans, 8–16-pixel panel curvature and a very quiet hairline or no visible border. The dark panel is close to the published `#151515`; the surrounding desktop is not a product content pane, so sidebar width and sidebar-to-content contrast are not applicable. The expensive feeling comes from native-feeling focus, keyboard-first density, immediate filtering, a single dominant surface and the absence of ornamental dashboard furniture. Its 2026 redesign also adopts Apple's Liquid Glass selectively rather than turning every result into a glass card [S2, S8, O].

#### 1.3 Arc browser

`P`: Arc's public documentation describes Spaces as distinct browsing areas with their own sidebar, pinned and unpinned tabs, theme and icon, and allows light, dark or automatic appearance [S9, P]. It documents up to 12 Favorites at the top of a sidebar, with pinned and unpinned tabs below [S10, P]. Arc also allows a Space to use a color or gradient, which explains why its chrome can be chromatic without the content becoming a gradient composition [S11, P]. I found no public Arc UI token sheet for background hex values, border alpha, radius, font size or sidebar width.

`O`: the macOS sidebar is approximately 260–300 pixels at a 1440-pixel window, with roughly 30–34-pixel tab rows and selected-item curvature around 8–12 pixels. It reads as a translucent or tinted near-black material whose hue changes with the Space; the content pane remains the visual priority. Pane separation is low, roughly 1.05:1 to 1.15:1 luminance contrast, with the selected item and Space color doing most of the work. Type looks like the macOS system sans at roughly 12–14 pixels. These numbers are screenshot observations. The useful lesson is not to give every project in sparring a bright color; it is to let a project tint influence one bounded navigation layer while keeping lesson text neutral.

#### 1.4 Zed

`P`: Zed is the most inspectable product in this set. Its documented default UI font is `.ZedSans`, currently aliased to IBM Plex; the UI size defaults to 16 pixels and weight 400. Its documented editor font example is Berkeley Mono at 15 pixels, with a comfortable line-height ratio of 1.618 or a standard ratio of 1.3 [S12, S13, P]. The raw One Dark theme publishes exact eight-digit colors: `background #3B414DFF`, `surface.background #2F343EFF`, `elevated_surface.background #2F343EFF`, `element.background #2E343EFF`, `editor.background #282C33FF`, `panel.background #2F343EFF`, `border #464B57FF`, `border.variant #363C46FF`, `border.focused #47679EFF`, `text #DCE0E5FF`, `text.muted #A9AFBCFF` and `text.placeholder #878A98FF` [S14, P]. The theme builder exposes more than 200 color tokens across 16 UI categories and 10 syntax categories [S15, P].

`O`: the project panel is approximately 220–280 pixels wide, file or navigation rows are approximately 30–34 pixels, small control radii are 4–8 pixels and the UI resembles IBM Plex at 14–16 pixels in the compact portions of the product. Using Zed's published colors, the luminance contrast between `#282C33` editor background and `#2F343E` panel background is approximately 1.12:1. That is intentionally subtle: the editor surface is darker, the panel is lighter, and borders are structural rather than decorative. Zed is expensive because the surface hierarchy is systematic enough to support a large theme, not because it has a fashionable color.

#### 1.5 Warp

`P`: Warp's theme documentation defines `accent`, `cursor`, `background`, `foreground`, `details.darker`, `details.lighter` and 16 terminal colors as hex values [S16, S17, P]. Its theme-design article says the base is the 16-color ANSI system and that UI surfaces are created with a light overlay over the core text color for dark themes, or a black overlay for light themes [S18, P]. Warp documents a font type, weight, size and line-height setting; its default font is Hack and its default thin-stroke behavior is designed to prevent blur [S19, P]. Its block model visually groups a command and its output, and a failed command can receive a red block treatment and red side indicator [S20, P].

`O`: Warp has no persistent project sidebar in the ordinary terminal view, so sidebar width and sidebar-to-content contrast are not applicable. The relevant navigation surfaces are the top tabs, command palette and block gutters: approximately 40 pixels for tab or header rows, 48–64 pixels for block-side affordances, 12–16 pixels for floating-panel curvature and 13–15 pixels for terminal text. The default dark ground reads as near-black charcoal, but I found no official default background hex in the public theme documentation. The expensive move is semantic grouping: the block is a unit of work, not a card added for decoration.

#### 1.6 Things 3

`P`: Things 3.22, released for macOS 26 in September 2025, says its refreshed design adds more curvature to windows, to-dos, dialogs and controls, increases spacing, and lets a hint of color show through the glassy sidebar. Its buttons have a subtle glow and scale response; an older release documents 14 text sizes on Mac and vector icons that scale with the layout [S21, S22, S23, P]. Things' feature page explicitly describes smooth animation while avoiding distraction [S24, P]. I found no public numeric values for Things' backgrounds, alpha, radii or row heights.

`O`: the sidebar is approximately 240–260 pixels, ordinary rows are approximately 29–32 pixels, the system typeface is likely Apple's system sans at 12–15 pixels, and common control curvature is approximately 10–12 pixels. The sidebar-to-content contrast is low, about one macOS material step; separators are sparse or absent. The product feels expensive because the content hierarchy is calm and the glass is confined to navigation. This is especially relevant to sparring: a glass sidebar can establish the app's atmosphere without putting blur behind the instructional paragraphs where it would reduce reading clarity.

#### 1.7 Cron and Notion Calendar

`P`: Cron is now documented as Notion Calendar. Notion's official settings expose Auto, Light and Dark themes, interface scale and grid-density controls, while its calendar documentation identifies the sidebar calendars and the context panel as first-class parts of the desktop layout [S25, S26, P]. The Cron product page still provides a public reference screenshot for the earlier product [S27, P]. I found no public UI token specification for either product.

`O`: the left menu is approximately 220–250 pixels, the optional right context panel is approximately 280–320 pixels, and the navigation rows are around 32 pixels. The type resembles a system sans or Helvetica-like grotesk at about 12–14 pixels. In the dark reference, the outer chrome is near-black and the calendar grid is materially lighter, so its content contrast is much stronger than Linear's or Things' pane separation. Cron's older screenshot uses a restrained warm red-orange calendar accent rather than a neon developer blue. The product's expensive quality comes from density and alignment: a calendar is allowed to be a grid rather than being wrapped in cards.

#### 1.8 Superhuman

`P`: Superhuman's design writing says dark mode was designed for focus and flow, with the next action obvious and feedback immediate without distraction [S28, P]. Its Carbon update describes a dark, minimal visual language based on the metaphor of carbon fiber, with colors tuned for legibility [S29, P]. Its current product notes describe a higher-contrast theme with warmer colors, larger fonts and visual distinctions between mail and comments; its help documentation exposes Dark, Light and Match macOS modes [S30, S31, P]. I found no public numeric UI token sheet.

`O`: the left rail is approximately 230–260 pixels, rows are approximately 32 pixels, text is roughly 13–15 pixels in a system-like sans, curvature is about 6–10 pixels, and visible borders are minimal. The dark ground is warmer than blue-black, around `#151515` to `#1D1B1A` by eye. Pane separation is low, approximately 1.05:1 to 1.15:1, with selection, typography and task grouping carrying the hierarchy. Superhuman's useful lesson is that warm neutrals can support long reading sessions while still feeling technical.

#### 1.9 OpenAI Codex desktop app

`P`: OpenAI's February 2026 launch page describes Codex as a focused command center for projects, threads, parallel agents, worktrees, review diffs, skills and automations [S32, P]. Current OpenAI help says the desktop experience now has separate Chat, Work and Codex views on macOS and Windows, with a Codex view for local folders, repositories, terminals and developer tools [S33, S34, P]. The public launch and help material does not publish background tokens, borders, alpha values, radii, type families, type sizes, sidebar width or row heights.

`O`: public launch and current-product screenshots read as near-black charcoal rather than pure black, approximately `#151515` to `#1B1B1B`, with warm off-white and gray text, muted separators and small 6–10-pixel radii. The project/thread rail is approximately 240–280 pixels, with rows around 32–36 pixels. The content pane is only modestly lighter than the rail; the stronger contrast is between work states, thread grouping and the main task. Status colors are restrained green, amber and red rather than neon. These are observations of public screenshots, not OpenAI design tokens. The transferable idea is that the product looks like a serious work surface because it is organized around real work objects—projects, threads, diffs and agent states—not around generic AI decoration.

`P`: the open-source Codex CLI/TUI has a separate, more concrete style guide. It assigns default terminal foreground to primary content, dim text to secondary content, ANSI cyan to selection and status, ANSI green to success/additions, ANSI red to errors/failures/deletions and ANSI magenta to Codex, while advising against hardcoded black and white foregrounds [S70]. This is not evidence for the desktop app's hidden CSS, but it is a useful OpenAI precedent: semantic status color and the user's native theme are more durable than a fixed “AI” palette.

#### 1.10 The synthesis for sparring

Use one ground, two or three raised surfaces, one selection surface and one accent family. Give the sidebar a low-contrast material treatment and the lesson pane a stable, readable surface. A 240–272-pixel sidebar is a defensible starting range for a 1440-pixel window; at 1280 pixels, allow it to collapse toward 216–240 pixels. Use 32 pixels for ordinary navigation rows, 36–40 pixels for rows that include status or progress, and 44 pixels or more for primary interactive exercise controls. Use 14 pixels for ordinary navigation text, 16 pixels for lesson body text, 12 pixels only for metadata, and a monospace face only for code, keyboard shortcuts or literal identifiers. Start with 6 pixels for compact controls, 8 pixels for selected rows and 12 pixels for floating panels. The variation matters: every object should not have the same radius.

### 2. Glass and depth, done properly

The reliable construction is a stack, not a single `backdrop-filter` declaration. The base layer is an opaque or nearly opaque tinted ground. The sidebar is a partially transparent surface over that ground. The blur samples only what is behind the sidebar, not the text and controls inside it. A highlight and a restrained shadow then describe the panel edge. This is close to how the platform materials are specified: Apple says Liquid Glass is a distinct functional layer for controls and navigation such as sidebars and tab bars, and says not to use it throughout the content layer [S35, P]. Windows says Mica is an opaque, wallpaper-tinted base material for long-lived app surfaces, while Acrylic is semi-transparent and intended for transient surfaces [S36, S37, P].

For a CSS-first sidebar in sparring, a useful starting stack is:

```css
.sidebar {
  background: rgb(30 28 24 / 0.72);
  backdrop-filter: blur(20px) saturate(130%);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
  border-right: 1px solid rgb(255 255 255 / 0.06);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    12px 0 32px rgb(0 0 0 / 0.18);
}
```

The 20-pixel blur, 130 percent saturation, 72 percent fill, 6 percent border and 8 percent one-pixel top highlight above are implementation starting points for this app, not measured values from Linear, Things, Raycast or Codex. They are deliberately lower than the “frosted wallpaper” look. If the sidebar sits over project-specific colored artwork or a diagram, test `blur(16px) saturate(120%)`; if it sits over almost-flat content, increase the tint opacity rather than increasing blur. MDN's reference example uses `blur(4px) saturate(150%)`, which establishes valid syntax but is not a product recommendation [S38, P].

The one-pixel top highlight is useful because it catches a light edge without drawing a box around the panel. Use an actual `inset 0 1px 0` or a one-pixel top border, not a gradient that continues down the whole side. The outer shadow should separate overlapping windows or a floating inspector, not be used on every row. A 12–32-pixel shadow spread with black alpha around 0.14–0.24 is a sensible range for a panel; a sidebar attached to the window often needs no outer shadow at all. Keep the border hairline at 4–8 percent white on a dark neutral and test it against the actual adjacent pane. A border is not a substitute for a contrast-safe focus indicator.

I found no primary source for a specific grain/noise texture, noise opacity or blur radius in any of the nine named products. The shipping platform materials use compositor-controlled blur, tinting and adaptation rather than a documented noise recipe. If sparring needs to hide banding in a large translucent region, add a monochrome procedural noise layer at approximately 1–2 percent opacity, with no visible grain at normal reading distance. Treat it as a rendering fix, not as the source of character. Grain above approximately 3 percent will compete with code and lesson text, and grain animated over time is decorative motion.

The common failure is allowing the panel to become a translucent white card over a collection of luminous blobs. Impeccable, a design-quality project by Paul Bakaus, names “glassmorphism everywhere”, neon glows, blurred orbs and glow borders as decoration rather than a solution to a layering problem [S39, 2]. The correct question is “what is behind this layer and why should it remain perceptible?” For sparring, the answer is that the sidebar is a navigation layer over a calm local workspace; the lesson content should remain legible and should not be viewed through blur.

`backdrop-filter` has a real cost. WebKit's original explanation describes the pipeline as content behind the element, blur, then compositing, and warns that extra rendering passes, dynamic layouts and animations can be expensive [S40, P]. Keep the filtered area small, avoid nested filtered elements, avoid animating blur and avoid putting large scrolling or video surfaces behind several translucent layers. Animate opacity and a small transform for opening a panel; do not animate the blur radius from 0 to 40 pixels. Add an opaque fallback for reduced transparency, unsupported browsers and low-power devices.

Tauri makes this a platform choice. Tauri's current documentation says it uses WebView2 based on Chromium on Windows, WKWebView on macOS and WebKitGTK on Linux [S41, S42, P]. CSS `backdrop-filter` is therefore rendered by three different web engines, with different GPU/compositor behavior and different update cadences. WKWebView has mature WebKit backdrop-filter support; WebView2 has a current Chromium surface; WebKitGTK is improving but varies more by distribution and compositor. The practical rule is to test a real packaged build on each target and keep the solid layer visually correct without blur. `@supports (backdrop-filter: blur(1px))` can select the enhancement, but it cannot guarantee that the compositor will be fast or that a remote desktop session will preserve it.

Native effects are available, but they are not one portable Tauri API. On macOS, AppKit's `NSVisualEffectView` provides translucency and vibrancy, with `NSVisualEffectMaterial.sidebar` and a choice between `.behindWindow` and `.withinWindow` blending [S43, S44, S45, P]. Tauri's `window-vibrancy` crate exposes `apply_vibrancy` for macOS materials and, on macOS 26 or newer, `apply_liquid_glass`; its example `LiquidGlassOptions` includes a 26.0-pixel radius, which is an API example rather than an Apple design token. The Liquid Glass path requires the macOS private API feature, a transparent window and a transparent HTML body, and should be treated as an optional enhancement because private API use can affect App Store acceptance [S46, P].

On Windows, the same Tauri crate exposes `apply_mica`, `apply_acrylic` and `apply_blur`. The native Windows names are Mica, Desktop Acrylic and blur, but the strongest official guidance comes from Windows App SDK: Mica is opaque and optimized for long-lived base layers, Acrylic is translucent and for transient surfaces, and all system materials have solid fallbacks when transparency is disabled, the compositor is unavailable, the device is underpowered or Battery Saver is active [S36, S37, P]. The Windows App SDK APIs are `Window.SystemBackdrop`, `MicaBackdrop`, `DesktopAcrylicBackdrop`, `SystemBackdropElement`, `MicaController` and `DesktopAcrylicController`; a Tauri application does not automatically become a WinUI 3 application, so use the Tauri effect wrapper or a native plugin if you need those semantics [S36, S37, P].

On Linux, the Tauri `window-vibrancy` project explicitly does not support native window vibrancy because the compositor and desktop environment own the effect [S46, P]. CSS blur inside WebKitGTK can still be used where supported, but it is not a substitute for a universal Linux window material. Use the same opaque fallback on Linux, and consider a low-opacity tinted sidebar with a hairline edge rather than promising OS blur. This asymmetry is a reason to make the material tasteful but non-essential.

### 3. Natural palettes with real values

Natural color systems are valuable here because they provide names, history and relationships rather than only a color wheel. They also come with an important warning: paint, dye, mineral and historical color references are not exact screen standards. A screen token is a deliberate digital interpretation of a material story.

Farrow & Ball's Colour by Nature project is the strongest bridge between paint and Werner. The Natural History Museum says Farrow & Ball used a spectrophotometer to read 16 colors from Werner's nomenclature for its Colour by Nature palette [S47, P]. That gives the palette provenance, but it does not make a web hex value exact. Digital color sites give approximate screen values; for example, Railings is commonly represented secondarily as approximately `#45484B`, but this should not be treated as the paint's physical color [S48, 2]. Railings is useful as a near-black, softened blue-gray reference, not as a claim about a CSS token.

The Japanese traditional color references are richer in names than in measurement certainty. Colordic lists 465 Japanese traditional colors and provides representative hex values; examples include Rikyū-iro `#8F8667`, Sabiasagi `#5C9291`, Kogare brown `#8D6449`, Tsuchi earth `#BC763C`, Bengara red `#8F2E14` and Moegi green `#006E54` [S49, 2]. The Japanese Colors reference explains that historical dye values are approximations and that sources disagree because the original colors were not specified as modern display colors [S50, 2]. These colors make good semantic accents because their names describe an object, material or dye, and their low-to-moderate chroma is kinder to a dark reading surface.

Werner's Nomenclature of Colours began with 54 mineralogical colors and was expanded by Patrick Syme in 1814 to 108 colors with animal, plant and mineral examples; Darwin used it on the Beagle. The Natural History Museum describes the system and its later painted charts, and notes that Farrow & Ball re-measured 16 of the colors for modern paint [S47, P]. A digital reconstruction warns that the original plates have aged and that the displayed colors are approximate [S51, 2]. Werner is therefore excellent for naming semantic roles such as Ash Grey, Greenish Grey, Velvet Black, Vandyke Brown and Sienna, but it is not a source for exact WCAG-safe web hex values.

Sanzo Wada's system is more useful for interface relationships. The publisher describes Wada's 1930s work as 348 color combinations arranged to study visual perception and form [S52, P]. The Wada digital reference records 586 colors and 581 combinations, states that Wada charts always presented colors in pairs, and publishes hex, RGB, CMYK and LAB conversions [S53, 2]. Useful dark-interface source swatches include Black `#111314`, Deep Slate Olive `#253122`, Slate Color `#34454C`, Artemesia Green `#709390`, Dusky Green `#004F46`, Strong Yellow Green `#7E9F2E`, Burnt Sienna `#AE5224` and Mineral Gray `#A2B0AD` [S54, 2]. The pairing principle is directly useful: use an earth or mineral neutral for the ground and reserve a related green, sienna or yellow-green for a named state or project accent.

Mineral and earth pigment references give the most defensible material story for a dark application. Natural Pigments describes ochres, siennas, umbers and green earth as stable, subdued colors with restrained chroma and mineral qualities, and describes an earth palette as harmonious through relative values and related hues [S55, P]. Do not imitate a tube of paint with a glowing brown interface. Take the useful property instead: low chroma, coherent value steps and accents that feel like oxide, lichen, clay, ash or verdigris.

For a technical modern baseline, Tailwind's current color documentation publishes its ramps in OKLCH. It gives, among others, Gray-950 as `oklch(0.13 0.028 261.692)`, Stone-950 as `oklch(0.147 0.004 49.25)`, Olive-950 as `oklch(0.153 0.006 107.1)` and Mist-950 as `oklch(0.148 0.004 228.8)` [S56, P]. The corresponding approximate sRGB hex values are `#030712`, `#0C0A09`, `#0C0C09` and `#090B0C`. This is a good technical demonstration of hue-controlled near-blacks, but it is not a sufficient product story by itself. Linear's use of LCH for theme generation is another reason to keep the sparring token source in OKLCH even if the initial implementation emits hex or `color(display-p3 ...)` later [S4, P].

The following candidate sets are complete starting systems. `surface-1` is the sidebar or quiet raised surface; `surface-2` is a selected, focused or exercise surface. Border is the nominal color before applying the alpha in the component. Text contrast is calculated against `ground`; all text tones are intended for normal-size text. The accent values can be graphical indicators or fills; if an accent is used as text, use the pass/fail note rather than assuming that every vivid color is readable.

#### 3.1 Wada mineral night

Story: Wada's Black, deep slate olive, mineral gray, yellow-green and burnt sienna become a night field of stone and oxidized pigment. The ground and accents use published Wada digital values; the two intermediate surfaces and text tones are derived screen tokens.

`ground` `#111314` / `oklch(0.185 0.004 229.0)`; `surface-1` `#1A1F1D` / `oklch(0.233 0.008 169.6)`; `surface-2` `#232B25` / `oklch(0.279 0.016 152.9)`; `border` `#42533E` / `oklch(0.421 0.040 139.7)`; `text-primary` `#EFF3EE` / `oklch(0.960 0.008 139.4)`; `text-secondary` `#C2CEC5` / `oklch(0.840 0.018 153.5)`; `text-muted` `#94A39A` / `oklch(0.701 0.021 159.5)`; `accent-oxide` `#AE5224` / `oklch(0.546 0.134 44.5)`; `accent-growth` `#7E9F2E` / `oklch(0.656 0.143 124.5)`.

Calculated contrast against `ground`: primary 16.61:1, secondary 11.47:1, muted 7.07:1 and growth accent 6.11:1, all WCAG AA for normal text. Oxide accent is 3.58:1 and fails normal-size AA; use it for a mark, underline, border or large label, or lighten it before using it as text. The background-to-surface ratios are intentionally small: surface-1 is 1.12:1 and surface-2 is 1.28:1 against the ground.

#### 3.2 Rikyū ash

Story: Rikyū-iro and Sabiasagi make the application feel like ash, aged paper and oxidized water rather than a developer-blue dashboard. The direction borrows Japanese traditional color names and their low-chroma relationships, while the dark neutrals are derived for a display surface.

`ground` `#171714` / `oklch(0.203 0.006 106.9)`; `surface-1` `#22231D` / `oklch(0.253 0.011 114.9)`; `surface-2` `#2D2E26` / `oklch(0.297 0.014 113.0)`; `border` `#5C6052` / `oklch(0.481 0.022 120.2)`; `text-primary` `#F1EFE7` / `oklch(0.951 0.011 95.2)`; `text-secondary` `#CBC8BA` / `oklch(0.831 0.019 96.9)`; `text-muted` `#A3A193` / `oklch(0.707 0.020 100.3)`; `accent-rikyu` `#8F8667` / `oklch(0.620 0.046 93.8)`; `accent-sabiasagi` `#5C9291` / `oklch(0.622 0.057 194.3)`.

Calculated contrast against `ground`: primary 15.60:1, secondary 10.70:1, muted 6.91:1, Rikyū accent 4.94:1 and Sabiasagi accent 5.11:1. All five pass WCAG AA for normal text. Surface-1 is 1.13:1 and surface-2 is 1.31:1 against the ground. This is the quietest direction and the easiest to pair with a glass sidebar because the palette does not rely on a bright accent to create hierarchy.

#### 3.3 Werner earth

Story: ash gray, umber, sienna and green earth are translated into a dark cabinet of natural-history specimens. The palette does not pretend to reproduce Werner's aged plates; it uses the historical names as a semantic vocabulary and the pigment references as a chroma constraint.

`ground` `#151311` / `oklch(0.188 0.005 67.5)`; `surface-1` `#211C17` / `oklch(0.230 0.012 67.2)`; `surface-2` `#2D251D` / `oklch(0.271 0.019 66.9)`; `border` `#6A5A4A` / `oklch(0.479 0.032 66.9)`; `text-primary` `#F4ECE0` / `oklch(0.946 0.018 78.2)`; `text-secondary` `#CABFAE` / `oklch(0.809 0.026 78.9)`; `text-muted` `#A0917F` / `oklch(0.665 0.031 72.3)`; `accent-sienna` `#C07B42` / `oklch(0.644 0.113 58.4)`; `accent-green-earth` `#77895F` / `oklch(0.604 0.064 127.1)`.

Calculated contrast against `ground`: primary 15.82:1, secondary 10.21:1, muted 6.05:1, sienna 5.43:1 and green earth 4.88:1. All pass WCAG AA for normal text. Surface-1 is 1.10:1 and surface-2 is 1.23:1 against the ground. The argument for this set is that it gives sparring a clear, memorable visual metaphor without requiring an illustration or a novelty font.

### 4. Motion that is not decoration

The learning evidence is not “animation is good” or “animation is bad”. It is that dynamic information helps when the movement carries an essential relation, and it costs attention when it adds a second task. Mayer's coherence principle reports a median effect around 0.86 for removing extraneous material across 16 of 16 tests in the cited multimedia-learning synthesis [S57, P]. That is evidence for restraint, not a ban on motion.

The strongest directly relevant meta-analysis is Höffler and Leutner's comparison of instructional animation with static pictures: 26 primary studies, 76 comparisons and an overall effect of `d = 0.37`. The effect was larger when animation was representational rather than decorative, `d = 0.40`, and much larger for procedural-motor knowledge, `d = 1.06`; the authors also found a larger effect for realistic video, `d = 0.76` [S58, P]. A later meta-analysis of 61 studies and 140 comparisons found a smaller overall benefit, `g = 0.226`, with stronger effects when animation was system-paced, `g = 0.309`, paired with auditory commentary, `g = 0.336`, or used without accompanying text, `g = 0.883` [S59, P]. The difference between these results is a warning against selling “animation” as a universal learning intervention.

Attention is the mechanism to design around. A study of animated instruction found that cueing reduced extraneous cognitive load and improved comprehension of high-element-interactivity material, while retention of isolated elements improved with or without cueing [S60, P]. In sparring, a moving highlight should tell the learner which function, dependency edge or state transition to inspect. A decorative shimmer behind the same lesson adds no such instruction.

Motion that carries meaning in this app includes a code path revealing itself in execution order, an edge in a dependency diagram highlighting as the explanation reaches it, an answer moving from “unseen” to “reviewed”, a selected topic retaining its spatial identity as the lesson changes, an exercise result changing from pending to correct, and a panel entering from the side that it logically belongs to. Decorative motion includes infinite background drift, parallax behind text, a bounce on every hover, gradient text, identical staggered fades for every list item and an animated grain texture. A useful test is whether a learner can state what the movement means after the motion stops. If not, remove it or make it a one-time, user-triggered affordance.

For craft, the public platform values are more concrete than individual product token sheets. Material's desktop guidance recommends simpler, faster transitions of 150–200 milliseconds, the standard curve `cubic-bezier(0.4, 0.0, 0.2, 1)`, and longer durations only when distance or surface change makes them necessary [S61, P]. Tailwind's current utility documentation publishes `--ease-fluid: cubic-bezier(0.3, 0, 0, 1)` and `--ease-snappy: cubic-bezier(0.2, 0, 0, 1)` [S62, P]. Apple's current UIKit spring method defaults to a spring duration of 0.5 seconds, bounce 0, initial velocity 0 and no delay [S63, P]. Motion's documented physics defaults are stiffness 100, damping 10 and mass 1, with duration-based springs exposing a bounce value whose default is 0.25 [S64, P]. These are framework or platform defaults, not proof that every named product uses them.

A concrete starting motion scale for sparring is: 100–140 milliseconds for hover, press, selection-color or focus changes; 180–220 milliseconds for a sidebar or inspector panel entering over no more than 24 pixels; 150–200 milliseconds for a short state change such as “checking” to “correct”; 260–360 milliseconds for a list reorder or a diagram edge settling into a new route; and 400–500 milliseconds only for a large, user-requested lesson transition. Use a critically damped or nearly critically damped spring for panels and selection, approximately `stiffness 400–600`, `damping 32–42`, `mass 0.8–1.0` in Motion-style units, with no visible overshoot. Use a lower-stiffness spring only for a learner-controlled reorder or draggable diagram where physicality is part of the task. The numeric spring range is an implementation recommendation; the cited shipping framework values are the verified comparison points.

Reduce Motion is a behavior contract, not only a media query. WCAG 2.2 Success Criterion 2.3.3 is Level AAA and says motion animations triggered by interaction must be disableable unless essential to function or the information being conveyed [S65, P]. W3C's C39 technique recommends `prefers-reduced-motion: reduce` and says to suppress or change interaction-triggered motion [S66, P]. Apple's 2026 reduced-motion evaluation guidance specifically calls out scaling, spinning, multi-axis motion, parallax, animated blur and depth-of-field, and says that meaningful status or hierarchy motion should be replaced with a dissolve, highlight fade or color shift rather than simply removed [S67, P].

For sparring, `reduce` should disable blur animation, parallax, spring overshoot, diagram camera movement, background drift and list staggering. Keep instantaneous selection, a short opacity fade, a stable focus ring, a color or icon change and a static before/after state. The lesson must remain understandable without the animation; provide a “play explanation” control if the movement itself is the instructional object. Also honor the OS's reduced-transparency setting where available, because a glass sidebar and a reading interface should have an opaque fallback.

### 5. What looks generated

The most credible recent design writing describes “AI slop” as a lack of authorship rather than a single bad component. Product designer Kosta Canatselis identifies Inter used without an additional typographic decision, purple-to-blue gradients, generic headlines, identical padding/radius/card heights, missing empty/loading/error states, and layouts that show every possible action at once [S68, 2]. Paul Bakaus lists the same family of anti-patterns more bluntly: cardocalypse, massive rounded icon tiles, thick colored side borders, lazy glassmorphism, neon or cyan-on-dark, monospace used as a hacker stereotype, gradients and elastic animations used for impact, and modal-first layouts [S69, 2]. Impeccable turns these into a larger catalog and explicitly names purple/violet gradients, cyan-on-dark, neon glow, glass everywhere, rounded rectangles with generic shadows, Inter/Geist/Roboto/Space Grotesk defaults, flat type hierarchy, gradient text, side-tab accent borders and meaningless sparklines [S39, 2]. These are secondary designer sources, not controlled studies; they are useful because they describe a recognizable 2025–2026 production pattern and give concrete negative constraints.

For sparring, do not use a purple-to-blue or blue-to-cyan gradient as the identity, especially not behind a headline or on every button. Do not use a centered hero, three identical feature cards, six icon tiles, a 9999-pixel pill radius or the same 16-pixel radius on every object. Do not make the sidebar, lesson, exercise, progress card and settings panel all separate rounded cards with their own shadows. Do not put a thick colored stripe on the side of every warning, topic or exercise; use a small semantic marker or a state icon. Do not use monospace for every label just to say “developer”. Do not animate every hover, stagger every list row or add a glowing shadow to imply intelligence.

Do not ship only the populated demo. Sparring needs authored empty, loading, offline, parse-error, no-exercise, answer-submitted, answer-revealed and stale-repository states. Do not make every possible control visible at once; progressive disclosure is particularly important in a learning interface because the learner needs to know what to inspect. Do not use low-contrast gray text on a colored surface merely because it looks soft. Do not let a glass effect sit behind long lesson paragraphs. Do not ask a modal to hold a multi-step exercise or a long settings form. Do not rely on an accent color alone to distinguish correct, incorrect, pending or stale; pair color with text, iconography and shape.

The positive antidote is specific authorship. Use one named natural-color story and expose its semantics in tokens such as `oxide`, `ash`, `growth`, `warning` and `focus`, rather than `gradient-start` and `gradient-end`. Use a typographic decision: a readable system or product sans for the interface, a code face for code, and a clearly different size or weight for lesson headings. Make the layout asymmetric only where the information architecture is asymmetric. Let real objects—repository, branch, file path, symbol, topic, exercise, attempt, evidence—determine the components. Use one signature behavior, such as a dependency path that highlights in reading order, and repeat it consistently. Stop after each generated surface and inspect it in an empty state, at narrow width, with keyboard focus and with reduced motion. The “expensive” part is the judgment loop, not another decorative layer.

## Claims I could not verify

I could not find a primary, public design-token document for Linear's application UI, Raycast's complete dark theme, Arc's sidebar dimensions, Warp's default dark palette, Things 3's exact glass parameters, Cron/Notion Calendar's radii or Superhuman's color tokens. The values in those cases are screenshot observations and are labelled as such.

I could not verify a public blur radius, saturation value, noise opacity, shadow recipe or one-pixel top-highlight value used by Raycast, Things 3, Arc, Linear or Codex. Apple's Liquid Glass, AppKit vibrancy, Windows Mica/Acrylic and Warp's blur controls are real platform or product effects, but they do not publish the CSS-equivalent numeric recipe a webview implementation would need.

I could not verify that the OpenAI Codex desktop app uses a particular font family, a particular exact near-black, or a particular sidebar width. OpenAI's current documentation describes the product's work objects and platform availability, not its design tokens.

I could not verify any claim that a named shipping desktop product uses an animated grain layer. Grain values in this report are implementation recommendations only.

I could not verify a screen-exact hex value for Werner's historical swatches, Farrow & Ball paint, Japanese dyes or the original Sanzo Wada plates. Digital hex values for those systems are reconstructions or approximations; they should be treated as story references and tested on the target display.

I could not verify that a specific commercial app uses the spring stiffness and damping values recommended above. The cited numeric springs come from Apple UIKit, Motion and Jetpack Compose documentation; the sparring ranges are an engineering starting point to tune against real interaction recordings.

The animation-learning effect sizes do not establish that adding more interface animation improves retention. They compare particular instructional animations with particular static controls and vary by representational content, pacing, cueing, prior knowledge, assessment and context. The product decision should therefore be to animate the causal or navigational relation being taught, not to maximize motion.

## Sources

1. Linear, “Behind the latest design refresh,” https://linear.app/now/behind-the-latest-design-refresh
2. Raycast, “A technical deep dive into the new Raycast,” https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast
3. Linear, “Brand guidelines,” https://linear.app/brand
4. Linear, “How we redesigned the Linear UI,” https://linear.app/now/how-we-redesigned-the-linear-ui
5. Raycast, “Press kit,” https://www.raycast.com/press
6. Raycast, “Themes,” https://manual.raycast.com/themes
7. Raycast Developers, “Colors,” https://developers.raycast.com/api-reference/user-interface/colors
8. Raycast, “The new Raycast,” https://www.raycast.com/blog/the-new-raycast
9. Arc, “Spaces: Distinct Browsing Areas,” https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas
10. Arc, “Favorites: Top Tabs Across Every Space,” https://resources.arc.net/hc/en-us/articles/19230755904151-Favorites-Top-Tabs-Across-Every-Space
11. Arc, “Paint the internet,” https://start.arc.net/paint-the-internet
12. Zed, “Visual customization,” https://zed.dev/docs/visual-customization
13. Zed, “All settings,” https://zed.dev/docs/reference/all-settings
14. Zed Industries, “One Dark theme source,” https://raw.githubusercontent.com/zed-industries/zed/main/assets/themes/one/one.json
15. Zed, “Theme builder,” https://zed.dev/blog/theme-builder
16. Warp, “Custom themes,” https://docs.warp.dev/terminal/appearance/custom-themes
17. Warp, “How we designed themes for the terminal,” https://www.warp.dev/blog/how-we-designed-themes-for-the-terminal-a-peek-into-our-process
18. Warp, “Size, opacity and blurring,” https://docs.warp.dev/terminal/appearance/size-opacity-blurring
19. Warp, “Text, fonts and cursor,” https://docs.warp.dev/terminal/appearance/text-fonts-cursor
20. Warp, “Block basics,” https://docs.warp.dev/terminal/blocks/block-basics
21. Cultured Code, “Things 3.22 and macOS 26,” https://culturedcode.com/things/blog/
22. Cultured Code, “Things release notes,” https://culturedcode.com/things/support/articles/1100684/
23. Cultured Code, “Things big and small,” https://culturedcode.com/things/blog/2023/09/things-big-and-small/
24. Cultured Code, “Things features,” https://culturedcode.com/things/features/
25. Notion, “Notion Calendar settings,” https://www.notion.com/help/notion-calendar-settings
26. Notion, “Manage your calendars and events,” https://www.notion.com/help/manage-your-calendars-and-events
27. Cron, “The next-generation calendar,” https://www.cron.com/
28. Superhuman, “Improve productivity through design,” https://blog.superhuman.com/improve-productivity-through-design-digital/
29. Superhuman, “Carbon 2.0,” https://new.superhuman.com/carbon-2-0-91173
30. Superhuman, “Product updates,” https://new.superhuman.com/
31. Superhuman Help, “Theme,” https://help.superhuman.com/hc/en-us/articles/46005763646093-Theme
32. OpenAI, “Introducing the Codex app,” https://openai.com/index/introducing-the-codex-app/
33. OpenAI Help, “The new ChatGPT desktop app,” https://help.openai.com/en/articles/20001276
34. OpenAI Help, “Using Codex in the ChatGPT desktop app,” https://help.openai.com/en/articles/20001275
35. Apple Developer, “Materials,” https://developer.apple.com/design/human-interface-guidelines/materials
36. Microsoft Learn, “System backdrops (Mica/Acrylic),” https://learn.microsoft.com/en-us/windows/apps/develop/ui/system-backdrops
37. Microsoft Learn, “Materials overview,” https://learn.microsoft.com/en-us/windows/apps/develop/ui/materials
38. MDN, “backdrop-filter,” https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
39. Impeccable, “Slop,” https://subclaude.com/slop/
40. WebKit, “Introducing backdrop filters,” https://webkit.org/blog/3632/introducing-backdrop-filters/
41. Tauri, “Process model,” https://v2.tauri.app/concept/process-model/
42. Tauri, “Webview versions,” https://v2.tauri.app/reference/webview-versions/
43. Apple Developer, “NSVisualEffectView,” https://developer.apple.com/documentation/AppKit/NSVisualEffectView
44. Apple Developer, “NSVisualEffectView.Material.sidebar,” https://developer.apple.com/documentation/appkit/nsvisualeffectview/material-swift.enum/sidebar
45. Apple Developer, “NSVisualEffectView.BlendingMode,” https://developer.apple.com/documentation/appkit/nsvisualeffectview/blendingmode-swift.property
46. Tauri Apps, “window-vibrancy,” https://github.com/tauri-apps/window-vibrancy
47. Natural History Museum, “Nature's colours: from page to paint,” https://www.nhm.ac.uk/discover/natures-colours-page-paint.html
48. Plan-home, “Farrow & Ball Railings,” https://www.plan-home.com/color/railings
49. ColorDic, “Japanese traditional colors,” https://www.colordic.org/w
50. Japanese Colors, “About the colors,” https://japanesecolors.com/about/
51. C82, “Werner's Nomenclature of Colours,” https://www.c82.net/werner/
52. Seigensha, “Sanzo Wada's Dictionary of Color Combinations,” https://en.seigensha.com/catalog/seigensha_en_catlog.pdf
53. Wada Sanzo Colors, “About,” https://www.wada-sanzo-colors.com/about
54. Wada Colors, “Colors,” https://wscolors.com/colors
55. Natural Pigments, “Earth color palette,” https://naturalfeb24upgrade.naturalpigments.ca/artist-materials/painting-earth-color-palette
56. Tailwind CSS, “Colors,” https://tailwindcss.com/docs/colors
57. Cambridge University Press, “Principles for reducing extraneous processing in multimedia learning,” https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E
58. Höffler and Leutner, “Instructional animation versus static pictures: A meta-analysis,” https://doi.org/10.1016/j.learninstruc.2007.09.013
59. Berney and Bétrancourt, “Does animation enhance learning? A meta-analysis,” https://doi.org/10.1016/j.compedu.2016.06.005
60. “The attention-guiding effect and cognitive load in the comprehension of animations,” https://www.sciencedirect.com/science/article/abs/pii/S0747563210001469
61. Material Design, “Duration and easing,” https://m1.material.io/motion/duration-easing.html
62. Tailwind CSS, “Functions and directives,” https://tailwindcss.com/docs/functions-and-directives
63. Apple Developer, “UIView.animate(springDuration:bounce:initialSpringVelocity:delay:options:animations:completion:),” https://developer.apple.com/documentation/uikit/uiview/animate%28springduration%3Abounce%3Ainitialspringvelocity%3Adelay%3Aoptions%3Aanimations%3Acompletion%3A%29
64. Motion, “React transitions,” https://motion.dev/docs/react-transitions
65. W3C, “Web Content Accessibility Guidelines 2.2,” https://www.w3.org/TR/WCAG22/
66. W3C WAI, “C39: Using the CSS prefers-reduced-motion query,” https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html
67. Apple Developer, “Reduced Motion evaluation criteria,” https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria
68. Kosta Canatselis, “Spot the Slop: A UI Designer's Guide to Fixing AI Defaults,” https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c
69. Paul Bakaus, “AI slop design tells,” https://www.linkedin.com/posts/paulbakaus_ai-slop-design-tells-design-anti-patterns-activity-7416272383017164800-10DR
70. OpenAI Codex, “TUI style guide,” https://github.com/openai/codex/blob/main/codex-rs/tui/styles.md

## Three directions

### 1. Wada Mineral Night

Story: a night study room built from Wada's black, slate olive, mineral gray, yellow-green and burnt sienna. The sidebar is a tinted glass instrument panel with a restrained green cast; the lesson pane is a stable dark field. Use a nearly static glass treatment, one-pixel top highlight, no visible grain by default, and oxide only for warnings or changes that need warmth.

Token set: `ground` `#111314` / `oklch(0.185 0.004 229.0)`; `surface-1` `#1A1F1D` / `oklch(0.233 0.008 169.6)`; `surface-2` `#232B25` / `oklch(0.279 0.016 152.9)`; `border` `#42533E` / `oklch(0.421 0.040 139.7)`; `text-primary` `#EFF3EE` / `oklch(0.960 0.008 139.4)`; `text-secondary` `#C2CEC5` / `oklch(0.840 0.018 153.5)`; `text-muted` `#94A39A` / `oklch(0.701 0.021 159.5)`; `accent-oxide` `#AE5224` / `oklch(0.546 0.134 44.5)`; `accent-growth` `#7E9F2E` / `oklch(0.656 0.143 124.5)`. Text contrast against ground is 16.61:1, 11.47:1 and 7.07:1 for the three text tones. Growth passes at 6.11:1; oxide fails normal-text AA at 3.58:1.

The strongest argument against it is that the yellow-green accent is distinctive but can make correctness, progress and “AI activity” look too similar if the semantic mapping is not disciplined.

### 2. Rikyū Ash Glass

Story: the quietest and most native-feeling direction: ash, aged paper and oxidized water, using Rikyū-iro and Sabiasagi as named accents. The sidebar receives the glass treatment; the lesson pane is almost opaque. Use a low-chroma project tint, no gradient, no shadow on ordinary rows, and motion based on color change and spatial continuity rather than bounce.

Token set: `ground` `#171714` / `oklch(0.203 0.006 106.9)`; `surface-1` `#22231D` / `oklch(0.253 0.011 114.9)`; `surface-2` `#2D2E26` / `oklch(0.297 0.014 113.0)`; `border` `#5C6052` / `oklch(0.481 0.022 120.2)`; `text-primary` `#F1EFE7` / `oklch(0.951 0.011 95.2)`; `text-secondary` `#CBC8BA` / `oklch(0.831 0.019 96.9)`; `text-muted` `#A3A193` / `oklch(0.707 0.020 100.3)`; `accent-rikyu` `#8F8667` / `oklch(0.620 0.046 93.8)`; `accent-sabiasagi` `#5C9291` / `oklch(0.622 0.057 194.3)`. Text contrast against ground is 15.60:1, 10.70:1 and 6.91:1. Rikyū passes at 4.94:1 and Sabiasagi at 5.11:1.

The strongest argument against it is that the low-chroma palette may feel too quiet during the first-run experience; sparring will need excellent selection, focus and exercise-result states so the app does not read as inert.

### 3. Werner Earth Cabinet

Story: a natural-history cabinet translated into a software learning tool. The product has ash, umber, sienna and green-earth roles, and a dependency diagram can feel like a specimen map rather than a neon network graph. Use an opaque lesson surface, a 16–20-pixel CSS blur only on the sidebar, and a small warm top highlight. Sienna can identify a changed or risky path; green earth can identify a verified or understood path.

Token set: `ground` `#151311` / `oklch(0.188 0.005 67.5)`; `surface-1` `#211C17` / `oklch(0.230 0.012 67.2)`; `surface-2` `#2D251D` / `oklch(0.271 0.019 66.9)`; `border` `#6A5A4A` / `oklch(0.479 0.032 66.9)`; `text-primary` `#F4ECE0` / `oklch(0.946 0.018 78.2)`; `text-secondary` `#CABFAE` / `oklch(0.809 0.026 78.9)`; `text-muted` `#A0917F` / `oklch(0.665 0.031 72.3)`; `accent-sienna` `#C07B42` / `oklch(0.644 0.113 58.4)`; `accent-green-earth` `#77895F` / `oklch(0.604 0.064 127.1)`. Text contrast against ground is 15.82:1, 10.21:1 and 6.05:1. Sienna passes at 5.43:1 and green earth at 4.88:1.

The strongest argument against it is that the warmth can pull the product toward a note-taking or editorial tool and away from a sharp developer workbench; code syntax and status semantics must remain cooler and more precise inside the warm shell.
