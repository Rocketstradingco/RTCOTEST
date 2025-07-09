const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const multer = require('multer');
const fs = require('fs/promises');

// Manager and Bot imports
const cardManager = require('./cardManager');
const userManager = require('./userManager');
const claimManager = require('./claimManager');
const postManager = require('./postManager');
const sellerManager = require('./sellerManager');
// Import getDiscordImageUrl from cardManager
const { startBot, getGuildChannels, sendMessageToChannel, sendCategoryPost, searchChannels, uploadImageToChannel } = require('./bot'); // Import uploadImageToChannel
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Multer setup for handling file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(__dirname));

// --- API ENDPOINTS ---

app.get('/api/data', async (req, res) => {
    try {
        const [cards, users, claims, sellers, posts, channels] = await Promise.all([
            cardManager.getCards(), 
            userManager.getUsers(), 
            claimManager.getClaims(),
            sellerManager.getSellers(), 
            postManager.getPosts(), 
            getGuildChannels().catch(err => {
                console.error("Could not fetch Discord channels, returning empty array.", err.message);
                return []; // Return empty array on failure so the page can still load
            })
        ]);

        // --- IMPORTANT: Reconstruct image URLs for cards before sending to frontend ---
        const cardsWithFullImageUrls = cards.map(card => ({
            ...card,
            // If frontImage is an object { channelId, messageId, filename }, reconstruct URL
            // Otherwise, if it's still an old base64 URL string, use it directly
            frontImage: card.frontImage && typeof card.frontImage === 'object' && card.frontImage.channelId && card.frontImage.messageId
                        ? cardManager.getDiscordImageUrl(card.frontImage.channelId, card.frontImage.messageId, card.frontImage.filename)
                        : (typeof card.frontImage === 'string' ? card.frontImage : 'https://placehold.co/60x60/000000/FFFFFF?text=No+Front'), // Fallback placeholder
            backImage: card.backImage && typeof card.backImage === 'object' && card.backImage.channelId && card.backImage.messageId
                       ? cardManager.getDiscordImageUrl(card.backImage.channelId, card.backImage.messageId, card.backImage.filename)
                       : (typeof card.backImage === 'string' ? card.backImage : 'https://placehold.co/60x60/000000/FFFFFF?text=No+Back') // Fallback placeholder
        }));

        res.json({ cards: cardsWithFullImageUrls, users, claims, sellers, posts, channels });
    } catch (error) {
        console.error("Error fetching initial data:", error.message);
        res.status(500).json({ message: `Failed to fetch server data. Check console.` });
    }
});

// NEW DEBUG DUMP ENDPOINT - This will write to a file in the directory
app.post('/api/debug-dump', async (req, res) => {
    console.log("\n--- ADMIN DEBUG DUMP REQUESTED ---");
    const dumpFilePath = path.join(__dirname, 'debug_dump.txt'); // Define debug file path
    let dumpContent = "--- RTCO SUPER ADMIN BOT DEBUG DUMP ---\n\n";

    try {
        const [cards, users, sellers, claims, posts] = await Promise.all([
            cardManager.getCards(), userManager.getUsers(), sellerManager.getSellers(),
            claimManager.getClaims(), postManager.getPosts()
        ]);

        dumpContent += "[1/5] CARDS:\n" + JSON.stringify(cards, null, 2) + "\n\n";
        dumpContent += "[2/5] USERS:\n" + JSON.stringify(users, null, 2) + "\n\n";
        dumpContent += "[3/5] SELLERS:\n" + JSON.stringify(sellers, null, 2) + "\n\n";
        dumpContent += "[4/5] CLAIMS:\n" + JSON.stringify(claims, null, 2) + "\n\n";
        dumpContent += "[5/5] POSTS:\n" + JSON.stringify(posts, null, 2) + "\n\n";
        dumpContent += "--- END OF DUMP ---\n";

        await fs.writeFile(dumpFilePath, dumpContent, 'utf-8'); // Write to file
        console.log(`Debug dump saved to: ${dumpFilePath}`);
        res.status(200).json({ message: `Data logged to server console and saved to ${dumpFilePath}.` });
    } catch (error) {
        console.error("--- DEBUG DUMP FAILED ---", error);
        res.status(500).json({ message: `Failed to execute debug dump: ${error.message}` });
    }
});

