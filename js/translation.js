// Translation utility for Baluchi language support
class BaluchiTranslator {
    constructor() {
        this.currentLanguage = 'en'; // Default to English
        this.supportedLanguages = {
            'en': 'English',
            'bal': 'Baluchi', // Note: This might need to be 'ur' (Urdu) as fallback if Baluchi isn't supported
        };
        this.isGoogleTranslateLoaded = false;
        this.translationCache = new Map(); // Cache translations to reduce API calls
        
        // Fallback translations for key phrases in Baluchi (manually curated)
        this.staticBaluchiTranslations = {
            'Welcome': 'وشاتکے',
            'History': 'بُندپتر', 
            'Culture': 'دود ربیدگ',
            'Resistance': 'گہگیری',
            'Martyrs': 'شہداء',
            'Freedom': 'آجوئی',
            'Baluchistan': 'بلوچستان',
            'Occupied': 'گِپتگ',
            'Independence':'آجوئی',
            'Hello': 'سلام علیکم',
            'Thank you': 'تئی منّت وار',
            
        };
        
        this.initializeGoogleTranslate();
    }

    async initializeGoogleTranslate() {
        try {
            // Load Google Translate API if not already loaded
            if (!window.google || !window.google.translate) {
                await this.loadGoogleTranslateScript();
            }
            this.isGoogleTranslateLoaded = true;
            console.log('✅ Google Translate API loaded successfully');
        } catch (error) {
            console.warn('⚠️ Google Translate API failed to load, using fallback translations:', error);
            this.isGoogleTranslateLoaded = false;
        }
    }

    loadGoogleTranslateScript() {
        return new Promise((resolve, reject) => {
            if (document.querySelector('script[src*="translate.googleapis.com"]')) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://translate.googleapis.com/translate_a/element.js?cb=googleTranslateElementInit';
            script.onload = () => {
                // Initialize Google Translate
                window.googleTranslateElementInit = () => {
                    new window.google.translate.TranslateElement({
                        pageLanguage: 'en',
                        includedLanguages: 'en,ur,fa,ar', // Include related languages as fallback
                        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
                    }, 'google_translate_element');
                    resolve();
                };
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    setLanguage(langCode) {
        if (this.supportedLanguages[langCode]) {
            this.currentLanguage = langCode;
            localStorage.setItem('chatbot_language', langCode);
            return true;
        }
        return false;
    }

    // Get stored language preference
    getStoredLanguage() {
        return localStorage.getItem('chatbot_language') || 'en';
    }

    // Detect if user might prefer Baluchi based on text input
    detectBaluchiContent(text) {
        const baluchWords = ['بلوچستان', 'بلوچ', 'شہید', 'آزادی', 'مزاحمت', 'ثقافت'];
        const persianArabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
        
        const hasBaluchWords = baluchWords.some(word => text.includes(word));
        const hasPersianArabicScript = persianArabicPattern.test(text);
        
        return hasBaluchWords || hasPersianArabicScript;
    }

    async translateText(text, targetLanguage = null) {
        const target = targetLanguage || this.currentLanguage;
        
        // Don't translate if target is English or same as current
        if (target === 'en' || target === this.currentLanguage) {
            return text;
        }

        // Check cache first
        const cacheKey = `${text}_${target}`;
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey);
        }

        // Try static translations first for common phrases
        if (target === 'bal' && this.staticBaluchiTranslations[text]) {
            const translation = this.staticBaluchiTranslations[text];
            this.translationCache.set(cacheKey, translation);
            return translation;
        }

        // Try Google Translate API
        if (this.isGoogleTranslateLoaded) {
            try {
                const translation = await this.googleTranslate(text, target);
                this.translationCache.set(cacheKey, translation);
                return translation;
            } catch (error) {
                console.warn('Google Translate failed, using fallback:', error);
            }
        }

        // Fallback: return original text with language indicator
        if (target === 'bal') {
            return `[BAL] ${text}`; // Indicate that translation is needed
        }

        return text;
    }

    async googleTranslate(text, targetLang) {
        // For production, you would use the official Google Translate API
        // This is a simplified implementation using the free service
        try {
            // Use Urdu as fallback for Baluchi since they share script and some vocabulary
            const fallbackLang = targetLang === 'bal' ? 'ur' : targetLang;
            
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${fallbackLang}&dt=t&q=${encodeURIComponent(text)}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data[0] && data[0][0] && data[0][0][0]) {
                return data[0][0][0];
            }
            
            throw new Error('Invalid response from Google Translate');
        } catch (error) {
            console.warn('Google Translate API call failed:', error);
            throw error;
        }
    }

    // Translate an array of quick button texts
    async translateQuickButtons(buttons) {
        if (this.currentLanguage === 'en') return buttons;
        
        const translations = await Promise.all(
            buttons.map(async (button) => {
                try {
                    return await this.translateText(button);
                } catch (error) {
                    return button; // Return original if translation fails
                }
            })
        );
        
        return translations;
    }

    // Get welcome message in current language
    async getWelcomeMessage() {
        const englishMessage = "السلام علیکم! I'm your AI guide to learning about Baluchistan as an occupied land. I can tell you about:";
        
        if (this.currentLanguage === 'en') {
            return englishMessage;
        }
        
        if (this.currentLanguage === 'bal') {
            return "سلام علیکم! ئہ تئی بلوچستانئی قبضے وتی زمینئی بارے ئے زانکاری دیتگ ئے AI راہنما ئن۔ ئہ شمئی بارے ئے بال دی توانم:";
        }
        
        try {
            return await this.translateText(englishMessage);
        } catch (error) {
            return englishMessage;
        }
    }

    // Get language toggle HTML
    getLanguageToggleHTML() {
        return `
            <div class="language-toggle">
                <button class="lang-btn ${this.currentLanguage === 'en' ? 'active' : ''}" 
                        onclick="translator.switchLanguage('en')" title="English">
                    EN
                </button>
                <button class="lang-btn ${this.currentLanguage === 'bal' ? 'active' : ''}" 
                        onclick="translator.switchLanguage('bal')" title="Baluchi">
                    بلوچی
                </button>
            </div>
        `;
    }

    async switchLanguage(langCode) {
        const previousLang = this.currentLanguage;
        
        if (this.setLanguage(langCode)) {
            console.log(`🌐 Language switched from ${previousLang} to ${langCode}`);
            
            // Trigger chatbot refresh with new language
            if (window.chatbot && typeof window.chatbot.refreshWithLanguage === 'function') {
                await window.chatbot.refreshWithLanguage();
            }
            
            return true;
        }
        
        return false;
    }

    // Helper to determine text direction for RTL languages
    getTextDirection() {
        return this.currentLanguage === 'bal' ? 'rtl' : 'ltr';
    }

    // Helper to get appropriate font family for the language
    getFontFamily() {
        if (this.currentLanguage === 'bal') {
            return '"Noto Sans Arabic", "Amiri", "Times New Roman", serif';
        }
        return 'inherit';
    }
}

// Initialize translator
window.translator = new BaluchiTranslator();

// Auto-detect language preference on load
document.addEventListener('DOMContentLoaded', () => {
    const storedLang = window.translator.getStoredLanguage();
    if (storedLang !== 'en') {
        window.translator.setLanguage(storedLang);
    }
});