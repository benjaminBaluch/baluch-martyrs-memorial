// AI-Powered Conversational Engine v2
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

            // Granular Resistance Intents
            QUERY_RESISTANCE_WAVES: { keywords: ['waves', 'uprising', 'insurgency'], priority: 20 },

            // Granular Human Rights Intents
            QUERY_HR_DISAPPEARANCES: { keywords: ['disappearances', 'missing', 'abducted'], priority: 20 },
            QUERY_HR_GENOCIDE: { keywords: ['genocide', 'war crimes', 'atrocities'], priority: 20 },

            // Granular Culture Intents
            QUERY_CULTURE_LANGUAGE: { keywords: ['language', 'baluchi', 'linguistic'], priority: 20 },
            QUERY_CULTURE_TRADITIONS: { keywords: ['traditions', 'customs', 'mayar'], priority: 20 },

            // Conversational Intents
            GREETING: { keywords: ['hello', 'hi', 'salaam', 'greetings', 'hey'], priority: 5 },
            THANKS: { keywords: ['thank', 'thanks', 'appreciate'], priority: 5 },
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
    constructor() {
        this.history = [];
        this.currentTopic = null;
        this.currentSubTopic = null;
        this.topicQueue = [];
    }

    setContext(topic, subTopic) {
        this.currentTopic = topic;
        this.currentSubTopic = subTopic;
        this.history.push({ topic, subTopic });
        // Create a logical queue for 'tell me more'
        if (topic && this.topicQueue.length === 0) {
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

    getLastTopic() {
        return this.currentTopic;
    }
    
    bindKnowledgeBase(kb) {
        this.knowledgeBase = kb;
    }
}

// Baluchistan AI Chatbot - Educational Assistant
class BaluchistanChatbot {
    constructor() {
        this.isMinimized = true;
        this.conversationHistory = [];
        this.nluEngine = new NLU_ENGINE();
        this.context = new ConversationContext();
        this.knowledgeBase = this.initializeKnowledgeBase();
        this.context.bindKnowledgeBase(this.knowledgeBase); // Link context to knowledge
        this.init();
    }

    initializeKnowledgeBase() { return window.CHATBOT_KNOWLEDGE_BASE; } // Load from global

    // ... (rest of the chatbot class from the original file)
}