// NEW API ENDPOINT for sending Discord messages
app.post('/api/send-message', async (req, res) => {
    const { channelId, messageContent } = req.body;
    try {
        if (!channelId || !messageContent) {
            throw new Error('Channel ID and message content are required.');
        }
        await sendMessageToChannel(channelId, messageContent);
        res.status(200).json({ message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Error sending message to Discord:', error);
        res.status(500).json({ message: `Failed to send message: ${error.message}` });
    }
});

// NEW API ENDPOINT for creating/updating category posts
app.post('/api/posts/category', async (req, res) => {
    const { category, channelId } = req.body;
    try {
        if (!category || !channelId) {
            throw new Error('Category and Channel ID are required.');
        }

        // Check if a post already exists for this category in this channel
        const existingPosts = await postManager.getPosts();
        const existingPost = existingPosts.find(p => p.category === category && p.channelId === channelId);
        const messageId = existingPost ? existingPost.messageId : null;

        // Send/update the post in Discord
        const sentMessageId = await sendCategoryPost(category, channelId, messageId);

        // Upsert the post record in postManager
        await postManager.upsertPost(category, channelId, sentMessageId);

        res.status(200).json({ message: 'Category post created/updated successfully!', messageId: sentMessageId });
    } catch (error) {
        console.error('Error creating/updating category post:', error);
        res.status(500).json({ message: `Failed to create/update category post: ${error.message}` });
    }
});

// NEW API ENDPOINT for searching channels
app.get('/api/channels/search', async (req, res) => {
    const { query } = req.query;
    try {
        if (!query) {
            return res.status(400).json({ message: 'Search query is required.' });
        }
        const matchingChannels = await searchChannels(query);
        res.status(200).json({ channels: matchingChannels });
    } catch (error) {
        console.error('Error searching channels:', error);
        res.status(500).json({ message: `Failed to search channels: ${error.message}` });
    }
});


app.post('/api/sellers', async (req, res) => {
    try {
        const { name, discordId } = req.body;
        if (!name || !discordId) throw new Error("Seller name and Discord ID are required.");
        const newSeller = await sellerManager.addSeller({ name, discordId, postingChannelId: null, trackingChannelId: null });
        res.status(201).json(newSeller);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.post('/api/sellers/channels', async (req, res) => {
    try {
        const { sellerId, postingChannelId, trackingChannelId } = req.body;
        // Debugging: Log received data
        console.log('Server: Received seller channel update request:');
        console.log('Server: sellerId:', sellerId);
        console.log('Server: postingChannelId:', postingChannelId);
        console.log('Server: trackingChannelId:', trackingChannelId);

        if (!sellerId) throw new Error("Seller ID is required.");
        const updatedSeller = await sellerManager.updateSellerChannels(sellerId, { postingChannelId, trackingChannelId });
        res.status(200).json(updatedSeller);
    } catch (error) {
        console.error('Server: Error updating seller channels:', error.message);
        res.status(400).json({ message: error.message });
    }
});

app.delete('/api/cards/:id', async (req, res) => {
    try {
        await cardManager.deleteCard(req.params.id);
        res.status(200).json({ message: 'Card deleted successfully' });
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
});

// MODIFIED: Single card upload to dump images to Discord
app.post('/api/cards/single', upload.fields([{ name: 'frontImage', maxCount: 1 }, { name: 'backImage', maxCount: 1 }]), async (req, res) => {
    try {
        const { sellerId, name, description, price, category } = req.body;
        const { frontImage, backImage } = req.files;

        if (!sellerId || !price || !category || !frontImage || !backImage) {
            throw new Error("Missing required card information or images.");
        }

        // Upload front image to Discord dump channel
        const uploadedFrontImageInfo = await uploadImageToChannel({
            url: `data:${frontImage[0].mimetype};base64,${frontImage[0].buffer.toString('base64')}`,
            name: frontImage[0].originalname // Pass original filename
        });

        // Upload back image to Discord dump channel
        const uploadedBackImageInfo = await uploadImageToChannel({
            url: `data:${backImage[0].mimetype};base64,${backImage[0].buffer.toString('base64')}`,
            name: backImage[0].originalname // Pass original filename
        });

        const cardData = {
            sellerId,
            name,
            description,
            price: parseFloat(price),
            category,
            frontImage: uploadedFrontImageInfo, // Store channelId, messageId, filename
            backImage: uploadedBackImageInfo    // Store channelId, messageId, filename
        };
        
        const newCard = await cardManager.addCard(cardData);
        res.status(201).json(newCard);
    } catch (error) {
        console.error('Error adding single card:', error);
        res.status(400).json({ message: `Failed to add card: ${error.message}` });
    }
});

async function startServer() {
    io.on('connection', (socket) => console.log('Admin dashboard connected.'));
    cardManager.setSocketIO(io); 
    userManager.setSocketIO(io); 
    claimManager.setSocketIO(io);
    postManager.setSocketIO(io); 
    sellerManager.setSocketIO(io);
    
    try {
        if (config.token) {
            console.log("Attempting to log in Discord bot...");
            await startBot();
        } else {
            console.error('FATAL: DISCORD_TOKEN not found in .env file. Bot will not start.');
        }
    } catch (error) {
        console.error('--- BOT LOGIN FAILED ---');
        console.error('Could not log in the Discord bot. Please verify your DISCORD_TOKEN.');
        console.error(`Error details: ${error.message}`);
    }

    server.listen(PORT, () => console.log(`Super Admin Dashboard live on http://localhost:${PORT}`));
}

startServer();
