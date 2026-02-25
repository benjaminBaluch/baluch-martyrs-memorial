/**
 * Baluch Martyrs Memorial - AI-Powered Conversational Assistant v3.0
 * 
 * Features:
 * - Natural Language Understanding with intent classification
 * - Real-time martyrs database integration
 * - Contextual conversation memory
 * - Semantic search across martyr profiles
 * - Multi-turn conversation support
 * 
 * @author AI Engineering Team
 */

// ============================================
// NATURAL LANGUAGE UNDERSTANDING ENGINE
// ============================================

class NLUEngine {
    constructor() {
        this.intents = this.defineIntents();
        this.entities = this.defineEntities();
    }

    defineIntents() {
        return {
            // Martyr-specific queries
            SEARCH_MARTYR: {
                patterns: ['who is', 'tell me about', 'find martyr', 'search martyr', 'martyr named', 'information about', 'details of', 'know about', 'biography of'],
                priority: 22
            },
            COUNT_MARTYRS: {
                patterns: ['how many', 'total', 'count', 'number of', 'statistics'],
                priority: 20
            },
            LIST_MARTYRS: {
                patterns: ['list', 'show all', 'all martyrs', 'names of', 'who are the'],
                priority: 20
            },
            MARTYR_BY_REGION: {
                patterns: ['from', 'region', 'place', 'area', 'city', 'where'],
                priority: 18
            },
            MARTYR_BY_YEAR: {
                patterns: ['year', 'when', 'date', 'martyred in', 'died in', '2020', '2021', '2022', '2023', '2024', '2025', '2026'],
                priority: 18
            },
            MARTYR_BY_ORGANIZATION: {
                patterns: ['organization', 'group', 'party', 'movement', 'bso', 'bnm', 'blf'],
                priority: 18
            },
            RECENT_MARTYRS: {
                patterns: ['recent', 'latest', 'newest', 'last added', 'new martyrs'],
                priority: 20
            },
            RANDOM_MARTYR: {
                patterns: ['random', 'any martyr', 'tell me about a martyr', 'share a story'],
                priority: 15
            },

            // Historical/Educational queries
            QUERY_HISTORY: {
                patterns: ['history', 'historical', 'past', 'origin', 'ancient'],
                priority: 15
            },
            QUERY_OCCUPATION: {
                patterns: ['occupation', 'occupied', 'annexation', 'illegal', '1948', 'pakistan'],
                priority: 15
            },
            QUERY_RESISTANCE: {
                patterns: ['resistance', 'struggle', 'freedom', 'liberation', 'independence'],
                priority: 15
            },
            QUERY_CULTURE: {
                patterns: ['culture', 'tradition', 'language', 'baluchi', 'heritage'],
                priority: 15
            },
            QUERY_HUMAN_RIGHTS: {
                patterns: ['human rights', 'violations', 'disappearances', 'torture', 'missing'],
                priority: 15
            },

            // Memorial-specific
            HOW_TO_ADD: {
                patterns: ['how to add', 'how do i add', 'how can i add', 'submit', 'contribute', 'add martyr', 'add a martyr', 'honor someone', 'honor a martyr', 'want to add'],
                priority: 30
            },
            ABOUT_MEMORIAL: {
                patterns: ['about this', 'what is this', 'purpose', 'mission', 'memorial'],
                priority: 15
            },

            // Conversational
            GREETING: {
                patterns: ['hello', 'hi', 'hey', 'salaam', 'greetings', 'good morning', 'good evening'],
                priority: 10
            },
            THANKS: {
                patterns: ['thank', 'thanks', 'appreciate', 'helpful'],
                priority: 10
            },
            HELP: {
                patterns: ['help', 'what can you do', 'commands', 'options', 'guide me'],
                priority: 12
            },
            MORE_INFO: {
                patterns: ['more', 'tell me more', 'elaborate', 'details', 'continue'],
                priority: 15
            },

            DEFAULT: {
                patterns: [],
                priority: 0
            }
        };
    }

    defineEntities() {
        return {
            // Common Baluch regions
            regions: [
                'quetta', 'turbat', 'gwadar', 'panjgur', 'khuzdar', 'awaran',
                'kech', 'mastung', 'kalat', 'lasbela', 'dera bugti', 'kohlu',
                'sibi', 'zhob', 'loralai', 'pishin', 'chagai', 'nushki',
                'washuk', 'baluchistan', 'balochistan', 'karachi', 'hub',
                'zahedan', 'chabahar', 'iranshahr', 'saravan'
            ],
            // Organizations
            organizations: [
                'bso', 'bnm', 'blf', 'bla', 'bra', 'bsm', 'baloch', 'student'
            ],
            // Year patterns
            yearPattern: /\b(19|20)\d{2}\b/
        };
    }

    classifyIntent(message) {
        const lowerMessage = message.toLowerCase();
        let bestMatch = { intent: 'DEFAULT', priority: 0, confidence: 0 };

        for (const [intentName, intent] of Object.entries(this.intents)) {
            for (const pattern of intent.patterns) {
                if (lowerMessage.includes(pattern)) {
                    const confidence = pattern.length / lowerMessage.length;
                    if (intent.priority > bestMatch.priority || 
                        (intent.priority === bestMatch.priority && confidence > bestMatch.confidence)) {
                        bestMatch = { intent: intentName, priority: intent.priority, confidence };
                    }
                }
            }
        }

        return bestMatch;
    }

