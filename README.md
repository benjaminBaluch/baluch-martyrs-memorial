# Baluch Martyrs Memorial Website

A digital memorial website dedicated to preserving the memory and honoring the sacrifice of Baluch martyrs who gave their lives for freedom and dignity.

## Features

- **Homepage**: Hero section with navigation to key features
- **Add Martyr**: Form to submit martyr information including:
  - Personal details (name, dates, locations)
  - Photo upload capability
  - Biography and organizational details
  - Family information
  - Submitter information
- **Gallery**: Browse and search all martyrs in the memorial
- **About**: Information about the memorial's mission and purpose
- **Contact**: Contact form for inquiries and feedback

## Project Structure

```
baluch-martyrs-memorial/
├── index.html          # Homepage
├── add-martyr.html     # Add martyr form page
├── gallery.html        # Martyrs gallery page
├── about.html          # About page
├── contact.html        # Contact page
├── css/
│   └── styles.css      # Main stylesheet
├── js/
│   ├── main.js         # Main JavaScript file
│   ├── add-martyr.js   # Form handling JavaScript
│   └── gallery.js      # Gallery functionality
├── images/             # Image assets directory
└── assets/             # Additional assets directory
```

## Technologies Used

- HTML5
- CSS3 (Custom properties, Grid, Flexbox)
- Vanilla JavaScript
- Local Storage for data persistence

## Features

### Responsive Design
The website is fully responsive and works on all devices (desktop, tablet, mobile).

### Data Storage
Currently uses browser's localStorage for data persistence. In production, this should be replaced with a proper backend database.

### Photo Upload
Supports photo upload with preview functionality. Photos are converted to base64 for localStorage storage.

### Search & Filter
Gallery page includes search functionality to filter martyrs by name, location, or organization.

## Setup Instructions

1. Clone or download the project
2. Open `index.html` in a web browser
3. No server setup required for basic functionality

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Footer Attribution

**Powered by Benjamin Baluch**

## Future Enhancements

- Backend database integration
- User authentication
- Admin panel for content moderation
- Multi-language support
- Export functionality
- Social media sharing

## Contributing

To contribute to this memorial, you can:
- Add martyr information through the "Add Martyr" page
- Report issues or suggest improvements
- Help with translations

## License

This project is created as a memorial to honor Baluch martyrs. Please use respectfully.

---

For questions or support, contact: info@baluchmemorial.org
