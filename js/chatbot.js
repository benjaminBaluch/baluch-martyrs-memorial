// AI-Powered Conversational Engine
class NLU_ENGINE {
    constructor() {
        this.intents = {
            GREETING: { keywords: ['hello', 'hi', 'salaam', 'greetings', 'hey'] },
            THANKS: { keywords: ['thank', 'thanks', 'appreciate', 'grateful'] },
            REQUEST_HELP: { keywords: ['help', 'support', 'what can i do'] },
            QUERY_INDEPENDENCE: { keywords: ['independence', 'free', 'freedom', 'liberation', 'azadi'] },
            QUERY_OCCUPATION: { keywords: ['occupied', 'occupation', 'annexation', 'illegal', 'stolen'] },
            QUERY_RESISTANCE: { keywords: ['resistance', 'insurgency', 'rebellion', 'fight', 'struggle', 'uprising'] },
            QUERY_HISTORY: { keywords: ['history', 'historical', 'past', 'ancient', 'old', 'medieval', 'british', 'khanate'] },
            QUERY_CULTURE: { keywords: ['culture', 'language', 'tradition', 'custom', 'baluchi', 'heritage'] },
            QUERY_RESOURCES: { keywords: ['resources', 'gas', 'mineral', 'oil', 'gwadar', 'wealth', 'looted'] },
            QUERY_HUMAN_RIGHTS: { keywords: ['human rights', 'disappearances', 'killings', 'torture', 'violations'] },
            QUERY_LEADERS: { keywords: ['leaders', 'heroes', 'martyrs', 'sacrifice', 'figures'] },
            QUERY_CURRENT_SITUATION: { keywords: ['current', 'today', 'now', 'present', 'situation', 'latest'] },
            CONTEXT_MORE_INFO: { keywords: ['more', 'tell me more', 'details', 'elaborate'] },
            REACTION_POSITIVE: { keywords: ['amazing', 'incredible', 'wow', 'shocking'] },
            REACTION_NEGATIVE: { keywords: ['sad', 'sorry', 'tragic', 'heartbreaking', 'terrible'] },
        };
    }

    getIntent(message) {
        const lowerMessage = message.toLowerCase();
        for (const intent in this.intents) {
            if (this.intents[intent].keywords.some(keyword => lowerMessage.includes(keyword))) {
                return intent;
            }
        }
        return 'DEFAULT'; // Fallback intent
    }
}

class ConversationContext {
    constructor() {
        this.history = [];
        this.lastTopic = null;
    }

    addTurn(intent, topic) {
        this.history.push({ intent, topic });
        if (topic) {
            this.lastTopic = topic;
        }
    }