    extractEntities(message) {
        const lowerMessage = message.toLowerCase();
        const entities = {
            names: [],
            regions: [],
            organizations: [],
            years: [],
            keywords: []
        };

        // Extract regions
        for (const region of this.entities.regions) {
            if (lowerMessage.includes(region)) {
                entities.regions.push(region);
            }
        }

        // Extract organizations
        for (const org of this.entities.organizations) {
            if (lowerMessage.includes(org)) {
                entities.organizations.push(org);
            }
        }

        // Extract years
        const yearMatches = message.match(this.entities.yearPattern);
        if (yearMatches) {
            entities.years = yearMatches.map(y => parseInt(y));
        }

        // Extract potential names (words starting with capital letters)
        const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
        const nameMatches = message.match(namePattern);
        if (nameMatches) {
            entities.names = nameMatches.filter(name => 
                !['Who', 'What', 'Where', 'When', 'How', 'Tell', 'Find', 'Search', 'Show'].includes(name)
            );
        }

        // Extract general keywords
        const words = lowerMessage.split(/\s+/).filter(w => w.length > 3);
        entities.keywords = words;

        return entities;
    }
}

// ============================================
// MARTYRS DATA SERVICE
// ============================================

class MartyrsDataService {
    constructor() {
        this.martyrsCache = [];
        this.lastFetch = null;
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    async fetchMartyrs() {
        // Return cached data if fresh
        if (this.martyrsCache.length > 0 && this.lastFetch && 
            (Date.now() - this.lastFetch) < this.cacheExpiry) {
            return this.martyrsCache;
        }

        try {
            // Try Firebase first
            if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                console.log('🤖 Chatbot: Fetching martyrs from Firebase...');
                const result = await window.firebaseDB.getApprovedMartyrs();
                if (result.success && result.data) {
                    this.martyrsCache = result.data;
                    this.lastFetch = Date.now();
                    console.log(`🤖 Chatbot: Loaded ${this.martyrsCache.length} martyrs from Firebase`);
                    return this.martyrsCache;
                }
            }

            // Fallback to localStorage
            const localData = localStorage.getItem('martyrsData');
            if (localData) {
                const parsed = JSON.parse(localData);
                this.martyrsCache = parsed.filter(m => !m.status || m.status === 'approved');
                this.lastFetch = Date.now();
                console.log(`🤖 Chatbot: Loaded ${this.martyrsCache.length} martyrs from localStorage`);
                return this.martyrsCache;
            }

            return [];
        } catch (error) {
            console.error('🤖 Chatbot: Error fetching martyrs:', error);
            return this.martyrsCache;
        }
    }

    async searchByName(query) {
        const martyrs = await this.fetchMartyrs();
        const lowerQuery = query.toLowerCase();
        
        return martyrs.filter(m => {
            const name = (m.fullName || '').toLowerCase();
            const fatherName = (m.fatherName || '').toLowerCase();
            return name.includes(lowerQuery) || fatherName.includes(lowerQuery);
        });
    }

    async searchByRegion(region) {
        const martyrs = await this.fetchMartyrs();
        const lowerRegion = region.toLowerCase();
        
        return martyrs.filter(m => {
            const birthPlace = (m.birthPlace || '').toLowerCase();
            const martyrdomPlace = (m.martyrdomPlace || '').toLowerCase();
            return birthPlace.includes(lowerRegion) || martyrdomPlace.includes(lowerRegion);
        });
    }

    async searchByYear(year) {
        const martyrs = await this.fetchMartyrs();
        
        return martyrs.filter(m => {
            const date = this.extractYear(m.martyrdomDate);
            return date === year;
        });
    }

    async searchByOrganization(org) {
        const martyrs = await this.fetchMartyrs();
        const lowerOrg = org.toLowerCase();
        
        return martyrs.filter(m => {
            const organization = (m.organization || '').toLowerCase();
            return organization.includes(lowerOrg);
        });
    }

    async getRecentMartyrs(count = 5) {
        const martyrs = await this.fetchMartyrs();
        
        return martyrs
            .sort((a, b) => {
                const dateA = new Date(a.submittedAt || a.approvedAt || 0);
                const dateB = new Date(b.submittedAt || b.approvedAt || 0);
                return dateB - dateA;
            })
            .slice(0, count);
    }

    async getRandomMartyr() {
        const martyrs = await this.fetchMartyrs();
        if (martyrs.length === 0) return null;
        return martyrs[Math.floor(Math.random() * martyrs.length)];
    }

    async getStatistics() {
        const martyrs = await this.fetchMartyrs();
        
        const stats = {
            total: martyrs.length,
            withBio: martyrs.filter(m => m.biography && m.biography.length > 30).length,
            withPhoto: martyrs.filter(m => m.photo && m.photo.length > 50).length,
            regions: {},
            years: {},
            organizations: {}
        };

        martyrs.forEach(m => {
            // Count by region
            const region = m.martyrdomPlace || m.birthPlace || 'Unknown';
            stats.regions[region] = (stats.regions[region] || 0) + 1;

            // Count by year
            const year = this.extractYear(m.martyrdomDate);
            if (year) {
                stats.years[year] = (stats.years[year] || 0) + 1;
            }

            // Count by organization
            const org = m.organization || 'Unknown';
            stats.organizations[org] = (stats.organizations[org] || 0) + 1;
        });

        return stats;
    }

