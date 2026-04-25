# PEG Shared Background Component

A reusable animated background component for PEG overlays with floating boxes that move only on the Y-axis and alternate boxes flipped along the Y-axis.

## Features

- **6 animated floating boxes** with PEG color palette
- **Y-axis only movement** (no X-axis movement or rotation)
- **Alternate boxes flipped** (boxes 2, 4, and 6 are mirrored along Y-axis)
- **Accessibility aware** - respects `prefers-reduced-motion`
- **Easy to use** - auto-initializes or can be manually controlled
- **Reusable** - can be used in any PEG overlay

## Files

- `background.css` - Styles for the background component
- `background.js` - JavaScript for animation and control
- `example.html` - Example usage

## Usage

### 1. Include the CSS

Add to your overlay's CSS file:
```css
@import url('../shared/background.css');
```

Or link directly in HTML:
```html
<link rel="stylesheet" href="../shared/background.css">
```

### 2. Add HTML Structure

```html
<div id="peg-bg-scene" class="peg-background" aria-hidden="true">
    <!-- Box 1: Dark Blue -->
    <div class="peg-float-box peg-box-one" data-speed="0.20" data-phase="0.1" data-ay="12">
        <svg viewBox="0 0 617.33331 478.064">
            <path d="m 0,0 v 0 c 0,7.866 -6.377,14.242 -14.242,14.242 h -133.86 c -7.866,0 -14.242,-6.376 -14.242,-14.242 0,-7.866 -6.377,-14.242 -14.242,-14.242 h -27.351 c -7.865,0 -14.242,-6.377 -14.242,-14.242 v -301.579 c 0,-7.867 6.377,-14.243 14.242,-14.243 h 434.516 c 7.866,0 14.242,6.376 14.242,14.243 v 301.579 c 0,7.865 -6.376,14.242 -14.242,14.242 H 14.241 C 6.376,-14.242 0,-7.866 0,0"/>
        </svg>
    </div>
    <!-- Add boxes 2-6 similarly -->
</div>
```

### 3. Load the JavaScript

Add to your overlay's JavaScript:
```javascript
// Load shared background component
const backgroundScript = document.createElement('script');
backgroundScript.src = '../shared/background.js';
document.head.appendChild(backgroundScript);
```

Or load directly in HTML:
```html
<script src="../shared/background.js"></script>
```

## Box Configuration

Each box has data attributes for customization:

- `data-speed` - Animation speed (default: 0.2)
- `data-phase` - Animation phase offset (default: index-based)
- `data-ay` - Y-axis amplitude (default: 14px)

## Colors and Z-index

Boxes use PEG color palette and have proper z-index ordering:

1. `peg-box-one` - Dark Blue (#5a9cb5), z-index: 1
2. `peg-box-two` - Yellow (#face68), z-index: 2, flipped
3. `peg-box-three` - Orange (#faac68), z-index: 3
4. `peg-box-four` - Coral (#fa6868), z-index: 4, flipped
5. `peg-box-five` - Coral (#fa6868), z-index: 5, opacity: 0.96
6. `peg-box-six` - Light Blue (#8bbed0), z-index: 6, flipped

## JavaScript API

The component auto-initializes when it finds `#peg-bg-scene`. You can also control it manually:

```javascript
// Create instance
const bg = new PEGBackground('peg-bg-scene');

// Start animation
bg.startAnimation();

// Stop animation
bg.stopAnimation();

// Destroy instance
bg.destroy();
```

## Example

See `example.html` for a complete working example.

## Integration with Existing Overlays

The `startingsoon` and `thanksforwatching` overlays have already been updated to use this shared component. To update other overlays:

1. Remove existing background CSS and JavaScript
2. Follow the usage instructions above
3. Ensure your content has appropriate z-index values (content should be > 6)