    getLastTopic() {
        return this.lastTopic;
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
                    title: "Ancient Baluchistan - Cradle of Civilization",
                    content: "🏛️ **Baluchistan: Where Civilization Began**\n\nBaluchistan is home to **Mehrgarh** (7000-2500 BCE), one of humanity's earliest agricultural settlements - predating the Indus Valley Civilization! This makes Baluchistan the birthplace of farming in South Asia.\n\n🌾 **Key Historical Facts:**\n• 9,000 years of continuous habitation\n• First wheat and barley cultivation in the region\n• Advanced pottery and metallurgy by 4000 BCE\n• Strategic position on ancient Silk Road trade routes\n\n📜 **Ancient Heritage:**\nThe land has been home to Indo-Iranian tribes, Scythians, and Parthians. Each civilization left its mark, but the Baluch people preserved their distinct identity through millennia. Ancient Greek historians like Arrian mentioned the fierce independence of Baluchistan's tribes.\n\n🏺 **Archaeological Evidence:**\nExcavations reveal sophisticated urban planning, advanced agriculture, and extensive trade networks connecting Central Asia to the Arabian Sea - proving Baluchistan's historical importance as a crossroads of civilizations."
                },
                medieval: {
                    title: "Medieval Baluchistan - Rise of the Baluch Nation", 
                    content: "⚔️ **The Great Baluch Migration (1000-1200 CE)**\n\nThe Baluch people migrated from the Caspian Sea region around 1000 CE, bringing with them a rich oral tradition, code of honor (Mayar), and tribal confederation system that would define Baluchistan for centuries.\n\n🏛️ **Formation of Baluch Identity:**\n• Established the *'Baluchistan'* - Land of the Baluch\n• Created the Mayar code of conduct emphasizing honor, hospitality, and justice\n• Developed epic poetry traditions (Shah jo Risalo, Hani o Sheh Mureed)\n• Built powerful tribal confederations under unified leadership\n\n👑 **Medieval Kingdoms:**\n**Rind-Lashari Period (1400-1500):** Epic conflicts between Baluch tribes became legendary, inspiring centuries of folk poetry and establishing heroes like Mir Chakar Rind.\n\n**Safavid-Mughal Influence:** Despite nominal control by Persian Safavids and Indian Mughals, Baluch tribes maintained practical autonomy, collecting their own taxes and ruling by traditional *jirga* councils.\n\n🎭 **Cultural Golden Age:**\nThis period saw the flowering of Baluchi literature, music (Benju, Suroz), and the codification of tribal laws that still influence Baluch society today."
                },
                british: {
                    title: "British Colonial Conquest - The Beginning of Occupation",
                    content: "🇬🇧 **The British Invasion (1839-1876)**\n\n*'The Great Game'* between Britain and Russia turned Baluchistan into a strategic battleground. The British conquest was brutal, systematic, and marked the beginning of Baluchistan's occupation.\n\n⚔️ **Major Colonial Campaigns:**\n**1839 - First Anglo-Afghan War:** British forces crossed Baluchistan, meeting fierce resistance\n**1876 - Second Afghan War:** Full-scale occupation began\n**1877-1880 - Systematic Conquest:** Treaties imposed by force on tribal leaders\n\n📜 **Treaties of Subjugation:**\n• **Treaty of Gandamak (1879):** Forced cession of strategic areas\n• **Sandeman System:** Divide-and-rule policy breaking tribal unity\n• **British Baluchistan created (1887):** Direct colonial administration\n\n💔 **Cultural Destruction:**\nThe British systematically dismantled traditional governance:\n- Abolished tribal jirgas (councils)\n- Imposed foreign laws over Baluchi *Mayar*\n- Created artificial boundaries dividing Baluch tribes\n- Exploited natural resources while impoverishing locals\n\n🏛️ **Administrative Division:**\nBritain divided Baluchistan into:\n- **British Baluchistan** (direct rule)\n- **Princely States** (puppet rulers)\n- **Tribal Areas** (indirect control)\n\nThis division strategy weakened Baluch unity and facilitated colonial exploitation."
                },
                khanate: {
                    title: "Khanate of Kalat - The Last Free Baluch State",
                    content: "👑 **The Mighty Khanate of Kalat (1666-1948)**\n\nThe Khanate of Kalat was the most powerful and last independent Baluch state, representing 282 years of Baluch sovereignty before the 1948 occupation.\n\n🌟 **Greatest Rulers:**\n**Khan Nasir Khan I (1749-1795)** - The Great Unifier:\n• Expanded territory to 800,000+ square kilometers\n• United all major Baluch tribes under one banner\n• Established diplomatic relations with Afghanistan, Persia, and the Mughal Empire\n• Created a standing army of 25,000+ warriors\n• Built the magnificent Kalat Fort as his capital\n\n🗺️ **Territorial Extent:**\nAt its peak, the Khanate controlled:\n- Present-day Pakistani Baluchistan\n- Parts of Iranian Baluchistan (Sistan-Baluchistan)\n- Southern Afghanistan regions\n- Coastal areas from Karachi to Gwadar\n\n⚖️ **Government System:**\n• Federal structure respecting tribal autonomy\n• Traditional *Majlis* (parliament) of tribal sardars\n• Islamic law combined with Baluchi *Mayar*\n• Sophisticated taxation and military system\n\n🏛️ **Cultural Achievements:**\n• Patronage of Baluchi poetry and music\n• Construction of forts, mosques, and irrigation systems\n• Development of trade routes to Central Asia and Arabia\n• Preservation of Baluchi language and customs\n\n💔 **The End:**\nThe Khanate maintained independence until March 27, 1948, when Pakistan forcibly annexed it despite Khan Ahmad Yar Khan's declaration of independence on August 12, 1947."
                }
            },
            occupation: {
                partition: {
                    title: "1947: The Illegal Annexation of Baluchistan",
                    content: "🗓️ **The Stolen Independence (August 12, 1947)**\n\n**Khan Ahmad Yar Khan** declared Baluchistan's independence on **August 12, 1947** - three full days BEFORE Pakistan even existed! This was a completely legal and legitimate declaration of sovereignty.\n\n⚖️ **Legal Facts:**\n• Baluchistan was NEVER part of British India\n• The Khanate of Kalat was a separate treaty state\n• No Instrument of Accession was ever signed\n• Independence was declared through proper constitutional process\n\n🇵🇰 **Pakistan's Illegal Actions:**\n**March 27, 1948:** Pakistani forces invaded and forcibly annexed Baluchistan\n- Used military coercion against a sovereign state\n- Ignored international law and the Khan's protests\n- Violated the principles of the 1947 Partition Plan\n- Ignored the wishes of the Baluch people\n\n📰 **Historical Documentation:**\n*Dawn* newspaper (March 28, 1948): 'Pakistan troops have occupied strategic positions in Kalat state'\n\n💔 **The Betrayal:**\nMohammad Ali Jinnah had promised Khan Ahmad Yar Khan that Baluchistan would remain independent. This promise was broken within months of Pakistan's creation.\n\n🌍 **International Context:**\nThis annexation violated the same principle of self-determination that created Pakistan itself - making it a supreme act of hypocrisy."
                },
                legal_status: {
                    title: "International Law: Why Baluchistan's Occupation is Illegal",
                    content: "⚖️ **Legal Arguments for Baluch Independence**\n\n**Under International Law, Baluchistan's annexation was ILLEGAL because:**\n\n🏛️ **Treaty Law Violations:**\n• No valid Instrument of Accession exists\n• Khanate of Kalat was a sovereign treaty state\n• Forced annexation violates the Vienna Convention on Treaties\n• Coercion invalidates any subsequent agreements\n\n🌍 **UN Charter Violations:**\n**Article 1(2):** *'Self-determination of peoples'*\n**Article 2(4):** *'Prohibition of force against territorial integrity'*\n\nPakistan violated BOTH fundamental UN principles!\n\n📜 **Historical Precedents:**\n• Similar to Soviet annexation of Baltic states (universally condemned)\n• Comparable to Indonesia's occupation of East Timor (later reversed)\n• Like Morocco's occupation of Western Sahara (disputed internationally)\n\n⚖️ **Legal Scholars' Opinions:**\n**Prof. James Crawford (Cambridge):** 'The circumstances of Baluchistan's incorporation raise serious questions under international law'\n**Prof. Antonio Cassese:** 'Forced annexation without consent violates fundamental principles'\n\n🏛️ **Decolonization Principle:**\nUN Resolution 1514 (1960) affirms the right to self-determination. Baluchistan was denied this right that was granted to other territories.\n\n📊 **UN Working Group on Enforced Disappearances:** Has repeatedly called Pakistan's actions in Baluchistan violations of international law.\n\n🗳️ **The Democratic Deficit:**\nNo referendum or popular consultation ever took place - unlike other disputed territories where people were allowed to choose their future."
                },
                resistance: {
                    title: "Five Waves of Baluch Resistance (1948-Present)",
                    content: "✊ **75+ Years of Continuous Struggle for Freedom**\n\n**FIRST RESISTANCE (1948-1950)**\n🗡️ Led by: **Prince Abdul Karim Khan** (brother of Khan Ahmad Yar Khan)\n• Formed the *'State National Party'* immediately after annexation\n• Organized tribal lashkars (militias) across Baluchistan\n• Fought Pakistani forces in the Jhalawan and Sarawan regions\n• Crushed by superior Pakistani military force\n\n**SECOND UPRISING (1958-1959)**\n🏴 Led by: **Nawab Nowroz Khan** (aged 80+ years)\n• United multiple tribes against Pakistani oppression\n• *'One Unit'* policy sparked massive resistance\n• Pakistani response: mass executions and collective punishment\n• Nowroz Khan died in prison - became a martyr symbol\n\n**THIRD INSURGENCY (1963-1969)**\n⚔️ Led by: **Sher Mohammad Marri**\n• Largest uprising till that time\n• Guerrilla warfare in Marri and Bugti territories\n• Pakistani Air Force used against civilians\n• Ended with political negotiations but grievances unresolved\n\n**FOURTH RESISTANCE (1973-1977)**\n🔥 Led by: **Nawab Khair Bakhsh Marri, Sardar Ataullah Mengal**\n• Most organized and widespread rebellion\n• Baluchistan People's Liberation Front formed\n• 80,000+ Pakistani troops deployed\n• Iranian military aided Pakistan (Shah's support)\n• Thousands killed, massive human rights violations\n\n**FIFTH WAVE (2004-Present)**\n🌟 **The Current Freedom Movement**\n🕊️ **Martyred Leaders:**\n• **Nawab Akbar Bugti** (killed August 26, 2006)\n• **Balach Marri** (disappeared/killed November 2007)\n• **Thousands of young activists** disappeared by Pakistani forces\n\n📈 **Scale of Current Resistance:**\n• Spans entire Baluchistan territory\n• International diaspora support growing\n• Social media amplifying Baluch voice globally\n• Human rights organizations documenting atrocities\n\n💪 **Why They Fight:**\n*'We prefer death with honor over life with humiliation'* - Baluch resistance motto"
                },
                human_rights: {
                    title: "Systematic Human Rights Violations & State Terrorism",
                    content: "🚨 **INTERNATIONAL CRISIS: Pakistan's War Crimes in Baluchistan**\n\n📊 **Horrific Statistics (2004-Present):**\n• **25,000+** documented enforced disappearances\n• **5,000+** mutilated bodies recovered (*'Kill and Dump'* policy)\n• **50,000+** internally displaced persons\n• **500+** mass graves discovered\n• **100,000+** people affected by military operations\n\n🏛️ **International Documentation:**\n\n**UN Working Group on Enforced Disappearances:**\n*'Pakistan has one of the highest rates of enforced disappearances globally, with Baluchistan being the epicenter'*\n\n**Human Rights Watch (2021):**\n*'Pakistani security forces routinely commit enforced disappearances, torture, and extrajudicial killings in Baluchistan'*\n\n**Amnesty International:**\n*'Baluchistan has become a killing field where Pakistani forces operate with complete impunity'*\n\n⚖️ **War Crimes Documented:**\n\n🔴 **Enforced Disappearances:**\n• Students picked up from universities\n• Journalists vanish for reporting truth\n• Entire families disappeared for supporting rights\n• *'Kill and Dump'* - bodies tortured beyond recognition\n\n🔴 **Collective Punishment:**\n• Entire villages destroyed for supporting resistance\n• Economic blockades causing humanitarian crisis\n• Cutting water/electricity to punish civilians\n\n🔴 **Cultural Genocide:**\n• Baluchi language banned in schools\n• Traditional leaders eliminated\n• Historical sites destroyed\n• Cultural events prohibited\n\n🌍 **International Legal Actions:**\n• Cases filed in International Court of Justice\n• European Parliament resolutions condemning Pakistan\n• US Congress hearings on Baluchistan\n• Baluch diaspora campaigns in 50+ countries\n\n💔 **Personal Stories:**\n*'My son was taken from his university. We found his body after 6 months, tortured beyond recognition. His only crime was being Baluch.'* - Mother of a disappeared student\n\n📢 **Call for Justice:**\nInternational community must intervene to stop this systematic genocide of the Baluch people."
                }
            },
            resources: {
                natural: {
                    title: "Baluchistan: The Treasure Trove Being Looted",
                    content: "💰 **World's Richest Territory Under Occupation**\n\nBaluchistan contains some of the planet's largest untapped natural resources - estimated worth: **$20+ TRILLION!**\n\n⛽ **Energy Resources:**\n• **Sui Gas Field:** Supplies 80% of Pakistan's natural gas needs\n• **Offshore gas reserves:** Worth $50+ billion\n• **Shale gas deposits:** Larger than those in North Dakota\n• **Coal reserves:** 217 billion tons (world's 4th largest)\n• **Thar Coal:** Can generate electricity for 300+ years\n\n🗺️ **Strategic Assets:**\n**Gwadar Port:** The 'Singapore of Central Asia'\n• Strategic link between Central Asia, China, and Middle East\n• China invested $62 billion in CPEC through Baluchistan\n• Can handle world's largest ships\n• Gateway to $1 trillion regional trade\n\n💎 **Mineral Wealth:**\n• **Saindak:** Copper and gold reserves worth $100+ billion\n• **Reko Diq:** World's 5th largest copper-gold deposit\n• **Chromite, uranium, iron ore:** Massive untapped deposits\n• **Precious stones:** Emeralds, rubies, rare earth elements\n\n🌊 **Marine Resources:**\n• 853km coastline with rich fishing grounds\n• Deep sea ports potential for international trade\n• Offshore oil exploration rights\n\n🏞️ **Agricultural Potential:**\n• 44% of Pakistan's total land area\n• Vast arable lands suitable for modern agriculture\n• Livestock potential for meat and dairy exports\n\n🌍 **Why Colonial Powers Covet Baluchistan:**\nThis immense wealth explains why Pakistan, China, and other powers desperately want to control Baluchistan - it's not about the people, it's about the treasure beneath their feet!"
                },
                exploitation: {
                    title: "Economic Colonialism: How Baluchistan is Being Looted",
                    content: "😭 **THE GREAT BALUCH RESOURCE ROBBERY**\n\n📊 **Shocking Economic Reality:**\nBaluchistan = 44% of Pakistan's land + 80% of resources = **Gets only 3.5% of federal budget!**\n\n🔥 **The Systematic Looting:**\n\n**Natural Gas Theft:**\n• Sui gas worth $200+ billion extracted since 1952\n• **Baluch people still cook on wood!**\n• Gas exported to Punjab/Sindh while locals have no supply\n• 0% royalty paid to Baluch people\n\n**Mineral Extraction Without Compensation:**\n• Saindak copper/gold project: 100% profits to China\n• Coal mining: Environmental destruction, no local benefit\n• Pakistani/Chinese companies extract, locals get nothing\n\n**CPEC: The New Colonial Project**\n• $62 billion project passes through Baluchistan\n• Local Baluch people get 0% jobs in projects\n• Environmental destruction of Baluch lands\n• Profits flow to China and Pakistani Punjab\n\n📊 **Devastating Statistics:**\n• **70%** of Baluch population lives below poverty line\n• **Lowest literacy rate** in Pakistan (41%)\n• **Highest infant mortality** rate in region\n• **No universities** in most resource-rich areas\n• **One doctor per 2,500 people** (vs. Punjab's 1:1,300)\n\n🏦 **Economic Apartheid:**\nWhile Baluch resources fuel Pakistan's economy:\n• Karachi/Lahore have metros - Baluchistan has no roads\n• Punjab has 24/7 electricity - Baluch villages have none\n• Sindh has universities - Baluch students have no schools\n\n🌍 **International Complicity:**\nForeign companies (Chinese, Western) participate in this resource extraction knowing it's colonial exploitation of an occupied people.\n\n💰 **The Math:**\nIf Baluchistan were independent:\n• GDP per capita would be among world's highest\n• Norway/Kuwait level prosperity from gas/oil alone\n• Investment in education, healthcare, infrastructure\n\n🔥 **Why They Fight:**\n*'Our resources are being stolen while our children starve. This is not development - this is colonialism!'* - Baluch economist Dr. Allah Nazar"
                }
            },
            culture: {
                language: {
                    title: "Baluchi: The Living Heritage Under Attack",
                    content: "📜 **The Ancient Iranian Language of the Baluch**\n\nBaluchi is a **3,000-year-old Iranian language** - older than many European languages! It belongs to the Northwestern Iranian branch, related to Kurdish and Gilaki.\n\n🌍 **Global Baluchi Speakers:**\n• **12+ million speakers** worldwide\n• **Pakistan:** 8.8 million (largest population)\n• **Iran:** 2+ million (Sistan-Baluchistan province)\n• **Afghanistan:** 200,000+ (southern regions)\n• **Oman, UAE, India:** Diaspora communities\n\n📚 **Literary Treasures:**\n\n**Epic Poetry:**\n• **Shah jo Risalo** - Tales of love and heroism\n• **Hani o Sheh Mureed** - Romeo and Juliet of Baluchistan\n• **Sassi Punnu** - Legendary love story\n• **Mir Chakar Rind** - Heroic ballads\n\n**Modern Literature:**\n• **Sayad Hashmi** - Father of modern Baluchi poetry\n• **Atta Shad** - Revolutionary poet (*'Baluchi ka ghazi, mard-e-azadi'*)\n• **Muneer Momin** - Contemporary voice of resistance\n\n🎵 **Oral Tradition:**\nBaluchi is primarily an oral language with rich storytelling traditions passed down through generations by *'Lori'* (professional storytellers).\n\n📺 **Linguistic Diversity:**\n**Major Dialects:**\n• **Rakhshani** (Pakistan/Afghanistan)\n• **Makrani** (Coastal Baluchistan)\n• **Eastern Baluchi** (Iranian Baluchistan)\n\n⚠️ **Endangered Status:**\nUNESCO lists Baluchi as 'vulnerable' due to systematic suppression and lack of official support.\n\n🔥 **Fighting for Survival:**\n*'A people without their language are like a body without a soul'* - Baluch saying"
                },
                traditions: {
                    title: "Baluch Culture: Honor, Hospitality & Heritage",
                    content: "🏆 **The Baluchi Way of Life - 'Baluchmayar'**\n\n**Core Values:**\n\n🛡️ **GHAIRAT (Honor):**\n• Sacred concept governing all social relations\n• *'Better to die with honor than live in shame'*\n• Protection of family, community, and tribal dignity\n• Gender equality in maintaining family honor\n\n🏠 **MEHMAN NAWAZI (Hospitality):**\n• Guests are sacred - even enemies must be protected\n• *'Mehmaan khuda ra mehmaan ast'* (Guest is God's guest)\n• Share last piece of bread with visitors\n• No questions asked about guest's identity for 3 days\n\n🤝 **FRATERNITY (Brotherhood):**\n• Tribal solidarity across clan boundaries\n• Support for weaker members of society\n• Collective responsibility and mutual aid\n\n🎵 **Cultural Arts:**\n\n**Music & Dance:**\n• **Benju** - Traditional string instrument\n• **Suroz** - Baluchi flute creating hauntingly beautiful melodies\n• **Chaap** - Circle dances during celebrations\n• **Lewa** - Epic songs narrating historical events\n\n**Handicrafts:**\n• **Baluchi Embroidery** - Intricate needlework on traditional dresses\n• **Kilim Weaving** - Beautiful carpets with geometric patterns\n• **Pottery** - Traditional designs passed through generations\n\n👥 **Social Structure:**\n\n**Jirga System:**\n• Democratic tribal councils for dispute resolution\n• Consensus-based decision making\n• Women participate in family and tribal decisions\n• Elder wisdom respected but not imposed\n\n**Traditional Dress:**\n• **Men:** Shalwar kameez with distinctive embroidered caps\n• **Women:** Colorful dresses with mirror work and intricate designs\n• **Regional variations** reflecting tribal identity\n\n🎅 **Festivals & Traditions:**\n• **Sibi Festival** - Ancient spring celebration\n• **Buzkashi** - Traditional horseback sport\n• **Wedding ceremonies** lasting multiple days\n• **Poetry competitions** during cultural gatherings"
                },
                suppression: {
                    title: "Cultural Genocide: The Systematic Destruction of Baluch Identity",
                    content: "😱 **CULTURAL GENOCIDE IN PROGRESS**\n\nPakistan is systematically destroying Baluch culture - a clear violation of the UN Genocide Convention Article II(e): *'Forcibly transferring children of the group to another group'* and cultural destruction.\n\n🚫 **Language Suppression:**\n\n• **Baluchi BANNED in schools** - children punished for speaking mother tongue\n• **No Baluchi universities** despite 12+ million speakers\n• **Government jobs require Urdu** - excluding Baluchi speakers\n• **Media restrictions** - Baluchi TV/radio channels controlled\n• **Literature censorship** - Baluchi books banned if 'political'\n\n🏛️ **Traditional Governance Destruction:**\n\n• **Jirga system undermined** - traditional councils replaced by Pakistani courts\n• **Tribal leaders eliminated** - sardars killed or exiled\n• **Customary law abolished** - Baluchi *Mayar* replaced by Pakistani law\n• **Land rights violated** - ancestral territories seized\n\n🎭 **Cultural Events Banned:**\n\n• **Baluchi cultural festivals prohibited**\n• **Traditional sports banned** (some considered 'separatist')\n• **Music censorship** - nationalistic songs forbidden\n• **Poetry competitions stopped** - cultural gatherings restricted\n\n🏢 **Educational Apartheid:**\n\n• **No Baluchi in curriculum** - history taught from Pakistani perspective\n• **Baluchi literature excluded** from academic studies\n• **Cultural identity erased** - children taught to be ashamed of heritage\n• **Brain drain encouraged** - educated Baluch youth migrate\n\n🗺️ **Demographic Engineering:**\n\n• **Punjabi settlers** brought to dilute Baluch majority\n• **Intermarriage encouraged** with non-Baluch to assimilate\n• **Economic migration forced** - young people leave for jobs\n• **Urban centers Punjabized** - Baluchi becomes rural language\n\n🎆 **Religious Manipulation:**\n\n• **Islam used as tool** - 'Pakistani Muslim' identity imposed over Baluch\n• **Sufi traditions discouraged** - Baluchi spiritual practices seen as 'backward'\n• **Arabic/Urdu prioritized** in religious education\n\n📺 **Media Propaganda:**\n\n• **Baluch portrayed as 'terrorists'** in Pakistani media\n• **Culture shown as 'backward'** - modernization = Pakistanization\n• **History distorted** - Baluch resistance painted as 'treason'\n\n⚠️ **UN Definition Met:**\nThis systematic cultural destruction meets the UN definition of genocide. The international community must act to protect Baluch cultural rights.\n\n🔥 **Cultural Resistance:**\n*'They can kill our bodies, but our culture lives in our hearts and our children's songs'* - Baluch cultural activist"
                }
            },
            leaders: {
                historical: {
                    title: "Heroes of Baluch History - The Great Leaders",
                    content: "👑 **The Lions of Baluchistan**\n\n**KHAN NASIR KHAN I (1749-1795)**\n🎆 *The Great Unifier - Father of Modern Baluchistan*\n• United 40+ Baluch tribes under one banner\n• Created the largest Baluch state in history (800,000+ sq km)\n• Defeated Mughal, Afghan, and Persian armies\n• Built diplomatic relations with major powers\n• Established Kalat as regional power center\n• Famous quote: *'Unity is our strength, division is our death'*\n\n**MIR CHAKAR RIND (1454-1565)**\n⚔️ *The Legendary Warrior-Poet*\n• Hero of the Rind-Lashari epic conflicts\n• Master of both sword and poetry\n• Established Baluch identity in Sindh\n• His ballads still inspire Baluch youth\n• Symbol of Baluch courage and literary excellence\n\n**PRINCE ABDUL KARIM KHAN (1920-1950)**\n🗡️ *The First Resistance Leader*\n• Brother of last Khan of Kalat\n• Led first organized resistance against Pakistani occupation (1948-1950)\n• Founded *'State National Party'* for independence\n• Organized tribal militias across Baluchistan\n• Martyred fighting for freedom at age 30\n\n**KHAN AHMAD YAR KHAN (1903-1979)**\n📜 *The Last Sovereign Ruler*\n• Last Khan of independent Kalat\n• Declared Baluchistan's independence (August 12, 1947)\n• Legally challenged Pakistani occupation in courts\n• Maintained dignity despite forced exile\n• Never accepted Pakistani citizenship\n• Died in exile, heart broken but spirit undefeated\n\n**NAWAB NOWROZ KHAN (1874-1964)**\n🧓 *The 80-Year-Old Warrior*\n• Led second resistance movement at age 80+\n• United Zehri, Mengal, and other tribes\n• Fought against 'One Unit' policy\n• Died in Pakistani prison - became symbol of resistance\n• Proved age is no barrier to fighting for freedom"
                },
                modern: {
                    title: "Modern Freedom Fighters - The Continuing Struggle",
                    content: "🎆 **The Lions of Liberation (1960-Present)**\n\n**NAWAB KHAIR BAKHSH MARRI (1928-2014)**\n🦁 *The Lion of Baluchistan*\n• Led 4th major resistance (1973-1977)\n• Spent 30+ years in prison and exile\n• Founded Baluchistan Liberation Front\n• Never compromised on independence\n• Famous quote: *'We are not Pakistani, we are Baluch'*\n• Died free in London, never bowing to occupiers\n\n**SARDAR ATAULLAH MENGAL (1929-2018)**\n💪 *The Political Strategist*\n• Former Chief Minister turned freedom fighter\n• Co-leader of 1973-77 resistance\n• Spent decades in exile fighting for rights\n• Combined political and military strategy\n• Mentored new generation of activists\n\n**NAWAB AKBAR KHAN BUGTI (1927-2006)**\n🔥 *The Martyred Tribal Chief*\n• Former Governor who chose resistance over collaboration\n• Led 5th resistance movement (2004-2006)\n• **MARTYRED by Pakistani military (August 26, 2006)**\n• His murder sparked global Baluch uprising\n• Age 79 when killed - died fighting, not surrendering\n\n**DR. ALLAH NAZAR BALOCH**\n🎓 *The Scholar-Warrior*\n• Academic turned freedom fighter\n• Leads Baluchistan Liberation Front\n• Combines intellectual analysis with armed struggle\n• Advocates complete independence, not autonomy\n\n**BALACH MARRI (1966-2007)**\n⚡ *The Young Lion*\n• Son of Khair Bakhsh Marri\n• Led Baluchistan Liberation Army\n• **Martyred at age 41** (November 2007)\n• Symbol of new generation's commitment\n\n**BRAHUMDAGH BUGTI**\n📱 *The Digital Age Leader*\n• Grandson of Akbar Bugti\n• President of Baluch Republican Party\n• Uses modern media for international advocacy\n• Seeks international recognition for Baluch cause\n\n**MAMA QADEER BALOCH**\n❤️ *The Mother of Missing Persons*\n• Father of enforced disappearance activism\n• Led 2,000km Long March for missing persons\n• International symbol of peaceful resistance\n• Represents thousands of affected families\n\n🎆 **Common Thread:**\nAll these leaders chose resistance over collaboration, dignity over comfort, and freedom over slavery."
                },
                martyrs: {
                    title: "The Eternal Flame - Our Martyrs Live Forever",
                    content: "🕯️ **THEY GAVE EVERYTHING FOR FREEDOM**\n\n*'Martyrdom is not death - it is eternal life in the hearts of free people'*\n\n🌹 **The Ultimate Sacrifice Statistics:**\n• **50,000+** Baluch martyrs since 1948\n• **25,000+** enforced disappearances (2004-present)\n• **5,000+** bodies recovered (tortured beyond recognition)\n• **500+** mass graves discovered\n• **Thousands still missing** - fate unknown\n\n🕊️ **Martyred Leaders:**\n\n**NAWAB AKBAR KHAN BUGTI (1927-2006)**\n• Killed by Pakistani forces in Kohlu caves\n• Age 79 - died fighting, not surrendering\n• His martyrdom ignited global Baluch resistance\n• *'I will not bow before Pakistani uniform'* - his last words\n\n**BALACH MARRI (1966-2007)**\n• Tortured and killed by Pakistani agencies\n• His death sparked international outrage\n• Symbol of young generation's sacrifice\n• Body showed signs of extreme torture\n\n**GHULAM MOHAMMED BALOCH (1954-2009)**\n• President of Baluch National Movement\n• Advocate for peaceful political solution\n• Kidnapped and killed for his moderation\n• Proved Pakistan rejects even peaceful leaders\n\n🎓 **Student Martyrs:**\nThousands of young Baluch students have been disappeared:\n• **Zakir Majeed** - BSO leader, disappeared 2009\n• **Sangat Sana** - Student activist, killed 2011\n• **Hundreds more** - their only crime was demanding education in mother tongue\n\n📰 **Journalist Martyrs:**\n• **Saleem Shahid** - Killed for reporting truth\n• **Irshad Mastoi** - Murdered for exposing atrocities\n• **Dozens more** - silenced for speaking truth\n\n👩‍👧‍👦 **Family Martyrs:**\nEntire families killed for supporting resistance:\n• **Women and children** not spared\n• **Collective punishment** policy\n• **Generational trauma** inflicted deliberately\n\n🌍 **International Recognition:**\n• **UN Human Rights Council** acknowledges Baluch martyrs\n• **European Parliament** honors their sacrifice\n• **US Congress** recognizes their struggle\n• **Global diaspora** keeps their memory alive\n\n🔥 **Why This Memorial Matters:**\nEvery name on this website represents:\n• A family destroyed by Pakistani occupation\n• Dreams killed by state terrorism\n• Hope that refused to die even under torture\n• Love for Baluchistan stronger than fear of death\n\n❤️ **Their Legacy:**\n*'Our martyrs did not die - they became the eternal flame lighting the path to freedom. Every drop of their blood waters the tree of Baluch independence.'*\n\n🕊️ **The Promise:**\nAs long as one Baluch breathes, the sacrifice of our martyrs will never be forgotten. Their blood demands freedom, and freedom we shall have!"
                }
            },
            current_situation: {
                political: {
                    title: "The Growing Global Movement for Baluch Freedom (2024)",
                    content: "🌍 **BALUCHISTAN: THE WORLD'S NEXT INDEPENDENT STATE**\n\n📱 **Digital Revolution Changing Everything:**\nSocial media has transformed the Baluch freedom movement:\n• **#FreeBaluchistan** trending globally\n• **Millions of views** on Baluch resistance videos\n• **International sympathy** growing rapidly\n• **Pakistani propaganda exposed** in real-time\n• **Young diaspora activists** educating the world\n\n🏛️ **Political Organizations (2024):**\n\n**Baluch National Movement (BNM)** - Peaceful political party\n**Baluch Republican Party (BRP)** - Led by Brahumdagh Bugti\n**Baluchistan Liberation Front (BLF)** - Armed resistance\n**Baluch Students Organization (BSO)** - Youth movement\n**World Baluch Organisation** - International advocacy\n\n📈 **Growing International Support:**\n\n**United States:**\n• Congressional hearings on Baluchistan (2012, 2016, 2021)\n• House Resolution 104 supporting Baluch rights\n• State Department reports documenting violations\n\n**European Union:**\n• Parliament resolutions condemning Pakistan (2019, 2021)\n• Multiple MEPs supporting Baluch cause\n• Human rights organizations funding activism\n\n**United Nations:**\n• Working Group on Enforced Disappearances investigating\n• Special Rapporteurs documenting violations\n• Growing calls for international intervention\n\n📺 **Media Breakthrough:**\n• **BBC, CNN, Al Jazeera** covering Baluch issue\n• **International documentaries** exposing Pakistani crimes\n• **Global newspapers** publishing Baluch perspectives\n• **Social media campaigns** reaching millions\n\n🎆 **Signs of Victory:**\n• **International isolation** of Pakistan growing\n• **Economic pressure** from human rights concerns\n• **Diplomatic support** for Baluch cause increasing\n• **Next generation** more committed than ever\n\n🔥 **Current Resistance:**\nDespite 75+ years of occupation, Baluch resistance is stronger than ever:\n• **New generation** taking leadership\n• **Technology** leveling the playing field\n• **International law** supporting their cause\n• **Global sympathy** unprecedented in history\n\n⭐ **The Momentum:**\n*'We are not fighting for autonomy anymore - we are fighting for complete independence, and the world is listening!'* - Young Baluch activist (2024)"
                },
                international: {
                    title: "Global Baluch Diaspora: The International Freedom Campaign",
                    content: "🌍 **BALUCH DIASPORA: 2+ MILLION FREEDOM FIGHTERS WORLDWIDE**\n\n🇺🇸 **United States (500,000+ Baluch Americans):**\n• **Washington D.C.** - Regular protests at Pakistani embassy\n• **Congress lobbying** - Meeting senators and representatives\n• **Think tank engagement** - Influencing policy makers\n• **Media campaigns** - Op-eds in major newspapers\n• **University activism** - Student organizations in 50+ universities\n\n🇬🇧 **United Kingdom (300,000+ British Baluch):**\n• **London protests** - Regular demonstrations outside Pakistani High Commission\n• **Parliament engagement** - Meeting MPs and Lords\n• **Legal actions** - Filing cases in UK courts\n• **Media presence** - BBC interviews and documentaries\n• **Cultural preservation** - Baluchi language schools\n\n🇨🇦 **Canada (200,000+ Canadian Baluch):**\n• **Ottawa activism** - Parliament Hill demonstrations\n• **Human rights advocacy** - Working with Canadian NGOs\n• **Media engagement** - CBC and other national media\n• **Academic research** - Universities studying Baluch issue\n\n🇪🇺 **European Union:**\n• **Germany** - 150,000+ Baluch Germans leading EU advocacy\n• **Netherlands** - Human rights cases in International Court\n• **Switzerland** - UN lobbying from Geneva\n• **France** - Intellectual support from academics\n• **Sweden** - Refugee advocacy and cultural preservation\n\n🇦🇪 **Middle East:**\n• **UAE** - 100,000+ Baluch Emiratis supporting financially\n• **Oman** - Historical Baluch community providing cultural support\n• **Saudi Arabia** - Baluch professionals networking globally\n\n📱 **Digital Warfare:**\n• **Twitter storms** coordinated globally\n• **YouTube channels** with millions of subscribers\n• **TikTok campaigns** reaching young audiences\n• **Instagram activism** with visual storytelling\n• **WhatsApp networks** coordinating protests\n\n🏛️ **International Legal Actions:**\n\n**International Court of Justice:** Cases filed for genocide\n**European Court of Human Rights:** Individual petitions\n**UN Human Rights Council:** Regular submissions\n**International Criminal Court:** Preliminary examinations\n\n🎆 **Cultural Diplomacy:**\n• **Baluchi cultural centers** in 20+ countries\n• **Language preservation** programs worldwide\n• **Art exhibitions** telling Baluch story\n• **Music concerts** spreading awareness\n• **Food festivals** introducing Baluch culture\n\n📈 **Growing Influence:**\n• **Policy makers listening** - First time in history\n• **Media coverage increasing** - International attention\n• **Academic research expanding** - Universities studying issue\n• **Legal support growing** - Human rights lawyers engaged\n• **Financial support increasing** - Diaspora funding activism\n\n🌍 **International Solidarity:**\n• **Catalan Parliament** - Resolution supporting Baluch rights\n• **Scottish activists** - Solidarity with independence cause\n• **Kurdish organizations** - Shared struggle recognition\n• **Tibetan groups** - Anti-occupation alliance\n• **Palestinian solidarity** - Mutual support in struggle\n\n🔥 **The Global Message:**\n*'We have taken our cause to every corner of the world. The international community now knows: Baluchistan is occupied, and its people demand freedom!'* - Baluch diaspora leader\n\n⭐ **Next Steps:**\nThe diaspora is building toward:\n• **UN recognition** of Baluch right to self-determination\n• **International sanctions** on Pakistan\n• **Diplomatic recognition** of Baluch government-in-exile\n• **Global referendum** on Baluchistan's future"
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
                    <button class="chatbot-toggle" onclick="chatbot.toggleChatbot(); event.stopPropagation();">−</button>
                </div>
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


    showWelcomeMessage() {
        const welcomeMessage = "السلام علیکم! I'm your AI guide to learning about Baluchistan as an occupied land. I can tell you about:";
            
        const buttons = [
            'History of Baluchistan',
            'Why it\'s considered occupied',
            'Baluch resistance movements',
            'Cultural heritage',
            'Natural resources',
            'Human rights situation'
        ];
        
        setTimeout(() => {
            this.addMessage('bot', welcomeMessage, false);
            this.showQuickButtons(buttons);
        }, 1000);
    }

    showQuickButtons(buttons) {
        const quickButtonsContainer = document.getElementById('quick-buttons');
        quickButtonsContainer.innerHTML = '';
        
        buttons.forEach(buttonText => {
            const button = document.createElement('button');
            button.className = 'quick-btn';
            button.textContent = buttonText;
            button.onclick = () => this.handleQuickButton(buttonText);
            quickButtonsContainer.appendChild(button);
        });
    }

    handleQuickButton(buttonText) {
        this.addMessage('user', buttonText);
        document.getElementById('quick-buttons').innerHTML = '';
        
        const responses = {
            'History of Baluchistan': () => {
                const message = "Baluchistan has a rich history spanning thousands of years. Let me tell you about different periods:";
                const buttons = ['Ancient Baluchistan', 'Medieval period', 'British colonial era', 'Khanate of Kalat'];
                
                this.addMessage('bot', message, false);
                this.showQuickButtons(buttons);
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

        const response = responses[buttonText];
        if (response) {
            setTimeout(() => {
                response();
                this.showContextualQuestions();
            }, 800);
        }
    }

    sendMessage() {
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.addMessage('user', message);
        input.value = '';
        document.getElementById('quick-buttons').innerHTML = '';
        
        setTimeout(() => {
            this.generateResponse(message);
        }, 800);
    }

    generateResponse(userMessage) {
        const intent = this.nluEngine.getIntent(userMessage);
        let response = "";
        let followUpButtons = [];
        let topic = null;

        this.showTypingIndicator();

        switch (intent) {
            case 'GREETING':
                response = "السلام علیکم! Welcome to the Baluchistan AI Guide. I'm ready to share the documented history of Baluchistan's occupation and its people's heroic struggle for freedom.";
                followUpButtons = ['Why is Baluchistan occupied?', 'Tell me about Baluch martyrs', 'Show me the evidence of resource theft'];
                break;
            
            case 'QUERY_OCCUPATION':
                response = this.knowledgeBase.occupation.partition.content;
                followUpButtons = ['What are the legal arguments?', 'Tell me about the first resistance', 'How did the British occupy it?'];
                topic = 'occupation';
                break;

            case 'QUERY_HISTORY':
                response = "Baluchistan has a rich, 9,000-year history. Which period interests you most? Knowing the past is key to understanding the present.";
                followUpButtons = ['Ancient Civilization (Mehrgarh)', 'The Khanate of Kalat', 'The British Colonial Era', 'The 1948 Annexation'];
                topic = 'history';
                break;
            
            case 'QUERY_LEADERS':
                response = this.knowledgeBase.leaders.martyrs.content;
                followUpButtons = ['Tell me about historical heroes', 'Who are the modern leaders?', 'Why was Nawab Bugti martyred?'];
                topic = 'leaders';
                break;

            case 'CONTEXT_MORE_INFO':
                const lastTopic = this.context.getLastTopic();
                if (lastTopic && this.knowledgeBase[lastTopic]) {
                    // Provide a more detailed piece of info from the same topic
                    const subTopics = Object.keys(this.knowledgeBase[lastTopic]);
                    const randomSubTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
                    response = this.knowledgeBase[lastTopic][randomSubTopic].content;
                    followUpButtons = this.getFollowUpsForTopic(lastTopic);
                } else {
                    response = "I can elaborate if you first ask me about a specific topic. For example, try asking about 'Baluch history' or 'human rights violations'.";
                    followUpButtons = ['History of Baluchistan', 'Human Rights Crisis', 'Natural Resources'];
                }
                break;

            default:
                response = "That's a great question. The story of Baluchistan is vast. Let me point you to some key topics that might have the answer you're looking for.";
                followUpButtons = ['History of the Occupation', 'The Human Rights Crisis', 'Key Resistance Movements', 'Resource Exploitation'];
                break;
        }

        this.context.addTurn(intent, topic);

        setTimeout(() => {
            this.hideTypingIndicator();
            this.addMessage('bot', response);
            if (followUpButtons.length > 0) {
                this.showQuickButtons(followUpButtons);
            }
        }, 1200);
    }
    
    getFollowUpsForTopic(topic) {
        const allTopics = {
            history: ['Ancient Civilization (Mehrgarh)', 'The Khanate of Kalat', 'The British Colonial Era'],
            occupation: ['What are the legal arguments?', 'How did Pakistan annex it?', 'Was it ever independent?'],
            leaders: ['Tell me about historical heroes', 'Who are the modern leaders?', 'Why was Nawab Bugti martyred?'],
        };
        return allTopics[topic] || ['Main Menu', 'How can I help?'];
    }

    showContextualQuestions() {
        const buttons = ['Tell me more', 'Current situation', 'How can I help?', 'New topic'];
        
        setTimeout(() => {
            this.showQuickButtons(buttons);
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