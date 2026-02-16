# Custom ESLint Rules

This directory contains custom ESLint rules for the project.

## no-inline-script

This rule prevents the use of inline script tags in HTML files. Inline scripts can pose security risks and violate Content Security Policy (CSP) directives.

### Examples

❌ **Bad** - These will trigger the rule:
```html
<!-- Inline JavaScript code -->
<script>
  console.log("This is inline JavaScript");
</script>

<!-- Inline JSON-LD structured data -->
<script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "Organization"}
</script>
```

✅ **Good** - These are fine:
```html
<!-- External script files -->
<script src="/js/app.js"></script>
<script type="module" src="/src/main.tsx"></script>

<!-- Empty script tags (no content) -->
<script id="data-container"></script>
```

### Configuration

The rule is configured in `eslint.config.js` as:
```javascript
"custom/no-inline-script": "error"
```

### Purpose

This rule helps maintain security best practices by:
- Preventing XSS vulnerabilities from inline scripts
- Enforcing Content Security Policy compliance
- Encouraging separation of concerns (HTML structure vs JavaScript logic)
- Making code easier to maintain and debug

## no-placeholder-comments

This rule detects and flags comments that start with "// In a real" (case-insensitive). These comments typically indicate placeholder implementations that should be replaced with real code.

### Examples

❌ **Bad** - These will trigger the rule:
```javascript
// In a real application, this would connect to a database
const data = [];

// in a real world scenario, this would be different
const config = {};

/* In a real implementation, we would handle errors */
const handleError = () => {};
```

✅ **Good** - These are fine:
```javascript
// This is a regular comment
const data = [];

// TODO: Implement database connection
const config = {};

// Note: In a real application, consider using a database
const handleError = () => {};
```

### Configuration

The rule is configured in `eslint.config.js` as:
```javascript
"custom/no-placeholder-comments": "error"
```

You can change the severity level to:
- `"off"` - Disable the rule
- `"warn"` - Show as warning
- `"error"` - Show as error (current setting)

### Purpose

This rule helps ensure that placeholder comments used during development are replaced with actual implementations before code is committed or deployed to production.

## require-webmanifest

This rule ensures that HTML files include a proper web manifest link tag and that the referenced manifest file exists. Web manifests are essential for Progressive Web Apps (PWAs) and provide metadata about the application.

### Examples

❌ **Bad** - These will trigger the rule:
```html
<!-- Missing manifest link entirely -->
<head>
  <title>My App</title>
</head>

<!-- Manifest file doesn't exist -->
<head>
  <link rel="manifest" href="/nonexistent-manifest.json">
</head>

<!-- Invalid manifest link (missing rel or href) -->
<head>
  <link href="/manifest.json">
</head>
```

✅ **Good** - These are fine:
```html
<!-- Proper manifest link with existing file -->
<head>
  <link rel="manifest" href="/manifest.json">
</head>

<!-- Alternative valid manifest link -->
<head>
  <link rel="manifest" href="/public/site.webmanifest">
</head>
```

### Configuration

The rule is configured in `eslint.config.js` as:
```javascript
"custom/require-webmanifest": "error"
```

### Purpose

This rule helps ensure:
- PWA compliance by requiring a web manifest
- Proper manifest file structure and accessibility
- Better user experience on mobile devices
- App installation capabilities
- Consistent branding and metadata across platforms