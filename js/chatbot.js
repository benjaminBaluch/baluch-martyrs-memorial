// AI-Powered Conversational Engine v2.1
class NLU_ENGINE {
    constructor() {
        this.intents = {
            // High-Level Queries
            QUERY_HISTORY: { keywords: ['history', 'historical', 'past'], priority: 10 },
            QUERY_OCCUPATION: { keywords: ['occupied', 'occupation', 'annexation', 'illegal'], priority: 10 },
            QUERY_RESISTANCE: { keywords: ['resistance', 'insurgency', 'rebellion', 'fight', 'struggle'], priority: 10 },
            QUERY_CULTURE: { keywords: ['culture', 'tradition', 'custom', 'heritage'], priority: 10 },
            QUERY_LEADERS: { keywords: ['leaders', 'heroes', 'martyrs', 'sacrifice'], priority: 10 },

            // Granular History Intents
            QUERY_HISTORY_ANCIENT: { keywords: ['ancient', 'mehrgarh', 'old'], priority: 20 },
            QUERY_HISTORY_MEDIEVAL: { keywords: ['medieval', 'migration', 'rind-lashari'], priority: 20 },
            QUERY_HISTORY_BRITISH: { keywords: ['british', 'colonial', 'sandeman'], priority: 20 },
            QUERY_HISTORY_KHANATE: { keywords: ['khanate', 'kalat', 'nasir khan'], priority: 20 },

            // Granular Occupation Intents
            QUERY_OCCUPATION_LEGAL: { keywords: ['legal', 'law', 'illegal', 'un charter'], priority: 20 },
            QUERY_OCCUPATION_PARTITION: { keywords: ['1947', '1948', 'partition', 'annexation'], priority: 20 },

            // Conversational Intents
            GREETING: { keywords: ['hello', 'hi', 'salaam', 'greetings', 'hey'], priority: 5 },
            CONTEXT_MORE_INFO: { keywords: ['more', 'tell me more', 'details', 'elaborate'], priority: 15 },
            DEFAULT: { keywords: [], priority: 0 }
        };
    }

    getIntent(message) {
        const lowerMessage = message.toLowerCase();
        let bestMatch = { intent: 'DEFAULT', priority: 0 };

        for (const intentName in this.intents) {
            const intent = this.intents[intentName];
            if (intent.keywords.some(keyword => lowerMessage.includes(keyword))) {
                if (intent.priority > bestMatch.priority) {
                    bestMatch = { intent: intentName, priority: intent.priority };
                }
            }
        }
        return bestMatch.intent;
    }
}

class ConversationContext {
    constructor(knowledgeBase) {
        this.history = [];
        this.currentTopic = null;
        this.currentSubTopic = null;
        this.topicQueue = [];
        this.knowledgeBase = knowledgeBase;
    }

    setContext(topic, subTopic) {
        this.currentTopic = topic;
        this.currentSubTopic = subTopic;
        this.history.push({ topic, subTopic });
        // Create a logical queue for 'tell me more'
        this.topicQueue = [];
        if (topic) {
            this.topicQueue = Object.keys(this.knowledgeBase[topic] || {}).filter(st => st !== subTopic);
        }
    }

    getNextInTopic() {
        if (this.topicQueue.length > 0) {
            const nextSubTopic = this.topicQueue.shift();
            this.currentSubTopic = nextSubTopic;
            return { topic: this.currentTopic, subTopic: nextSubTopic };
        }
        return null;
    }
}

class BaluchistanChatbot {
    constructor() {
        this.isMinimized = true;
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.nluEngine = new NLU_ENGINE();
        this.context = new ConversationContext(this.knowledgeBase);
        this.init();
    }

    init() {
        this.createChatbotHTML();
        this.attachEventListeners();
        this.showWelcomeMessage();
    }

