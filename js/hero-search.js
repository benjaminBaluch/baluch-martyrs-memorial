/**
 * Hero Instant Search — Baluch Martyrs Memorial
 * Enables visitors to find a martyr in 1 second right from the hero section.
 * Supports instant search, keyboard navigation (Up/Down/Enter/Esc),
 * full-profile modal display directly on the homepage, and deep-linking to the gallery.
 */

(function() {
    'use strict';

    // State
    let searchDebounce = null;
    let selectedIndex = -1;
    let currentResults = [];
    let isFetching = false;

    // Helper: Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Helper: Highlight matching substring
    function highlightMatch(text, query) {
        if (!text) return '';
        if (!query) return escapeHtml(text);
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapeHtml(text).replace(regex, '<mark>$1</mark>');
    }

    // Helper: Extract 4-digit year from any date value
    function extractYear(dateVal) {
        if (!dateVal) return '';
        if (typeof dateVal === 'object' && dateVal.toDate) {
            try { return String(dateVal.toDate().getFullYear()); } catch (e) {}
        }
        if (typeof dateVal === 'string') {
            const match = dateVal.match(/\b(19\d\d|20\d\d)\b/);
            if (match) return match[1];
        }
        return '';
    }

    // Get all approved martyrs from any available cache
    function getMartyrsCache() {
        if (Array.isArray(window.allApprovedMartyrs) && window.allApprovedMartyrs.length > 0) {
            return window.allApprovedMartyrs;
        }
        if (Array.isArray(window.martyrsDataFromFirebase) && window.martyrsDataFromFirebase.length > 0) {
            window.allApprovedMartyrs = window.martyrsDataFromFirebase;
            return window.allApprovedMartyrs;
        }
        try {
            const local = localStorage.getItem('martyrsData');
            if (local) {
                const parsed = JSON.parse(local);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    window.allApprovedMartyrs = parsed.filter(m => !m.status || m.status === 'approved');
                    return window.allApprovedMartyrs;
                }
            }
        } catch (e) {
            console.warn('Hero Search: localStorage read error', e);
        }
        return [];
    }

    // Ensure martyrs data is fetched asynchronously if not cached
    async function ensureMartyrsData() {
        const cached = getMartyrsCache();
        if (cached.length > 0) return cached;
        if (isFetching) return [];
        isFetching = true;

        try {
            if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                const res = await window.firebaseDB.getApprovedMartyrs();
                if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                    window.allApprovedMartyrs = res.data;
                    try { localStorage.setItem('martyrsData', JSON.stringify(res.data)); } catch (e) {}
                    return window.allApprovedMartyrs;
                }
            }

            // Fallback to Netlify API
            const resp = await fetch('/api/get-martyrs', { headers: { 'Accept': 'application/json' } });
            if (resp.ok) {
                const apiData = await resp.json();
                if (Array.isArray(apiData) && apiData.length > 0) {
                    window.allApprovedMartyrs = apiData;
                    try { localStorage.setItem('martyrsData', JSON.stringify(apiData)); } catch (e) {}
                    return window.allApprovedMartyrs;
                }
            }
        } catch (err) {
            console.warn('Hero Search: Background martyrs fetch error', err);
        } finally {
            isFetching = false;
        }

        return getMartyrsCache();
    }

    // Perform Ranked Search
    function performSearch(query, martyrs) {
        const q = query.trim().toLowerCase();
        if (!q || q.length < 2) return [];

        const scored = [];

        for (let i = 0; i < martyrs.length; i++) {
            const m = martyrs[i];
            if (m.status && m.status !== 'approved') continue;

            const fullName = (m.fullName || '').toLowerCase();
            const fatherName = (m.fatherName || '').toLowerCase();
            const martyrdomPlace = (m.martyrdomPlace || '').toLowerCase();
            const birthPlace = (m.birthPlace || '').toLowerCase();
            const organization = (m.organization || '').toLowerCase();
            const year = extractYear(m.martyrdomDate);

            let score = 0;

            if (fullName === q) {
                score += 1000;
            } else if (fullName.startsWith(q)) {
                score += 500;
            } else if (fullName.split(/\s+/).some(w => w.startsWith(q))) {
                score += 300;
            } else if (fullName.includes(q)) {
                score += 200;
            }

            if (fatherName.includes(q)) score += 120;
            if (organization.includes(q)) score += 100;
            if (martyrdomPlace.includes(q) || birthPlace.includes(q)) score += 80;
            if (year && year.includes(q)) score += 70;

            if (score > 0) {
                scored.push({ martyr: m, score, year });
            }
        }

        // Sort descending by score, then alphabetically
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (a.martyr.fullName || '').localeCompare(b.martyr.fullName || '');
        });

        return scored;
    }

    // Initialize Hero Search when DOM is ready
    function initHeroSearch() {
        const wrapper = document.getElementById('heroSearchWrapper');
        const searchBar = document.getElementById('heroSearchBar');
        const input = document.getElementById('heroSearchInput');
        const clearBtn = document.getElementById('heroSearchClear');
        const searchBtn = document.getElementById('heroSearchBtn');
        const dropdown = document.getElementById('heroSearchDropdown');
        const resultsList = document.getElementById('heroSearchResultsList');
        const dropdownFooter = document.getElementById('heroSearchDropdownFooter');
        const footerCount = document.getElementById('heroSearchFooterCount');
        const viewAllLink = document.getElementById('heroSearchViewAllLink');
        const loadingSpinner = document.getElementById('heroSearchLoading');

        if (!wrapper || !input || !dropdown || !resultsList) {
            return;
        }

        // Focus styling
        input.addEventListener('focus', () => {
            if (searchBar) searchBar.classList.add('is-focused');
            const q = input.value.trim();
            if (q.length >= 2) {
                executeSearch(q);
            }
        });

        input.addEventListener('blur', () => {
            if (searchBar) searchBar.classList.remove('is-focused');
        });

        // Live input typing with debounce
        input.addEventListener('input', () => {
            const val = input.value;
            if (clearBtn) clearBtn.style.display = val.length > 0 ? 'flex' : 'none';

            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                executeSearch(val.trim());
            }, 120);
        });

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.style.display = 'none';
                hideDropdown();
                input.focus();
            });
        }

        // Search submit button
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const q = input.value.trim();
                if (q) {
                    navigateToGallery(q);
                } else {
                    input.focus();
                }
            });
        }

        // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideDropdown();
                input.blur();
                return;
            }

            if (dropdown.style.display === 'none') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = input.value.trim();
                    if (q) navigateToGallery(q);
                }
                return;
            }

            const items = resultsList.querySelectorAll('.hero-search-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length === 0) return;
                selectedIndex = (selectedIndex + 1) % items.length;
                updateSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length === 0) return;
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                updateSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                } else {
                    const q = input.value.trim();
                    if (q) navigateToGallery(q);
                }
            }
        });

        // Global Cmd+K / Ctrl+K shortcut to focus hero search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                input.focus();
                input.select();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                hideDropdown();
            }
        });

        // Close dropdown when scrolling significantly
        window.addEventListener('scroll', () => {
            if (window.scrollY > 450 && dropdown.style.display !== 'none') {
                hideDropdown();
            }
        }, { passive: true });

        // Execute search and render results
        async function executeSearch(query) {
            if (!query || query.length < 2) {
                hideDropdown();
                return;
            }

            let martyrs = getMartyrsCache();
            if (martyrs.length === 0) {
                if (loadingSpinner) loadingSpinner.style.display = 'flex';
                martyrs = await ensureMartyrsData();
                if (loadingSpinner) loadingSpinner.style.display = 'none';
            }

            const scoredMatches = performSearch(query, martyrs);
            currentResults = scoredMatches;
            selectedIndex = -1;

            renderResults(query, scoredMatches);
        }

        // Render matching cards in dropdown
        function renderResults(query, matches) {
            resultsList.innerHTML = '';

            if (matches.length === 0) {
                resultsList.innerHTML = `
                    <div class="hero-search-no-results">
                        <div class="hero-search-no-icon">🕊️</div>
                        <div class="hero-search-no-title">No documented martyrs found matching "${escapeHtml(query)}"</div>
                        <p class="hero-search-no-sub">Try searching by district (e.g. Kohlu, Gwadar, Quetta), martyrdom year, or organization.</p>
                        <div class="hero-search-no-actions">
                            <a href="/gallery?search=${encodeURIComponent(query)}" class="btn btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.88rem;">Search Gallery</a>
                            <a href="/add-martyr" class="btn btn-secondary" style="padding: 0.5rem 1.25rem; font-size: 0.88rem;">Honor a Hero</a>
                        </div>
                    </div>
                `;
                if (dropdownFooter) dropdownFooter.style.display = 'none';
                showDropdown();
                return;
            }

            // Display top 6 matches
            const topMatches = matches.slice(0, 6);

            topMatches.forEach((item, idx) => {
                const m = item.martyr;
                const card = document.createElement('div');
                card.className = 'hero-search-item';
                card.setAttribute('role', 'option');
                card.setAttribute('tabindex', '-1');
                card.dataset.index = String(idx);

                // Avatar
                const initial = (m.fullName || 'B').trim().charAt(0).toUpperCase();
                const avatarHtml = m.photo
                    ? `<img src="${escapeHtml(m.photo)}" alt="" loading="lazy">`
                    : `<span class="hero-search-avatar-fallback">${escapeHtml(initial)}</span>`;

                // Meta details
                const place = m.martyrdomPlace || m.birthPlace || '';
                const year = item.year || extractYear(m.martyrdomDate);
                const org = m.organization || '';

                card.innerHTML = `
                    <div class="hero-search-avatar" aria-hidden="true">
                        ${avatarHtml}
                    </div>
                    <div class="hero-search-item-info">
                        <div class="hero-search-item-name">${highlightMatch(m.fullName || 'Unknown Martyr', query)}</div>
                        <div class="hero-search-item-meta">
                            ${place ? `<span class="hero-search-meta-badge">📍 ${escapeHtml(place)}</span>` : ''}
                            ${year ? `<span class="hero-search-meta-badge">🕊️ ${escapeHtml(year)}</span>` : ''}
                            ${org ? `<span class="hero-search-meta-badge org">🏳️ ${escapeHtml(org)}</span>` : ''}
                        </div>
                    </div>
                    <div class="hero-search-item-action">
                        <span>View</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                `;

                // Click to view profile immediately in modal
                card.addEventListener('click', () => {
                    hideDropdown();
                    openMartyrModal(m);
                });

                resultsList.appendChild(card);
            });

            // Update footer
            if (dropdownFooter && footerCount && viewAllLink) {
                dropdownFooter.style.display = 'flex';
                footerCount.innerHTML = `Showing <strong>${topMatches.length}</strong> of <strong>${matches.length}</strong> matching heroes`;
                viewAllLink.href = `/gallery?search=${encodeURIComponent(query)}`;
            }

            showDropdown();
        }

        // Open modal or deep link
        function openMartyrModal(martyr) {
            const all = getMartyrsCache();
            if (typeof window.showMartyrDetails === 'function') {
                window.showMartyrDetails(martyr, all);
            } else {
                window.location.href = `/gallery.html?hero=${encodeURIComponent(martyr.fullName || martyr.id)}`;
            }
        }

        // Navigate to gallery
        function navigateToGallery(q) {
            window.location.href = `/gallery?search=${encodeURIComponent(q)}`;
        }

        // Update active selection from keyboard
        function updateSelection(items) {
            items.forEach((item, i) => {
                if (i === selectedIndex) {
                    item.classList.add('is-selected');
                    item.setAttribute('aria-selected', 'true');
                    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    item.classList.remove('is-selected');
                    item.removeAttribute('aria-selected');
                }
            });
        }

        function showDropdown() {
            dropdown.style.display = 'block';
            input.setAttribute('aria-expanded', 'true');
        }

        function hideDropdown() {
            dropdown.style.display = 'none';
            input.setAttribute('aria-expanded', 'false');
            selectedIndex = -1;
        }

        // Listen for data ready events to pre-warm cache
        window.addEventListener('martyrsDataLoaded', (e) => {
            if (e.detail && Array.isArray(e.detail)) {
                window.allApprovedMartyrs = e.detail;
            }
        });

        window.addEventListener('martyrsDataReady', (e) => {
            if (e.detail && e.detail.data && Array.isArray(e.detail.data)) {
                window.allApprovedMartyrs = e.detail.data;
            }
        });

        // Pre-warm data asynchronously in background after page is interactive
        setTimeout(ensureMartyrsData, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeroSearch);
    } else {
        initHeroSearch();
    }
})();