    async semanticSearch(query) {
        const martyrs = await this.fetchMartyrs();
        const lowerQuery = query.toLowerCase();
        const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

        return martyrs
            .map(m => {
                let score = 0;
                const searchText = `${m.fullName || ''} ${m.fatherName || ''} ${m.birthPlace || ''} ${m.martyrdomPlace || ''} ${m.organization || ''} ${m.biography || ''}`.toLowerCase();
                
                queryWords.forEach(word => {
                    if (searchText.includes(word)) {
                        score += 1;
                        // Boost for name match
                        if ((m.fullName || '').toLowerCase().includes(word)) {
                            score += 3;
                        }
                    }
                });

                return { martyr: m, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(item => item.martyr);
    }

    extractYear(dateInput) {
        if (!dateInput) return null;

        // Handle Firestore Timestamp
        if (typeof dateInput === 'object' && dateInput.seconds) {
            return new Date(dateInput.seconds * 1000).getFullYear();
        }
        if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
            return dateInput.toDate().getFullYear();
        }

        const dateStr = String(dateInput);
        const match = dateStr.match(/\b(19|20)\d{2}\b/);
        return match ? parseInt(match[0]) : null;
    }

    formatDate(dateInput) {
        if (!dateInput) return 'Unknown';

        try {
            let date;
            if (typeof dateInput === 'object' && dateInput.seconds) {
                date = new Date(dateInput.seconds * 1000);
            } else if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
                date = dateInput.toDate();
            } else {
                date = new Date(dateInput);
            }

            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        } catch (e) {}

        return String(dateInput);
    }
}

// ============================================
// CONVERSATION CONTEXT MANAGER
// ============================================

class ConversationContext {
    constructor() {
        this.history = [];
        this.currentTopic = null;
        this.currentMartyr = null;
        this.lastSearchResults = [];
        this.sessionData = {};
    }

    addToHistory(role, message, data = null) {
        this.history.push({
            role,
            message,
            data,
            timestamp: Date.now()
        });

        // Keep only last 20 messages
        if (this.history.length > 20) {
            this.history = this.history.slice(-20);
        }
    }

    setCurrentMartyr(martyr) {
        this.currentMartyr = martyr;
    }

    setLastSearchResults(results) {
        this.lastSearchResults = results;
    }

    getRecentContext() {
        return this.history.slice(-5);
    }
}

// ============================================
// RESPONSE GENERATOR
// ============================================

class ResponseGenerator {
    constructor(dataService) {
        this.dataService = dataService;
        this.knowledgeBase = this.initializeKnowledgeBase();
    }

    formatMartyrCard(martyr) {
        const birthDate = this.dataService.formatDate(martyr.birthDate);
        const martyrdomDate = this.dataService.formatDate(martyr.martyrdomDate);
        
        let response = `<div class="martyr-info-card">`;
        response += `<strong>🕯️ ${this.escapeHtml(martyr.fullName || 'Unknown')}</strong><br>`;
        
        if (martyr.fatherName) {
            response += `<small>Son of ${this.escapeHtml(martyr.fatherName)}</small><br>`;
        }
        
        response += `<br>`;
        
        if (birthDate !== 'Unknown' || martyr.birthPlace) {
            response += `📅 <strong>Born:</strong> ${birthDate}`;
            if (martyr.birthPlace) response += ` in ${this.escapeHtml(martyr.birthPlace)}`;
            response += `<br>`;
        }
        
        response += `⚔️ <strong>Martyred:</strong> ${martyrdomDate}`;
        if (martyr.martyrdomPlace) response += ` in ${this.escapeHtml(martyr.martyrdomPlace)}`;
        response += `<br>`;
        
        if (martyr.organization) {
            response += `🏛️ <strong>Organization:</strong> ${this.escapeHtml(martyr.organization)}<br>`;
        }
        
        if (martyr.biography) {
            const bio = martyr.biography.length > 200 
                ? martyr.biography.substring(0, 200) + '...' 
                : martyr.biography;
            response += `<br>📖 ${this.escapeHtml(bio)}`;
        }
        
        response += `</div>`;
        return response;
    }

    formatMartyrsList(martyrs, limit = 5) {
        if (martyrs.length === 0) {
            return "No martyrs found matching your search.";
        }

        let response = `Found **${martyrs.length}** martyr(s):\n\n`;
        
        const toShow = martyrs.slice(0, limit);
        toShow.forEach((m, i) => {
            const year = this.dataService.extractYear(m.martyrdomDate);
            response += `${i + 1}. **${this.escapeHtml(m.fullName || 'Unknown')}**`;
            if (m.martyrdomPlace) response += ` - ${this.escapeHtml(m.martyrdomPlace)}`;
            if (year) response += ` (${year})`;
            response += `\n`;
        });

        if (martyrs.length > limit) {
            response += `\n_...and ${martyrs.length - limit} more. Ask about a specific name for details._`;
        }

        return response;
    }