    initializeKnowledgeBase() {
        return {
            history: {
                ancient: {
                    title: "Ancient Baluchistan",
                    content: "Baluchistan has one of the oldest civilizations on Earth. The Mehrgarh civilization (7000-2500 BCE) in Baluchistan predates the Indus Valley by thousands of years, making it one of humanity's earliest agricultural settlements. Archaeological evidence shows sophisticated urban planning, advanced metallurgy, and trade networks extending to Central Asia and the Arabian Peninsula.",
                    facts: [
                        "Mehrgarh is 9,000 years old - older than Mesopotamia",
                        "First evidence of wheat and barley cultivation in South Asia",
                        "Advanced dental practices dating back 7,000 years",
                        "Sophisticated pottery and bronze-working techniques"
                    ]
                },
                medieval: {
                    title: "Medieval Era & Baluch Migration",
                    content: "The Baluch people migrated from the Caspian Sea region around 1000 CE, settling in what is now Baluchistan. They established powerful tribal confederations and kingdoms, with the Rind-Lashari conflicts becoming legendary in Baluch folklore. This period saw the development of distinct Baluch culture, language, and social structures.",
                    facts: [
                        "Migration from Caspian region around 1000 CE",
                        "Establishment of powerful tribal confederations",
                        "Development of oral traditions and epic poetry",
                        "Mir Chakar Rind became a legendary figure"
                    ]
                },
                british: {
                    title: "British Colonial Period",
                    content: "The British colonial administration under Robert Sandeman implemented the 'Sandeman System' (1877-1947), which recognized tribal autonomy while establishing colonial control. This period saw the construction of strategic railways and the exploitation of Baluchistan's natural resources for British imperial interests.",
                    facts: [
                        "Sandeman System established in 1877",
                        "Strategic railways built for imperial control",
                        "Natural resources exploited for British benefit",
                        "Tribal autonomy partially preserved"
                    ]
                },
                khanate: {
                    title: "Khanate of Kalat",
                    content: "The Khanate of Kalat was an independent Baluch state that existed for over 400 years. Under rulers like Nasir Khan I (1750-1794), it became a powerful confederation controlling trade routes between Central Asia and the Indian Ocean. The Khanate maintained its independence until the controversial annexation by Pakistan in 1948.",
                    facts: [
                        "Independent state for over 400 years",
                        "Controlled strategic trade routes",
                        "Nasir Khan I expanded the confederation",
                        "Had its own currency, army, and diplomatic relations"
                    ]
                }
            },
            occupation: {
                legal: {
                    title: "Legal Arguments Against Occupation",
                    content: "International law experts argue that Pakistan's annexation of Baluchistan violates multiple principles of international law, including the UN Charter's right to self-determination. The forced integration without proper consent or referendum contradicts established legal precedents for state formation.",
                    facts: [
                        "Violates UN Charter Article 1 (self-determination)",
                        "No legitimate referendum or consultation held",
                        "Contradicts principles established at UN founding",
                        "Multiple UN resolutions support self-determination rights"
                    ]
                },
                partition: {
                    title: "1947-1948 Annexation",
                    content: "On August 11, 1947, the Khan of Kalat declared Baluchistan's independence, citing the end of British paramountcy and the state's right to choose its own future. However, Pakistan militarily occupied Baluchistan on March 27, 1948, forcing the Khan to sign an Instrument of Accession under duress.",
                    facts: [
                        "August 11, 1947: Declaration of independence",
                        "March 27, 1948: Military occupation by Pakistan",
                        "Forced signing of Instrument of Accession",
                        "No consultation with Baluch people conducted"
                    ]
                }
            },
            resistance: {
                movements: {
                    title: "Resistance Movements",
                    content: "Since 1948, Baluchistan has witnessed continuous resistance movements led by various leaders fighting for independence and autonomy. These movements represent the legitimate aspirations of the Baluch people for self-determination and freedom from occupation.",
                    facts: [
                        "First uprising led by Prince Abdul Karim in 1948",
                        "Major insurgencies in 1958-59, 1963-69, 1973-77",
                        "Current movement began in early 2000s",
                        "Represents continuous struggle for self-determination"
                    ]
                },
                leaders: {
                    title: "Freedom Fighters & Leaders",
                    content: "Baluch freedom fighters have sacrificed their lives for the cause of independence. Leaders like Nawab Akbar Bugti, Balach Marri, and countless others have paid the ultimate price in their struggle for Baluch freedom and dignity.",
                    facts: [
                        "Nawab Akbar Bugti: killed in 2006 by Pakistani forces",
                        "Balach Marri: prominent independence leader",
                        "Thousands of activists have been forcibly disappeared",
                        "Many leaders continue the struggle in exile"
                    ]
                }
            },
            culture: {
                traditions: {
                    title: "Rich Cultural Heritage",
                    content: "Baluch culture is characterized by its emphasis on honor (ghairat), hospitality (mehrbani), and justice (insaf). The oral tradition includes epic poetry, folk tales, and historical narratives passed down through generations. Traditional crafts, music, and dance reflect the nomadic heritage and connection to the land.",
                    facts: [
                        "Oral tradition preserves thousands of years of history",
                        "Traditional music includes suroz and dhol",
                        "Baluchi embroidery is world-renowned",
                        "Hospitality code governs social interactions"
                    ]
                },
                language: {
                    title: "Baluchi Language",
                    content: "Baluchi is an ancient Indo-European language with rich literary traditions. Despite systematic suppression, it remains the mother tongue of the Baluch people and a symbol of their distinct identity. Classical Baluchi literature includes works by poets like Jam Durrak and Mubarak Qazi.",
                    facts: [
                        "Ancient Indo-European language",
                        "Rich oral and written literature",
                        "Multiple dialects across the region",
                        "Symbol of Baluch national identity"
                    ]
                }
            },
            humanrights: {
                violations: {
                    title: "Human Rights Violations",
                    content: "International human rights organizations have documented systematic violations in Baluchistan, including enforced disappearances, extrajudicial killings, and torture. The Pakistani state's military operations have displaced hundreds of thousands and created a humanitarian crisis.",
                    facts: [
                        "Over 25,000 people have been forcibly disappeared",
                        "Systematic torture in detention centers",
                        "Extrajudicial killings by security forces",
                        "Mass displacement of civilian populations"
                    ]
                },
                international: {
                    title: "International Recognition",
                    content: "Human rights organizations, parliamentarians, and governments worldwide have expressed concern about the situation in Baluchistan. Resolutions have been passed in various parliaments calling for international intervention and recognition of Baluch rights.",
                    facts: [
                        "US Congress hearings on Baluchistan (2012, 2013)",
                        "European Parliament resolutions",
                        "UN Human Rights Council interventions",
                        "Reports by Amnesty International and HRW"
                    ]
                }
            }
        };
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div class="chatbot-container minimized" id="chatbot-container">
                <div class="chatbot-header" id="chatbot-header">
                    <div class="chatbot-info">
                        <div class="chatbot-title">Baluchistan AI Guide</div>
                        <div class="chatbot-subtitle">Learn about our history & struggle</div>
                    </div>
                    <button class="chatbot-toggle" id="chatbot-toggle">−</button>
                </div>
                <div class="chatbot-body">
                    <div class="chatbot-messages" id="chatbot-messages"></div>
                    <div class="chatbot-input-area">
                        <div class="chatbot-quick-buttons" id="quick-buttons"></div>
                        <div class="chatbot-input-wrapper">
                            <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Ask about Baluchistan..." maxlength="500">
                            <button class="chatbot-send" id="chatbot-send">➤</button>
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

        // Toggle chatbot
        header.addEventListener('click', (e) => {
            if (this.isMinimized && !e.target.closest('.chatbot-toggle')) {
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
            if (e.key === 'Enter') {
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
            toggle.textContent = '💬';
        } else {
            container.classList.remove('minimized');
            toggle.textContent = '−';
            // Focus input when opened
            setTimeout(() => {
                document.getElementById('chatbot-input').focus();
            }, 300);
        }
    }

    showWelcomeMessage() {
        setTimeout(() => {
            const welcomeMsg = this.getDynamicGreeting();
            this.addMessage('bot', welcomeMsg);
            this.showQuickButtons();
        }, 1000);
    }

    addMessage(sender, content, timestamp = true) {
        const messagesContainer = document.getElementById('chatbot-messages');
        const time = timestamp ? new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        
        const messageHTML = `
            <div class="message ${sender}">
                <div class="message-bubble">${content}</div>
                ${timestamp ? `<div class="message-time">${time}</div>` : ''}
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showQuickButtons() {
        const quickButtonsContainer = document.getElementById('quick-buttons');
        const buttons = [
            { text: '📜 History', action: 'history' },
            { text: '⚖️ Occupation', action: 'occupation' },
            { text: '✊ Resistance', action: 'resistance' },
            { text: '🎨 Culture', action: 'culture' },
            { text: '🕊️ Human Rights', action: 'humanrights' }
        ];
        
        quickButtonsContainer.innerHTML = buttons.map(btn => 
            `<button class="quick-btn" data-action="${btn.action}">${btn.text}</button>`
        ).join('');
        
        // Attach click listeners
        quickButtonsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-btn')) {
                this.handleQuickButton(e.target.dataset.action);
            }
        });
    }

    handleQuickButton(action) {
        const responses = {
            history: "Baluchistan has a rich history spanning 9,000 years, from the ancient Mehrgarh civilization to the independent Khanate of Kalat. What specific period interests you?",
            occupation: "In 1948, Pakistan militarily occupied the independent state of Baluchistan, violating international law and the UN Charter. This occupation continues today despite ongoing resistance.",
            resistance: "The Baluch people have continuously resisted occupation since 1948, with multiple liberation movements fighting for independence and self-determination. Many brave leaders have sacrificed their lives for freedom.",
            culture: "Baluch culture is built on principles of honor, hospitality, and justice. Our rich traditions include epic poetry, traditional crafts, music, and the beautiful Baluchi language.",
            humanrights: "International organizations have documented systematic human rights violations in Baluchistan, including over 25,000 enforced disappearances and widespread torture by Pakistani forces."
        };
        
        this.addMessage('user', document.querySelector(`[data-action="${action}"]`).textContent);
        
        setTimeout(() => {
            this.showTypingIndicator();
            setTimeout(() => {
                this.hideTypingIndicator();
                this.addMessage('bot', responses[action]);
                this.context.setContext(action, 'overview');
            }, 1500);
        }, 500);
    }

    handleUserMessage() {
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.addMessage('user', message);
        input.value = '';
        
        setTimeout(() => {
            this.showTypingIndicator();
            const response = this.generateResponse(message);
            
            setTimeout(() => {
                this.hideTypingIndicator();
                this.addMessage('bot', response);
            }, 1000 + Math.random() * 1000);
        }, 500);
    }

    generateResponse(message) {
        const intent = this.nluEngine.getIntent(message);
        
        switch (intent) {
            case 'GREETING':
                return this.getDynamicGreeting();
            
            case 'QUERY_HISTORY':
            case 'QUERY_HISTORY_ANCIENT':
            case 'QUERY_HISTORY_MEDIEVAL':
            case 'QUERY_HISTORY_BRITISH':
            case 'QUERY_HISTORY_KHANATE':
                return this.getHistoryResponse(intent);
            
            case 'QUERY_OCCUPATION':
            case 'QUERY_OCCUPATION_LEGAL':
            case 'QUERY_OCCUPATION_PARTITION':
                return this.getOccupationResponse(intent);
            
            case 'QUERY_RESISTANCE':
                return this.getResistanceResponse();
            
            case 'QUERY_CULTURE':
                return this.getCultureResponse();
            
            case 'QUERY_LEADERS':
                return this.getLeadersResponse();
            
            case 'CONTEXT_MORE_INFO':
                return this.getMoreInfoResponse();
            
            default:
                return this.getDefaultResponse(message);
        }
    }

    getHistoryResponse(intent) {
        const historyResponses = {
            'QUERY_HISTORY_ANCIENT': this.knowledgeBase.history.ancient,
            'QUERY_HISTORY_MEDIEVAL': this.knowledgeBase.history.medieval,
            'QUERY_HISTORY_BRITISH': this.knowledgeBase.history.british,
            'QUERY_HISTORY_KHANATE': this.knowledgeBase.history.khanate
        };
        
        if (historyResponses[intent]) {
            const data = historyResponses[intent];
            return `**${data.title}**\n\n${data.content}\n\n**Key Facts:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
        }
        
        return "Baluchistan's history spans over 9,000 years, from the ancient Mehrgarh civilization to the independent Khanate of Kalat. Which period would you like to explore: Ancient, Medieval, British Colonial, or the Khanate era?";
    }

    getOccupationResponse(intent) {
        if (intent === 'QUERY_OCCUPATION_LEGAL') {
            const data = this.knowledgeBase.occupation.legal;
            return `**${data.title}**\n\n${data.content}\n\n**Legal Violations:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
        }
        
        if (intent === 'QUERY_OCCUPATION_PARTITION') {
            const data = this.knowledgeBase.occupation.partition;
            return `**${data.title}**\n\n${data.content}\n\n**Timeline:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
        }
        
        return "Pakistan's occupation of Baluchistan began in 1948 when they militarily annexed the independent Khanate of Kalat. This occupation violates international law and the UN Charter's principles of self-determination.";
    }

    getResistanceResponse() {
        const data = this.knowledgeBase.resistance.movements;
        return `**${data.title}**\n\n${data.content}\n\n**Resistance Timeline:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
    }

    getCultureResponse() {
        const data = this.knowledgeBase.culture.traditions;
        return `**${data.title}**\n\n${data.content}\n\n**Cultural Elements:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
    }

    getLeadersResponse() {
        const data = this.knowledgeBase.resistance.leaders;
        return `**${data.title}**\n\n${data.content}\n\n**Notable Leaders:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
    }

    getMoreInfoResponse() {
        const next = this.context.getNextInTopic();
        if (next && this.knowledgeBase[next.topic] && this.knowledgeBase[next.topic][next.subTopic]) {
            const data = this.knowledgeBase[next.topic][next.subTopic];
            return `**${data.title}**\n\n${data.content}\n\n**Additional Facts:**\n${data.facts.map(fact => `• ${fact}`).join('\n')}`;
        }
        return "I'd be happy to provide more information! You can ask about our history, the ongoing occupation, resistance movements, culture, or human rights issues.";
    }

    getDefaultResponse(message) {
        const responses = [
            "That's an interesting question about Baluchistan. Our history spans thousands of years with rich cultural traditions and an ongoing struggle for freedom.",
            "Baluchistan has a complex and fascinating story. Would you like to know about our ancient history, cultural heritage, or the current liberation movement?",
            "I'm here to share knowledge about Baluchistan's rich heritage and ongoing struggle for independence. What aspect interests you most?"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    getDynamicGreeting() {
        const greetings = [
            "Welcome! I'm here to share the remarkable history and ongoing struggle of Baluchistan. What would you like to learn about?",
            "Greetings! Discover the rich heritage of Baluchistan - from our 9,000-year-old civilization to our fight for freedom. How can I help?",
            "Hello! Learn about Baluchistan's ancient history, vibrant culture, and the liberation movement. What interests you?"
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatbot-messages');
        const typingHTML = `
            <div class="message bot" id="typing-indicator">
                <div class="typing-indicator">
                    <div class="typing-dots">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BaluchistanChatbot();
});
