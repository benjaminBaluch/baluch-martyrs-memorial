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

    initializeKnowledgeBase() { /* FULL KNOWLEDGE BASE PASTE */ }

    createChatbotHTML() { /* UI Method */ }
    attachEventListeners() { /* UI Method */ }
    toggleChatbot() { /* UI Method */ }
    showWelcomeMessage() { /* UI Method */ }
    addMessage() { /* UI Method */ }
    showQuickButtons() { /* UI Method */ }
    handleQuickButton() { /* Response Method */ }
    generateResponse() { /* Response Method */ }
    getDynamicGreeting() { /* Response Method */ }
    getFollowUpsForTopic() { /* Response Method */ }
    showTypingIndicator() { /* UI Method */ }
    hideTypingIndicator() { /* UI Method */ }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => new BaluchistanChatbot());