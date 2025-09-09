# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Core Purpose

A digital memorial website for Baluch martyrs. This is a frontend-only application using vanilla JavaScript with localStorage for data persistence.

## Development Commands

### Running the Application
```bash
# Open directly in browser (no server required)
open index.html

# Or use a simple HTTP server for better development experience
python3 -m http.server 8000
# Then navigate to http://localhost:8000

# Alternative with Node.js
npx http-server -p 8000
```

### Testing
```bash
# Open browser console for JavaScript debugging
# Check localStorage data:
# - In browser DevTools: Application > Storage > Local Storage
# - Key data is stored as 'martyrsData' in JSON format
```

## Architecture Overview

### Storage Architecture
The application uses browser localStorage as a temporary database with the following data structure:
- **Key**: `martyrsData` 
- **Value**: JSON array of martyr objects
- Each martyr object contains: fullName, birthDate, martyrdomDate, birthPlace, martyrdomPlace, biography, organization, rank, family details, submitter info, and photo (base64 encoded)

### Page Structure
```
index.html          → Homepage with hero section and recent martyrs display
add-martyr.html     → Form submission page with photo upload
gallery.html        → Searchable grid display of all martyrs
about.html          → Memorial mission and purpose
contact.html        → Contact form
```

### JavaScript Module Pattern
Three main JavaScript files with specific responsibilities:
- **js/main.js**: Core functionality, mobile menu, smooth scrolling, localStorage utilities, recent martyrs loading
- **js/add-martyr.js**: Form validation, photo upload handling with base64 conversion, data submission to localStorage
- **js/gallery.js**: Gallery rendering, search/filter functionality, modal display for martyr details

### CSS Architecture
Single stylesheet (`css/styles.css`) using:
- CSS custom properties for theming (primary: #2c5530, secondary: #d4af37)
- Mobile-first responsive design with hamburger menu
- Grid/Flexbox layouts for card displays

## Critical Implementation Details

### Photo Handling
Photos are converted to base64 strings for localStorage storage. This approach has size limitations (~5-10MB total localStorage capacity). The conversion happens in `add-martyr.js` using FileReader API.

### Data Flow
1. User submits form → Data validated → Photo converted to base64
2. Martyr object created with timestamp → Pushed to localStorage array
3. Gallery and homepage automatically read from localStorage on page load
4. Search functionality filters DOM elements using data attributes

### Cross-Page Communication
All pages share data through localStorage. Changes made on one page (like adding a martyr) are immediately visible on other pages upon reload.

## Production Considerations

The current localStorage implementation is suitable for demonstration but needs backend integration for production:
- Replace localStorage with proper database (suggested in README)
- Implement server-side photo storage instead of base64
- Add data validation and sanitization on backend
- Implement user authentication for submissions
- Add content moderation system

## Common Modifications

### Adding a New Field to Martyr Data
1. Update form in `add-martyr.html`
2. Modify `martyrData` object creation in `add-martyr.js` (around line 126)
3. Update display in `createMartyrCard()` in `main.js` and `createGalleryCard()` in `gallery.js`
4. Update modal display in `showMartyrModal()` in `gallery.js`

### Changing Theme Colors
Edit CSS custom properties in `css/styles.css` (lines 2-10)

### Modifying Search Behavior
Search logic is in `gallery.js` `filterGallery()` function (line 115). Current implementation searches through name, location, and organization fields.
