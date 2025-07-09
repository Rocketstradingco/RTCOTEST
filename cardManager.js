const fs = require('fs/promises');
const path = require('path');
const dataFilePath = path.join(__dirname, 'cards.json');
let io = null;

const initializeDataFile = async () => { try { await fs.access(dataFilePath); } catch { await fs.writeFile(dataFilePath, JSON.stringify([])); }};
initializeDataFile();

const getCards = async () => JSON.parse(await fs.readFile(dataFilePath, 'utf-8'));

const saveCards = async (cards) => {
    await fs.writeFile(dataFilePath, JSON.stringify(cards, null, 2));
    if (io) io.emit('data_update', { cards: await getCards() });
};

// Helper to reconstruct Discord image URL
const getDiscordImageUrl = (channelId, messageId, filename = 'image.png') => {
    // This is a common way to reconstruct image URLs from Discord CDN
    // The actual URL might vary slightly based on Discord's CDN structure
    // but this format usually works for attachments.
    return `https://cdn.discordapp.com/attachments/${channelId}/${messageId}/${filename}`;
};

module.exports = {
    setSocketIO: (socketInstance) => { io = socketInstance; },
    getCards,
    // Modified addCard to store channelId and messageId for images
    addCard: async (cardData) => {
        const cards = await getCards();
        // cardData now expects frontImage and backImage to be objects { channelId, messageId, filename }
        const newCard = {
            id: `card_${Date.now()}`,
            name: cardData.name,
            description: cardData.description,
            price: cardData.price,
            category: cardData.category,
            sellerId: cardData.sellerId,
            frontImage: {
                channelId: cardData.frontImage.channelId,
                messageId: cardData.frontImage.messageId,
                filename: cardData.frontImage.filename // Store filename for URL reconstruction
            },
            backImage: {
                channelId: cardData.backImage.channelId,
                messageId: cardData.backImage.messageId,
                filename: cardData.backImage.filename // Store filename for URL reconstruction
            }
        };
        cards.push(newCard);
        await saveCards(cards);
        return newCard;
    },
    deleteCard: async (cardId) => {
        let cards = await getCards();
        const initialLength = cards.length;
        cards = cards.filter(c => c.id !== cardId);
        
        if (cards.length === initialLength) {
            throw new Error("Card ID not found.");
        }
        
        await saveCards(cards);
        return true;
    },
    getCardsByCategory: async (category) => (await getCards()).filter(c => c.category === category),
    // Export the helper to reconstruct URLs for display in GUI
    getDiscordImageUrl
};