    formatStatistics(stats) {
        let response = `📊 **Memorial Statistics**\n\n`;
        response += `• **Total Martyrs Documented:** ${stats.total}\n`;
        response += `• **With Biographies:** ${stats.withBio}\n`;
        response += `• **With Photos:** ${stats.withPhoto}\n\n`;

        // Top regions
        const topRegions = Object.entries(stats.regions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        if (topRegions.length > 0) {
            response += `**Top Regions:**\n`;
            topRegions.forEach(([region, count]) => {
                response += `• ${region}: ${count} martyrs\n`;
            });
        }

        // Year range
        const years = Object.keys(stats.years).map(Number).sort();
        if (years.length > 0) {
            response += `\n**Year Range:** ${years[0]} - ${years[years.length - 1]}`;
        }

        return response;
    }

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    initializeKnowledgeBase() {
        return {
            history: {
                overview: "Baluchistan has one of the oldest civilizations on Earth. The Mehrgarh civilization (7000-2500 BCE) predates the Indus Valley by thousands of years. The Baluch people established the Khanate of Kalat, an independent state for over 400 years until its forced annexation by Pakistan in 1948.",
                ancient: "The Mehrgarh civilization in Baluchistan is 9,000 years old - older than Mesopotamia. It shows the first evidence of wheat and barley cultivation in South Asia, and advanced dental practices dating back 7,000 years.",
                khanate: "The Khanate of Kalat was an independent Baluch state with its own currency, army, and diplomatic relations. Under Nasir Khan I (1750-1794), it controlled trade routes between Central Asia and the Indian Ocean."
            },
            occupation: {
                overview: "On August 11, 1947, the Khan of Kalat declared Baluchistan's independence. However, Pakistan militarily occupied Baluchistan on March 27, 1948, forcing the Khan to sign an Instrument of Accession under duress. This violates UN Charter principles of self-determination.",
                legal: "International law experts argue that Pakistan's annexation violates multiple principles of international law, including the UN Charter's right to self-determination. No legitimate referendum was ever conducted."
            },
            resistance: {
                overview: "Since 1948, Baluchistan has witnessed continuous resistance movements. Major uprisings occurred in 1948, 1958-59, 1963-69, 1973-77, and the current movement that began in the early 2000s. These represent the legitimate aspirations for self-determination.",
                leaders: "Baluch freedom fighters have sacrificed their lives for independence. Leaders like Nawab Akbar Bugti (killed 2006), Balach Marri, and countless others have paid the ultimate price for Baluch freedom."
            },
            humanRights: {
                overview: "International organizations have documented over 25,000 enforced disappearances in Baluchistan. Systematic torture, extrajudicial killings, and mass displacement of civilian populations continue. Human Rights Watch and Amnesty International have reported extensively on these violations."
            },
            memorial: {
                purpose: "This memorial serves as a digital sanctuary preserving the legacy of brave souls who made the ultimate sacrifice for freedom, justice, and the dignity of the Baluch nation. Every story preserved here ensures their sacrifice is never forgotten.",
                howToAdd: "To honor a hero, click 'Add Martyr' in the navigation menu or go to add-martyr.html. Fill out the form with the martyr's details including name, dates, location, and biography. Photos can be uploaded. All submissions are reviewed before publication."
            }
        };
    }
}

// ============================================
// MAIN CHATBOT CLASS
// ============================================

class BaluchistanChatbot {
    constructor() {
        this.isMinimized = true;
        this.nlu = new NLUEngine();
        this.dataService = new MartyrsDataService();
        this.context = new ConversationContext();
        this.responseGenerator = new ResponseGenerator(this.dataService);
        this.isProcessing = false;
        
        this.init();
    }

    init() {
        this.createChatbotHTML();
        this.attachEventListeners();
        this.showWelcomeMessage();
        
        // Preload martyrs data
        this.dataService.fetchMartyrs();
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div class="chatbot-container minimized" id="chatbot-container">
                <div class="chatbot-header" id="chatbot-header">
                    <div class="chatbot-info">
                        <div class="chatbot-avatar">🕯️</div>
                        <div class="chatbot-title-area">
                            <div class="chatbot-title">Memorial Assistant</div>
                            <div class="chatbot-subtitle">Ask about martyrs & history</div>
                        </div>
                    </div>
                    <button class="chatbot-toggle" id="chatbot-toggle" aria-label="Toggle chat">
                        <span class="toggle-icon">💬</span>
                    </button>
                </div>
                <div class="chatbot-body">
                    <div class="chatbot-messages" id="chatbot-messages"></div>
                    <div class="chatbot-input-area">
                        <div class="chatbot-suggestions" id="chatbot-suggestions"></div>
                        <div class="chatbot-input-wrapper">
                            <input type="text" 
                                   class="chatbot-input" 
                                   id="chatbot-input" 
                                   placeholder="Ask about martyrs, history..." 
                                   maxlength="500"
                                   autocomplete="off">
                            <button class="chatbot-send" id="chatbot-send" aria-label="Send message">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    }

    attachEventListeners() {
        const container = document.getElementById('chatbot-container');
        const header = document.getElementById('chatbot-header');
        const toggle = document.getElementById('chatbot-toggle');
        const input = document.getElementById('chatbot-input');
        const sendBtn = document.getElementById('chatbot-send');
        const suggestions = document.getElementById('chatbot-suggestions');

        // Toggle chatbot
        header.addEventListener('click', (e) => {
            if (!e.target.closest('.chatbot-toggle')) {
                this.toggleChatbot();
            }
        });

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleChatbot();
        });

