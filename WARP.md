# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Core Purpose

A digital memorial website for Baluch martyrs. This is a frontend-only application using vanilla JavaScript with localStorage for data persistence.

## Development Commands

### Run locally
```bash
# Open directly in browser (no server required)
open index.html

# Or serve with Python (hot-reload not included)
npm run dev
# (equivalent to) python3 -m http.server 8000
# Then navigate to http://localhost:8000

# Alternative Node-based static server
npx http-server -p 8000
```

### NPM scripts
```bash
# Start local server on :8000
npm start

# Dev server (identical to start)
npm run dev

# Build (no-op for vanilla HTML/CSS/JS)
npm run build
```

### Testing and linting
There is no test or linter configuration in this repo. Use the browser DevTools for debugging and storage inspection.
```bash
# Inspect localStorage in browser DevTools:
# Application > Storage > Local Storage
# Key: martyrsData (JSON array)
```

### Deployment (Netlify)
- Static publish directory: project root (.)
- Functions directory configured at netlify/functions (none checked in)
- Redirects: /api/* → /.netlify/functions/:splat (status 200)

## Architecture Overview

### Storage Architecture
The application uses browser localStorage as a temporary database with the following:
- Key: `martyrsData`
- Value: JSON array of martyr objects
- Fields commonly used: fullName, birthDate, martyrdomDate, birthPlace, martyrdomPlace, biography, organization, rank, family details, submitter info, photo (base64)

### Pages and Responsibilities
- index.html: Homepage with hero and recent martyrs (reads localStorage)
- add-martyr.html: Submission form with photo upload (writes to localStorage)
- gallery.html: Grid display with client-side search and modal details
- about.html, contact.html: Static content

### JavaScript Modules
- js/main.js: Mobile menu, smooth scrolling, recent martyrs, localStorage helpers
- js/add-martyr.js: Form handling, FileReader base64 conversion, persistence to `martyrsData`
- js/gallery.js: Render gallery, search/filter, modal detail view

### CSS
- css/styles.css: Single stylesheet using CSS custom properties (primary: #2c5530, secondary: #d4af37), mobile-first responsive layout with Grid/Flexbox

## Critical Implementation Details

### Photo Handling
Photos are converted to base64 strings for storage in localStorage (size-limited ~5–10MB total). Conversion uses FileReader in js/add-martyr.js.

### Data Flow
1. User submits form → Data validated → Photo converted to base64
2. Martyr object timestamped and appended to `martyrsData` in localStorage
3. Homepage and gallery read from localStorage on load
4. Search filters DOM elements using a precomputed `data-search-text` (gallery.js)

### Cross-Page Communication
All pages share data through localStorage. A reload reflects changes made elsewhere.

## Production Considerations
LocalStorage is for demonstration only. For production, migrate to a backend with:
- Database and server-side photo storage
- Validation/sanitization and authentication
- Content moderation

## Common Modifications

### Add a new field to martyr data
1. Update form in add-martyr.html
2. Modify martyrData creation in js/add-martyr.js (around line 126)
3. Update display in createMartyrCard() in js/main.js and createGalleryCard() in js/gallery.js
4. Update modal display in showMartyrModal() in js/gallery.js

### Change theme colors
Edit CSS custom properties in css/styles.css (lines 2–10)

### Modify search behavior
Search logic is in js/gallery.js filterGallery() (around line 115). Current search covers name, location, and organization fields.
