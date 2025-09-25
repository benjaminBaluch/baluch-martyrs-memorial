// Baluchistan AI Chatbot - Educational Assistant
class BaluchistanChatbot {
    constructor() {
        this.isMinimized = true;
        this.conversationHistory = [];
        this.currentContext = null;
        this.knowledgeBase = this.initializeKnowledgeBase();
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
                    content: "Baluchistan has been inhabited for thousands of years. Archaeological evidence from Mehrgarh (7000 BCE) shows it was one of the earliest centers of agriculture and civilization. The region has been home to various Indo-Iranian tribes and has maintained its distinct cultural identity through millennia."
                },
                medieval: {
                    title: "Medieval Period", 
                    content: "During medieval times, Baluchistan was ruled by various local dynasties. The Baluch people migrated to the region around 1000 CE, establishing tribal confederations. The area remained largely autonomous despite nominal control by various empires including the Safavids and Mughals."
                },
                british: {
                    title: "British Colonial Period",
                    content: "The British first intervened in Baluchistan in 1839 during the First Anglo-Afghan War. Through treaties and military campaigns, they gradually brought the region under colonial control. The British divided Baluchistan into British Baluchistan and princely states, disrupting traditional tribal governance."
                },
                khanate: {
                    title: "Khanate of Kalat",
                    content: "The Khanate of Kalat was the most powerful Baluch state, established in the 17th century. Under Khan Nasir Khan I (1749-1795), it reached its peak, controlling most of present-day Baluchistan. The Khanate maintained semi-independence until the British colonial period."
                }
            },
            occupation: {
                partition: {
                    title: "1947 Partition and Forced Annexation",
                    content: "At the time of partition in 1947, the Khan of Kalat declared Baluchistan's independence on August 12, 1947 - three days before Pakistan's creation. However, Pakistan forcibly annexed Baluchistan in March 1948, despite the Khan's protests and the region's declared independence."
                },
                legal_status: {
                    title: "Legal Status of Occupation",
                    content: "Many Baluch consider the 1948 annexation illegal under international law. The Khanate of Kalat had signed no accession treaty with Pakistan. The forced incorporation violated the principles of self-determination and the wishes of the Baluch people."
                },
                resistance: {
                    title: "Baluch Resistance Movements",
                    content: "There have been five major Baluch insurgencies (1948, 1958-59, 1963-69, 1973-77, and 2004-present). These movements seek greater autonomy or independence, citing economic exploitation, cultural suppression, and political marginalization."
                },
                human_rights: {
                    title: "Human Rights Violations",
                    content: "International human rights organizations have documented enforced disappearances, extrajudicial killings, and torture in Baluchistan. Thousands of Baluch activists, students, and civilians have been subjected to enforced disappearances."
                }
            },
            resources: {
                natural: {
                    title: "Natural Resources",
                    content: "Baluchistan is rich in natural resources including natural gas (Sui gas field supplies much of Pakistan), coal, copper, gold, and other minerals. The deep-sea port of Gwadar is strategically important for trade routes, particularly China's Belt and Road Initiative."
                },
                exploitation: {
                    title: "Resource Exploitation",
                    content: "Despite being Pakistan's largest province and richest in resources, Baluchistan remains the poorest. Most gas and mineral wealth is extracted but revenues don't benefit the local population. This economic exploitation is a major grievance driving the independence movement."
                }
            },
            culture: {
                language: {
                    title: "Baluchi Language and Literature",
                    content: "Baluchi is an ancient Iranian language with rich oral traditions. Despite centuries of pressure, Baluch people have preserved their language, poetry, and folk stories. The language faces challenges from official policies promoting Urdu and other languages."
                },
                traditions: {
                    title: "Cultural Traditions",
                    content: "Baluch culture emphasizes honor (ghairat), hospitality, and tribal solidarity. Traditional practices include folk music, dance, handicrafts, and oral poetry. The Baluch code of conduct (Mayar) governs social relations and conflict resolution."
                },
                suppression: {
                    title: "Cultural Suppression",
                    content: "Systematic efforts have been made to suppress Baluch culture, including restrictions on language education, cultural events, and traditional governance systems. Many Baluch see this as cultural imperialism designed to weaken their distinct identity."
                }
            },
            leaders: {
                historical: {
                    title: "Historical Leaders",
                    content: "Notable Baluch leaders include Khan Nasir Khan I of Kalat, Prince Abdul Karim who fought against British colonialism, and Khan of Kalat Mir Ahmad Yar Khan who declared independence in 1947."
                },
                modern: {
                    title: "Modern Independence Leaders",
                    content: "Modern Baluch nationalist leaders include Nawab Khair Bakhsh Marri, Sardar Ataullah Mengal, and Nawab Akbar Khan Bugti. These leaders advocated for Baluch rights and many faced imprisonment or exile for their political activities."
                },
                martyrs: {
                    title: "Baluch Martyrs",
                    content: "Thousands of Baluch have sacrificed their lives for freedom, including Nawab Akbar Khan Bugti (killed 2006), Balach Marri, and countless unnamed youth who have been disappeared or killed. This memorial website honors their sacrifice for the cause of liberation."
                }
            },
            current_situation: {
                political: {
                    title: "Current Political Situation",
                    content: "The Baluch independence movement continues despite military operations. Various political parties and armed groups demand everything from greater autonomy to complete independence. International awareness of the Baluch cause has grown in recent years."
                },
                international: {
                    title: "International Perspective",
                    content: "Several countries and international bodies have raised concerns about human rights in Baluchistan. The Baluch diaspora actively campaigns for independence in Europe, North America, and other regions, seeking international recognition and support."
                }
            }
        };
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div id="chatbot-container" class="chatbot-container minimized">
                <div class="chatbot-header" onclick="chatbot.toggleChatbot()">
                    <div>
                        <div class="chatbot-title">Baluchistan AI Guide</div>
                        <div class="chatbot-subtitle">Learn about occupied Baluchistan</div>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <div id="language-toggle-container"></div>
                        <button class="chatbot-toggle" onclick="chatbot.toggleChatbot(); event.stopPropagation();">−</button>
                    </div>
                </div>
                <div class="language-indicator" id="language-indicator">EN</div>
                <div class="chatbot-body">
                    <div class="chatbot-messages" id="chatbot-messages"></div>
                    <div class="chatbot-input-area">
                        <div class="chatbot-quick-buttons" id="quick-buttons"></div>
                        <div class="chatbot-input-wrapper">
                            <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Ask about Baluchistan's history..." />
                            <button class="chatbot-send" onclick="chatbot.sendMessage()">→</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
        
        // Wait for translator to load and add language toggle
        setTimeout(() => {
            this.initializeLanguageSupport();
        }, 500);
    }

    attachEventListeners() {
        const input = document.getElementById('chatbot-input');
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    toggleChatbot() {
        const container = document.getElementById('chatbot-container');
        const toggle = container.querySelector('.chatbot-toggle');
        
        if (this.isMinimized) {
            container.classList.remove('minimized');
            container.classList.add('opening');
            toggle.textContent = '−';
            this.isMinimized = false;
            
            setTimeout(() => {
                container.classList.remove('opening');
            }, 300);
        } else {
            container.classList.add('closing');
            toggle.textContent = '+';
            this.isMinimized = true;
            
            setTimeout(() => {
                container.classList.remove('closing');
                container.classList.add('minimized');
            }, 300);
        }
    }

    async initializeLanguageSupport() {
        // Wait for translator to be ready
        if (!window.translator) {
            setTimeout(() => this.initializeLanguageSupport(), 500);
            return;
        }
        
        // Add language toggle to header
        const toggleContainer = document.getElementById('language-toggle-container');
        if (toggleContainer) {
            toggleContainer.innerHTML = window.translator.getLanguageToggleHTML();
        }
        
        // Set initial language state
        this.updateLanguageInterface();
    }
    
    updateLanguageInterface() {
        if (!window.translator) return;
        
        const container = document.getElementById('chatbot-container');
        const indicator = document.getElementById('language-indicator');
        const input = document.getElementById('chatbot-input');
        
        const currentLang = window.translator.getCurrentLanguage();
        const direction = window.translator.getTextDirection();
        
        // Update container attributes
        container.setAttribute('dir', direction);
        container.classList.toggle('baluchi-mode', currentLang === 'bal');
        
        // Update language indicator
        indicator.textContent = currentLang === 'bal' ? 'بلوچی' : 'EN';
        
        // Update input placeholder
        if (currentLang === 'bal') {
            input.placeholder = 'بلوچستان کی تاریخ کے بارے میں پوچھیں...';
        } else {
            input.placeholder = "Ask about Baluchistan's history...";
        }
    }
    
    async refreshWithLanguage() {
        // Clear current messages
        document.getElementById('chatbot-messages').innerHTML = '';
        document.getElementById('quick-buttons').innerHTML = '';
        
        // Update interface
        this.updateLanguageInterface();
        
        // Show welcome message in new language
        await this.showWelcomeMessage();
    }

    async showWelcomeMessage() {
        const welcomeMessage = window.translator ? 
            await window.translator.getWelcomeMessage() : 
            "السلام علیکم! I'm your AI guide to learning about Baluchistan as an occupied land. I can tell you about:";
            
        const buttons = [
            'History of Baluchistan',
            'Why it\'s considered occupied',
            'Baluch resistance movements',
            'Cultural heritage',
            'Natural resources',
            'Human rights situation'
        ];
        
        setTimeout(async () => {
            this.addMessage('bot', welcomeMessage, false);
            
            if (window.translator) {
                const translatedButtons = await window.translator.translateQuickButtons(buttons);
                this.showQuickButtons(translatedButtons, buttons); // Pass original buttons as reference
            } else {
                this.showQuickButtons(buttons);
            }
        }, 1000);
    }

    showQuickButtons(buttons, originalButtons = null) {
        const quickButtonsContainer = document.getElementById('quick-buttons');
        quickButtonsContainer.innerHTML = '';
        
        buttons.forEach((buttonText, index) => {
            const button = document.createElement('button');
            button.className = 'quick-btn';
            button.textContent = buttonText;
            // Use original button text for logic if available, otherwise use displayed text
            const logicText = originalButtons ? originalButtons[index] : buttonText;
            button.onclick = () => this.handleQuickButton(logicText, buttonText);
            quickButtonsContainer.appendChild(button);
        });
    }

    async handleQuickButton(logicText, displayText = null) {
        // Show user message with display text
        this.addMessage('user', displayText || logicText);
        document.getElementById('quick-buttons').innerHTML = '';
        
        // Auto-detect Baluchi if user clicked a Baluchi button
        if (window.translator && displayText && window.translator.detectBaluchiContent(displayText)) {
            window.translator.setLanguage('bal');
            this.updateLanguageInterface();
        }
        
        const responses = {
            'History of Baluchistan': async () => {
                const message = "Baluchistan has a rich history spanning thousands of years. Let me tell you about different periods:";
                const buttons = ['Ancient Baluchistan', 'Medieval period', 'British colonial era', 'Khanate of Kalat'];
                
                const translatedMessage = window.translator ? await window.translator.translateText(message) : message;
                const translatedButtons = window.translator ? await window.translator.translateQuickButtons(buttons) : buttons;
                
                this.addMessage('bot', translatedMessage, false);
                this.showQuickButtons(translatedButtons, buttons);
            },
            'Why it\'s considered occupied': () => {
                this.addMessage('bot', "Many Baluch consider their land occupied due to the forced annexation in 1948. Here's why:", false);
                this.showQuickButtons([
                    '1947 Independence declaration',
                    'Forced annexation 1948',
                    'Legal arguments',
                    'International law perspective'
                ]);
            },
            'Baluch resistance movements': () => {
                this.addMessage('bot', "There have been multiple resistance movements throughout history:", false);
                this.showQuickButtons([
                    'Five major insurgencies',
                    'Notable leaders',
                    'Current movement',
                    'Martyrs and sacrifices'
                ]);
            },
            'Cultural heritage': () => {
                this.addMessage('bot', "Baluch culture is ancient and distinct, facing systematic suppression:", false);
                this.showQuickButtons([
                    'Baluchi language',
                    'Traditional customs',
                    'Cultural suppression',
                    'Preservation efforts'
                ]);
            },
            'Natural resources': () => {
                this.addMessage('bot', "Baluchistan is incredibly rich in resources, but the benefits don't reach the Baluch people:", false);
                this.showQuickButtons([
                    'Gas and mineral wealth',
                    'Gwadar port importance',
                    'Economic exploitation',
                    'Resource control issues'
                ]);
            },
            'Human rights situation': () => {
                this.addMessage('bot', "The human rights situation in Baluchistan is of serious international concern:", false);
                this.showQuickButtons([
                    'Enforced disappearances',
                    'Extrajudicial killings',
                    'International reports',
                    'Diaspora campaigns'
                ]);
            },
            // Detailed responses for sub-topics
            'Ancient Baluchistan': () => this.addMessage('bot', this.knowledgeBase.history.ancient.content),
            'Medieval period': () => this.addMessage('bot', this.knowledgeBase.history.medieval.content),
            'British colonial era': () => this.addMessage('bot', this.knowledgeBase.history.british.content),
            'Khanate of Kalat': () => this.addMessage('bot', this.knowledgeBase.history.khanate.content),
            '1947 Independence declaration': () => this.addMessage('bot', this.knowledgeBase.occupation.partition.content),
            'Forced annexation 1948': () => this.addMessage('bot', this.knowledgeBase.occupation.partition.content),
            'Legal arguments': () => this.addMessage('bot', this.knowledgeBase.occupation.legal_status.content),
            'Five major insurgencies': () => this.addMessage('bot', this.knowledgeBase.occupation.resistance.content),
            'Notable leaders': () => this.addMessage('bot', this.knowledgeBase.leaders.historical.content + " " + this.knowledgeBase.leaders.modern.content),
            'Martyrs and sacrifices': () => this.addMessage('bot', this.knowledgeBase.leaders.martyrs.content),
            'Baluchi language': () => this.addMessage('bot', this.knowledgeBase.culture.language.content),
            'Traditional customs': () => this.addMessage('bot', this.knowledgeBase.culture.traditions.content),
            'Cultural suppression': () => this.addMessage('bot', this.knowledgeBase.culture.suppression.content),
            'Gas and mineral wealth': () => this.addMessage('bot', this.knowledgeBase.resources.natural.content),
            'Gwadar port importance': () => this.addMessage('bot', this.knowledgeBase.resources.natural.content),
            'Economic exploitation': () => this.addMessage('bot', this.knowledgeBase.resources.exploitation.content),
            'Enforced disappearances': () => this.addMessage('bot', this.knowledgeBase.occupation.human_rights.content),
            'Current movement': () => this.addMessage('bot', this.knowledgeBase.current_situation.political.content),
            'International reports': () => this.addMessage('bot', this.knowledgeBase.current_situation.international.content)
        };

        const response = responses[logicText];
        if (response) {
            setTimeout(async () => {
                await response();
                await this.showContextualQuestions();
            }, 800);
        }
    }

    sendMessage() {
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Auto-detect and switch to Baluchi if user types in Baluchi
        if (window.translator && window.translator.detectBaluchiContent(message)) {
            window.translator.setLanguage('bal');
            this.updateLanguageInterface();
        }
        
        this.addMessage('user', message);
        input.value = '';
        document.getElementById('quick-buttons').innerHTML = '';
        
        setTimeout(async () => {
            await this.generateResponse(message);
        }, 800);
    }

    async generateResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        let response = "";
        let followUpButtons = [];

        // Keyword-based response system
        if (this.containsKeywords(lowerMessage, ['history', 'historical', 'past', 'ancient', 'old'])) {
            if (this.containsKeywords(lowerMessage, ['ancient', 'old', 'early'])) {
                response = this.knowledgeBase.history.ancient.content;
            } else if (this.containsKeywords(lowerMessage, ['british', 'colonial', 'empire'])) {
                response = this.knowledgeBase.history.british.content;
            } else if (this.containsKeywords(lowerMessage, ['kalat', 'khanate', 'khan'])) {
                response = this.knowledgeBase.history.khanate.content;
            } else {
                response = "Baluchistan has a rich and complex history spanning thousands of years. Would you like to know about a specific period?";
                followUpButtons = ['Ancient Baluchistan', 'Medieval period', 'British colonial era', 'Khanate of Kalat'];
            }
        } else if (this.containsKeywords(lowerMessage, ['occupied', 'occupation', 'annexation', 'independence', 'illegal'])) {
            if (this.containsKeywords(lowerMessage, ['1947', '1948', 'partition'])) {
                response = this.knowledgeBase.occupation.partition.content;
            } else if (this.containsKeywords(lowerMessage, ['legal', 'law', 'international'])) {
                response = this.knowledgeBase.occupation.legal_status.content;
            } else {
                response = this.knowledgeBase.occupation.partition.content;
                followUpButtons = ['Legal arguments', 'International law perspective', 'Resistance movements'];
            }
        } else if (this.containsKeywords(lowerMessage, ['resistance', 'insurgency', 'rebellion', 'fight', 'struggle'])) {
            response = this.knowledgeBase.occupation.resistance.content;
            followUpButtons = ['Notable leaders', 'Current movement', 'Five major insurgencies'];
        } else if (this.containsKeywords(lowerMessage, ['culture', 'language', 'tradition', 'custom', 'baluchi'])) {
            if (this.containsKeywords(lowerMessage, ['language', 'baluchi', 'speak'])) {
                response = this.knowledgeBase.culture.language.content;
            } else if (this.containsKeywords(lowerMessage, ['tradition', 'custom', 'culture'])) {
                response = this.knowledgeBase.culture.traditions.content;
            } else {
                response = "Baluch culture is ancient and rich, but faces systematic suppression. What aspect interests you?";
                followUpButtons = ['Baluchi language', 'Traditional customs', 'Cultural suppression'];
            }
        } else if (this.containsKeywords(lowerMessage, ['resources', 'gas', 'mineral', 'oil', 'gwadar', 'wealth'])) {
            if (this.containsKeywords(lowerMessage, ['gwadar', 'port', 'trade'])) {
                response = this.knowledgeBase.resources.natural.content;
            } else {
                response = this.knowledgeBase.resources.exploitation.content;
                followUpButtons = ['Gas and mineral wealth', 'Gwadar port importance', 'Economic exploitation'];
            }
        } else if (this.containsKeywords(lowerMessage, ['human rights', 'disappearances', 'killings', 'torture', 'violations'])) {
            response = this.knowledgeBase.occupation.human_rights.content;
            followUpButtons = ['Enforced disappearances', 'International reports', 'Diaspora campaigns'];
        } else if (this.containsKeywords(lowerMessage, ['leaders', 'heroes', 'martyrs', 'sacrifice'])) {
            response = this.knowledgeBase.leaders.martyrs.content;
            followUpButtons = ['Historical leaders', 'Modern leaders', 'Memorial significance'];
        } else if (this.containsKeywords(lowerMessage, ['current', 'today', 'now', 'present', 'situation'])) {
            response = this.knowledgeBase.current_situation.political.content;
            followUpButtons = ['International perspective', 'Human rights situation', 'Resistance movements'];
        } else if (this.containsKeywords(lowerMessage, ['hello', 'hi', 'salaam', 'greetings'])) {
            response = "السلام علیکم! Welcome to the Baluchistan AI Guide. I'm here to educate you about Baluchistan's history, culture, and the ongoing struggle for freedom. What would you like to learn about?";
            followUpButtons = ['History of Baluchistan', 'Why it\'s considered occupied', 'Cultural heritage'];
        } else if (this.containsKeywords(lowerMessage, ['thank', 'thanks', 'appreciate'])) {
            response = "You're welcome! It's important that people learn about Baluchistan's situation. Knowledge is the first step toward justice. Is there anything else you'd like to know?";
            followUpButtons = ['Current situation', 'How to help', 'More resources'];
        } else {
            // Default response for unrecognized queries
            response = "I'd be happy to help you learn about that aspect of Baluchistan. Let me suggest some topics I can discuss in detail:";
            followUpButtons = ['History of Baluchistan', 'Occupation and resistance', 'Cultural heritage', 'Human rights situation'];
        }

        this.showTypingIndicator();
        setTimeout(async () => {
            this.hideTypingIndicator();
            
            // Translate response if translator is available
            const translatedResponse = window.translator ? await window.translator.translateText(response) : response;
            this.addMessage('bot', translatedResponse);
            
            if (followUpButtons.length > 0) {
                const translatedButtons = window.translator ? await window.translator.translateQuickButtons(followUpButtons) : followUpButtons;
                this.showQuickButtons(translatedButtons, followUpButtons);
            } else {
                await this.showContextualQuestions();
            }
        }, 1500);
    }

    containsKeywords(text, keywords) {
        return keywords.some(keyword => text.includes(keyword));
    }

    async showContextualQuestions() {
        const buttons = ['Tell me more', 'Current situation', 'How can I help?', 'New topic'];
        
        setTimeout(async () => {
            if (window.translator) {
                const translatedButtons = await window.translator.translateQuickButtons(buttons);
                this.showQuickButtons(translatedButtons, buttons);
            } else {
                this.showQuickButtons(buttons);
            }
        }, 1000);
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chatbot-messages');
        const typingHTML = `
            <div class="typing-indicator" id="typing-indicator">
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    addMessage(sender, text, showTime = true) {
        const messagesContainer = document.getElementById('chatbot-messages');
        const messageHTML = `
            <div class="message ${sender}">
                <div class="message-bubble">${text}</div>
                ${showTime ? `<div class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>` : ''}
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Store in conversation history
        this.conversationHistory.push({
            sender: sender,
            message: text,
            timestamp: new Date()
        });
    }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.chatbot = new BaluchistanChatbot();
});

// Fallback initialization for immediate execution
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (!window.chatbot) {
            window.chatbot = new BaluchistanChatbot();
        }
    });
} else {
    if (!window.chatbot) {
        window.chatbot = new BaluchistanChatbot();
    }
}