        // Send message
        sendBtn.addEventListener('click', () => this.handleUserMessage());
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserMessage();
            }
        });

        // Suggestion clicks
        suggestions.addEventListener('click', (e) => {
            const btn = e.target.closest('.suggestion-btn');
            if (btn) {
                input.value = btn.dataset.query;
                this.handleUserMessage();
            }
        });
    }

    toggleChatbot() {
        const container = document.getElementById('chatbot-container');
        const toggle = document.getElementById('chatbot-toggle');
        
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            container.classList.add('minimized');
            toggle.querySelector('.toggle-icon').textContent = '💬';
        } else {
            container.classList.remove('minimized');
            toggle.querySelector('.toggle-icon').textContent = '−';
            setTimeout(() => {
                document.getElementById('chatbot-input').focus();
            }, 300);
        }
    }

    showWelcomeMessage() {
        setTimeout(async () => {
            const stats = await this.dataService.getStatistics();
            const martyrCount = stats.total;
            
            const welcomeMsg = martyrCount > 0
                ? `Welcome to the Baluch Martyrs Memorial. I can help you learn about the **${martyrCount} documented martyrs** and the history of Baluchistan's struggle for freedom.\n\nYou can ask me things like:\n• "Tell me about [martyr's name]"\n• "How many martyrs from Turbat?"\n• "Show recent martyrs"\n• "What is the history of Baluchistan?""`
                : `Welcome to the Baluch Martyrs Memorial. I can help you learn about documented martyrs and the history of Baluchistan's struggle for freedom.\n\nYou can ask me about history, the resistance movement, or how to add a martyr to honor.`;
            
            this.addMessage('bot', welcomeMsg);
            this.showSuggestions([
                { text: '📊 Statistics', query: 'show statistics' },
                { text: '🕯️ Recent martyrs', query: 'show recent martyrs' },
                { text: '📜 History', query: 'tell me about the history' },
                { text: '➕ How to add', query: 'how do I add a martyr' }
            ]);
        }, 1000);
    }

    addMessage(sender, content, isHtml = false) {
        const messagesContainer = document.getElementById('chatbot-messages');
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Convert markdown-style formatting to HTML
        let formattedContent = content;
        if (!isHtml) {
            formattedContent = this.formatMarkdown(content);
        }
        
        const messageHTML = `
            <div class="message ${sender}">
                <div class="message-bubble">${formattedContent}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Save to context
        this.context.addToHistory(sender, content);
    }

    formatMarkdown(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    showSuggestions(suggestions) {
        const container = document.getElementById('chatbot-suggestions');
        
        container.innerHTML = suggestions.map(s => 
            `<button class="suggestion-btn" data-query="${this.escapeAttr(s.query)}">${s.text}</button>`
        ).join('');
    }

    escapeAttr(text) {
        return text.replace(/"/g, '&quot;');
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatbot-messages');
        const typingHTML = `
            <div class="message bot" id="typing-indicator">
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    async handleUserMessage() {
        if (this.isProcessing) return;
        
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.isProcessing = true;
        this.addMessage('user', message);
        input.value = '';
        
        // Hide suggestions while processing
        document.getElementById('chatbot-suggestions').innerHTML = '';
        
        setTimeout(async () => {
            this.showTypingIndicator();
            
            try {
                const response = await this.generateResponse(message);
                
                setTimeout(() => {
                    this.hideTypingIndicator();
                    this.addMessage('bot', response.text, response.isHtml);
                    
                    if (response.suggestions) {
                        this.showSuggestions(response.suggestions);
                    }
                    
                    this.isProcessing = false;
                }, 500 + Math.random() * 500);
                
            } catch (error) {
                console.error('Chatbot error:', error);
                this.hideTypingIndicator();
                this.addMessage('bot', "I apologize, but I encountered an error. Please try again.");
                this.isProcessing = false;
            }
        }, 300);
    }

    async generateResponse(message) {
        const intent = this.nlu.classifyIntent(message);
        const entities = this.nlu.extractEntities(message);
        
        console.log('🤖 Intent:', intent.intent, '| Entities:', entities);

        switch (intent.intent) {
            case 'SEARCH_MARTYR':
                return await this.handleSearchMartyr(message, entities);
            
            case 'COUNT_MARTYRS':
                return await this.handleCountMartyrs(entities);
            
            case 'LIST_MARTYRS':
                return await this.handleListMartyrs(entities);
            
            case 'MARTYR_BY_REGION':
                return await this.handleMartyrByRegion(entities);
            
            case 'MARTYR_BY_YEAR':
                return await this.handleMartyrByYear(entities);
            
            case 'MARTYR_BY_ORGANIZATION':
                return await this.handleMartyrByOrganization(entities);
            
            case 'RECENT_MARTYRS':
                return await this.handleRecentMartyrs();
            
            case 'RANDOM_MARTYR':
                return await this.handleRandomMartyr();
            
            case 'QUERY_HISTORY':
                return this.handleHistoryQuery(message);
            
            case 'QUERY_OCCUPATION':
                return this.handleOccupationQuery();
            
            case 'QUERY_RESISTANCE':
                return this.handleResistanceQuery();
            
            case 'QUERY_CULTURE':
                return this.handleCultureQuery();
            
            case 'QUERY_HUMAN_RIGHTS':
                return this.handleHumanRightsQuery();
            
            case 'HOW_TO_ADD':
                return this.handleHowToAdd();
            
            case 'ABOUT_MEMORIAL':
                return this.handleAboutMemorial();
            
            case 'GREETING':
                return this.handleGreeting();
            
            case 'THANKS':
                return this.handleThanks();
            
            case 'HELP':
                return this.handleHelp();
            
            case 'MORE_INFO':
                return await this.handleMoreInfo();
            
            default:
                return await this.handleDefault(message, entities);
        }
    }

    // ============================================
    // INTENT HANDLERS
    // ============================================

    async handleSearchMartyr(message, entities) {
        let searchQuery = message;
        
        // Extract name from message
        if (entities.names.length > 0) {
            searchQuery = entities.names[0];
        } else {
            // Clean up the query
            searchQuery = message
                .replace(/who is|tell me about|find|search|martyr named|information about|details of/gi, '')
                .trim();
        }

        if (!searchQuery || searchQuery.length < 2) {
            return {
                text: "Please provide a name to search for. For example: \"Tell me about [name]\" or \"Who is [name]?\"",
                suggestions: [
                    { text: '📋 List all', query: 'show all martyrs' },
                    { text: '🎲 Random martyr', query: 'tell me about a random martyr' }
                ]
            };
        }

        const results = await this.dataService.searchByName(searchQuery);
        
        if (results.length === 0) {
            // Try semantic search
            const semanticResults = await this.dataService.semanticSearch(searchQuery);
            
            if (semanticResults.length > 0) {
                this.context.setLastSearchResults(semanticResults);
                return {
                    text: `I couldn't find an exact match for "${searchQuery}", but here are some related results:\n\n${this.responseGenerator.formatMartyrsList(semanticResults)}`,
                    suggestions: [
                        { text: '🔍 Search again', query: 'search for ' },
                        { text: '📋 List all', query: 'show all martyrs' }
                    ]
                };
            }

            return {
                text: `I couldn't find any martyr named "${searchQuery}" in our database. The name might be spelled differently, or this person may not yet be documented.\n\nWould you like to help honor this hero by adding them to our memorial?`,
                suggestions: [
                    { text: '➕ Add martyr', query: 'how do I add a martyr' },
                    { text: '📋 List all', query: 'show all martyrs' }
                ]
            };
        }

        if (results.length === 1) {
            const martyr = results[0];
            this.context.setCurrentMartyr(martyr);
            return {
                text: this.responseGenerator.formatMartyrCard(martyr),
                isHtml: true,
                suggestions: [
                    { text: '🔍 Find another', query: 'search for ' },
                    { text: '📊 Statistics', query: 'show statistics' }
                ]
            };
        }

        // Multiple results
        this.context.setLastSearchResults(results);
        return {
            text: `Found ${results.length} martyrs matching "${searchQuery}":\n\n${this.responseGenerator.formatMartyrsList(results)}`,
            suggestions: results.slice(0, 3).map(m => ({
                text: `🕯️ ${m.fullName?.substring(0, 15)}...`,
                query: `tell me about ${m.fullName}`
            }))
        };
    }

    async handleCountMartyrs(entities) {
        const stats = await this.dataService.getStatistics();
        
        if (entities.regions.length > 0) {
            const region = entities.regions[0];
            const results = await this.dataService.searchByRegion(region);
            return {
                text: `There are **${results.length}** martyrs documented from ${region} in our memorial.`,
                suggestions: [
                    { text: `📋 List them`, query: `show martyrs from ${region}` },
                    { text: '📊 Full stats', query: 'show statistics' }
                ]
            };
        }

        if (entities.years.length > 0) {
            const year = entities.years[0];
            const results = await this.dataService.searchByYear(year);
            return {
                text: `There are **${results.length}** martyrs documented from the year ${year}.`,
                suggestions: [
                    { text: `📋 List them`, query: `show martyrs from ${year}` },
                    { text: '📊 Full stats', query: 'show statistics' }
                ]
            };
        }

        return {
            text: this.responseGenerator.formatStatistics(stats),
            suggestions: [
                { text: '🕯️ Recent', query: 'show recent martyrs' },
                { text: '📋 List all', query: 'show all martyrs' }
            ]
        };
    }

    async handleListMartyrs(entities) {
        const martyrs = await this.dataService.fetchMartyrs();
        
        if (martyrs.length === 0) {
            return {
                text: "No martyrs are currently documented in our memorial. Be the first to honor a hero.",
                suggestions: [
                    { text: '➕ Add martyr', query: 'how do I add a martyr' }
                ]
            };
        }

        this.context.setLastSearchResults(martyrs);
        return {
            text: this.responseGenerator.formatMartyrsList(martyrs, 10),
            suggestions: [
                { text: '🔍 Search', query: 'search for ' },
                { text: '📊 Statistics', query: 'show statistics' }
            ]
        };
    }

    async handleMartyrByRegion(entities) {
        if (entities.regions.length === 0) {
            return {
                text: "Which region would you like to search? For example: Turbat, Quetta, Gwadar, Panjgur, Khuzdar...",
                suggestions: [
                    { text: '🗺️ Turbat', query: 'martyrs from Turbat' },
                    { text: '🗺️ Quetta', query: 'martyrs from Quetta' },
                    { text: '🗺️ Gwadar', query: 'martyrs from Gwadar' }
                ]
            };
        }

        const region = entities.regions[0];
        const results = await this.dataService.searchByRegion(region);
        
        if (results.length === 0) {
            return {
                text: `No martyrs found from ${region}. They may be documented under a different region name.`,
                suggestions: [
                    { text: '📋 List all', query: 'show all martyrs' },
                    { text: '📊 Statistics', query: 'show statistics' }
                ]
            };
        }

        this.context.setLastSearchResults(results);
        return {
            text: `**Martyrs from ${region}:**\n\n${this.responseGenerator.formatMartyrsList(results)}`,
            suggestions: results.slice(0, 3).map(m => ({
                text: `🕯️ ${m.fullName?.substring(0, 15)}...`,
                query: `tell me about ${m.fullName}`
            }))
        };
    }

    async handleMartyrByYear(entities) {
        if (entities.years.length === 0) {
            const stats = await this.dataService.getStatistics();
            const years = Object.keys(stats.years).sort().reverse().slice(0, 5);
            
            return {
                text: "Which year are you interested in?",
                suggestions: years.map(y => ({ text: `📅 ${y}`, query: `martyrs from ${y}` }))
            };
        }

        const year = entities.years[0];
        const results = await this.dataService.searchByYear(year);
        
        if (results.length === 0) {
            return {
                text: `No martyrs documented for the year ${year}.`,
                suggestions: [
                    { text: '📊 Statistics', query: 'show statistics' }
                ]
            };
        }

        this.context.setLastSearchResults(results);
        return {
            text: `**Martyrs from ${year}:**\n\n${this.responseGenerator.formatMartyrsList(results)}`,
            suggestions: results.slice(0, 3).map(m => ({
                text: `🕯️ ${m.fullName?.substring(0, 15)}...`,
                query: `tell me about ${m.fullName}`
            }))
        };
    }

    async handleMartyrByOrganization(entities) {
        if (entities.organizations.length === 0) {
            return {
                text: "Which organization are you looking for? You can search by organization name like BSO, BNM, etc.",
                suggestions: [
                    { text: '📋 List all', query: 'show all martyrs' }
                ]
            };
        }

        const org = entities.organizations[0];
        const results = await this.dataService.searchByOrganization(org);
        
        this.context.setLastSearchResults(results);
        return {
            text: results.length > 0 
                ? `**Martyrs from ${org.toUpperCase()}:**\n\n${this.responseGenerator.formatMartyrsList(results)}`
                : `No martyrs found from organization "${org}".`,
            suggestions: [
                { text: '📋 List all', query: 'show all martyrs' }
            ]
        };
    }

    async handleRecentMartyrs() {
        const recent = await this.dataService.getRecentMartyrs(5);
        
        if (recent.length === 0) {
            return {
                text: "No martyrs have been documented yet. Be the first to honor a hero.",
                suggestions: [
                    { text: '➕ Add martyr', query: 'how do I add a martyr' }
                ]
            };
        }

        this.context.setLastSearchResults(recent);
        return {
            text: `**Recently Added Martyrs:**\n\n${this.responseGenerator.formatMartyrsList(recent)}`,
            suggestions: recent.slice(0, 3).map(m => ({
                text: `🕯️ ${m.fullName?.substring(0, 15)}...`,
                query: `tell me about ${m.fullName}`
            }))
        };
    }

    async handleRandomMartyr() {
        const martyr = await this.dataService.getRandomMartyr();
        
        if (!martyr) {
            return {
                text: "No martyrs are currently documented.",
                suggestions: [
                    { text: '➕ Add martyr', query: 'how do I add a martyr' }
                ]
            };
        }

        this.context.setCurrentMartyr(martyr);
        return {
            text: `Let me share the story of:\n\n${this.responseGenerator.formatMartyrCard(martyr)}`,
            isHtml: true,
            suggestions: [
                { text: '🎲 Another story', query: 'tell me about another martyr' },
                { text: '📊 Statistics', query: 'show statistics' }
            ]
        };
    }

    handleHistoryQuery(message) {
        const kb = this.responseGenerator.knowledgeBase.history;
        
        if (message.toLowerCase().includes('ancient') || message.toLowerCase().includes('mehrgarh')) {
            return {
                text: kb.ancient,
                suggestions: [
                    { text: '🏛️ Khanate', query: 'tell me about the Khanate of Kalat' },
                    { text: '⚔️ Occupation', query: 'how was Baluchistan occupied' }
                ]
            };
        }

        if (message.toLowerCase().includes('khanate') || message.toLowerCase().includes('kalat')) {
            return {
                text: kb.khanate,
                suggestions: [
                    { text: '📜 Ancient', query: 'tell me about ancient Baluchistan' },
                    { text: '⚔️ Occupation', query: 'how was Baluchistan occupied' }
                ]
            };
        }

        return {
            text: kb.overview,
            suggestions: [
                { text: '📜 Ancient', query: 'tell me about ancient Baluchistan' },
                { text: '🏛️ Khanate', query: 'tell me about the Khanate of Kalat' },
                { text: '⚔️ 1948', query: 'what happened in 1948' }
            ]
        };
    }

    handleOccupationQuery() {
        const kb = this.responseGenerator.knowledgeBase.occupation;
        return {
            text: kb.overview,
            suggestions: [
                { text: '⚖️ Legal', query: 'legal arguments against occupation' },
                { text: '✊ Resistance', query: 'tell me about the resistance' },
                { text: '🕯️ Martyrs', query: 'show martyrs' }
            ]
        };
    }

    handleResistanceQuery() {
        const kb = this.responseGenerator.knowledgeBase.resistance;
        return {
            text: kb.overview + "\n\n" + kb.leaders,
            suggestions: [
                { text: '🕯️ Martyrs', query: 'show recent martyrs' },
                { text: '📊 Statistics', query: 'show statistics' }
            ]
        };
    }

    handleCultureQuery() {
        return {
            text: "Baluch culture is built on principles of **honor (ghairat)**, **hospitality (mehrbani)**, and **justice (insaf)**. The rich traditions include:\n\n• Epic oral poetry and folk tales\n• Traditional music with suroz and dhol\n• World-renowned Baluchi embroidery\n• The ancient Baluchi language\n\nThese traditions have been preserved for thousands of years despite attempts at cultural suppression.",
            suggestions: [
                { text: '📜 History', query: 'tell me about history' },
                { text: '🕯️ Martyrs', query: 'show martyrs' }
            ]
        };
    }

    handleHumanRightsQuery() {
        const kb = this.responseGenerator.knowledgeBase.humanRights;
        return {
            text: kb.overview,
            suggestions: [
                { text: '🕯️ Martyrs', query: 'show martyrs' },
                { text: '✊ Resistance', query: 'tell me about resistance' }
            ]
        };
    }

    handleHowToAdd() {
        const kb = this.responseGenerator.knowledgeBase.memorial;
        return {
            text: kb.howToAdd,
            suggestions: [
                { text: '➕ Add Now', query: 'go to add martyr page' },
                { text: '📋 View Gallery', query: 'show all martyrs' }
            ]
        };
    }

    handleAboutMemorial() {
        const kb = this.responseGenerator.knowledgeBase.memorial;
        return {
            text: kb.purpose,
            suggestions: [
                { text: '📊 Statistics', query: 'show statistics' },
                { text: '➕ Contribute', query: 'how do I add a martyr' }
            ]
        };
    }

    handleGreeting() {
        const greetings = [
            "Hello! I'm the Memorial Assistant. I can help you learn about documented martyrs and Baluchistan's history. What would you like to know?",
            "Salaam! Welcome to the Baluch Martyrs Memorial. How can I assist you today?",
            "Greetings! I'm here to help you explore our memorial and learn about the heroes documented here."
        ];
        return {
            text: greetings[Math.floor(Math.random() * greetings.length)],
            suggestions: [
                { text: '🕯️ Martyrs', query: 'show recent martyrs' },
                { text: '📜 History', query: 'tell me about history' },
                { text: '📊 Statistics', query: 'show statistics' }
            ]
        };
    }

    handleThanks() {
        return {
            text: "You're welcome. The memory of these heroes lives on through people like you who seek to learn their stories. Is there anything else you'd like to know?",
            suggestions: [
                { text: '🕯️ More martyrs', query: 'show more martyrs' },
                { text: '📜 History', query: 'tell me about history' }
            ]
        };
    }

    handleHelp() {
        return {
            text: `**What I can help you with:**\n\n🕯️ **Martyr Information**\n• "Tell me about [name]"\n• "Show martyrs from [region]"\n• "Martyrs from [year]"\n• "Show recent martyrs"\n\n📊 **Statistics**\n• "How many martyrs?"\n• "Show statistics"\n\n📜 **History & Context**\n• "History of Baluchistan"\n• "What happened in 1948?"\n• "Tell me about the resistance"\n\n➕ **Contributing**\n• "How do I add a martyr?"`,
            suggestions: [
                { text: '🕯️ Martyrs', query: 'show martyrs' },
                { text: '📊 Stats', query: 'statistics' },
                { text: '📜 History', query: 'history' }
            ]
        };
    }

    async handleMoreInfo() {
        if (this.context.currentMartyr) {
            const martyr = this.context.currentMartyr;
            let moreInfo = `**More about ${martyr.fullName}:**\n\n`;
            
            if (martyr.biography && martyr.biography.length > 200) {
                moreInfo += martyr.biography;
            } else if (martyr.familyDetails) {
                moreInfo += `**Family:** ${martyr.familyDetails}`;
            } else {
                moreInfo = "I've shared all the available information about this martyr. Would you like to learn about someone else?";
            }

            return {
                text: moreInfo,
                suggestions: [
                    { text: '🎲 Random martyr', query: 'tell me about another martyr' },
                    { text: '📋 List all', query: 'show all martyrs' }
                ]
            };
        }

        if (this.context.lastSearchResults.length > 0) {
            return {
                text: this.responseGenerator.formatMartyrsList(this.context.lastSearchResults, 10),
                suggestions: [
                    { text: '📊 Statistics', query: 'show statistics' }
                ]
            };
        }

        return this.handleHelp();
    }

    async handleDefault(message, entities) {
        // Try semantic search as fallback
        const results = await this.dataService.semanticSearch(message);
        
        if (results.length > 0) {
            this.context.setLastSearchResults(results);
            return {
                text: `I found some martyrs that might be related to your question:\n\n${this.responseGenerator.formatMartyrsList(results)}`,
                suggestions: results.slice(0, 3).map(m => ({
                    text: `🕯️ ${m.fullName?.substring(0, 15)}...`,
                    query: `tell me about ${m.fullName}`
                }))
            };
        }

        return {
            text: "I'm not sure I understand. I can help you with:\n\n• Information about documented martyrs\n• Baluchistan's history and resistance\n• Statistics and memorial information\n\nTry asking something like \"Tell me about [name]\" or \"Show martyrs from [region]\".",
            suggestions: [
                { text: '❓ Help', query: 'help' },
                { text: '🕯️ Martyrs', query: 'show recent martyrs' },
                { text: '📜 History', query: 'history of Baluchistan' }
            ]
        };
    }
}

// ============================================
// INITIALIZE CHATBOT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase to be available
    const initChatbot = () => {
        console.log('🤖 Initializing AI Memorial Assistant...');
        window.memorialChatbot = new BaluchistanChatbot();
    };

    // Try immediate initialization, or wait for Firebase
    if (window.firebaseDB) {
        initChatbot();
    } else {
        // Wait up to 5 seconds for Firebase
        let attempts = 0;
        const checkFirebase = setInterval(() => {
            attempts++;
            if (window.firebaseDB || attempts >= 50) {
                clearInterval(checkFirebase);
                initChatbot();
            }
        }, 100);
    }
});
