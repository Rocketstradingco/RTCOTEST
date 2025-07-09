const fs = require('fs/promises');
const path = require('path');
const dataFilePath = path.join(__dirname, 'sellers.json');
let io = null;

const initializeDataFile = async () => {
    try {
        await fs.access(dataFilePath);
    } catch {
        // If file doesn't exist, create it with an empty array
        await fs.writeFile(dataFilePath, JSON.stringify([]));
    }
};
initializeDataFile(); // Initialize the data file on startup

const getSellers = async () => {
    try {
        const data = await fs.readFile(dataFilePath, 'utf-8');
        // Add a try-catch block for JSON.parse to handle corrupted files
        try {
            // If data is empty string, return empty array to prevent JSON.parse error
            if (data.trim() === '') {
                console.warn("sellers.json is empty. Re-initializing.");
                await fs.writeFile(dataFilePath, JSON.stringify([])); // Re-initialize
                return [];
            }
            return JSON.parse(data);
        } catch (jsonError) {
            console.error("Error parsing sellers.json:", jsonError.message);
            // If JSON is corrupted, return an empty array and re-initialize the file
            console.warn("Corrupted sellers.json detected. Re-initializing file.");
            await fs.writeFile(dataFilePath, JSON.stringify([])); // Overwrite with empty array
            return [];
        }
    } catch (error) {
        console.error("Error reading sellers data file:", error.message);
        // If file doesn't exist or other read error, ensure it's created as empty array
        await initializeDataFile(); // Ensure file exists and is empty
        return [];
    }
};

const saveSellers = async (sellers) => {
    try {
        await fs.writeFile(dataFilePath, JSON.stringify(sellers, null, 2));
        // Emit data update to connected clients (e.g., admin dashboard)
        if (io) {
            io.emit('data_update', { sellers: await getSellers() });
        }
    } catch (error) {
        console.error("Error saving sellers data file:", error.message);
        throw new Error("Failed to save seller data.");
    }
};

module.exports = {
    setSocketIO: (socketInstance) => {
        io = socketInstance;
    },
    getSellers,
    addSeller: async (sellerInfo) => {
        const sellers = await getSellers();
        const newSeller = {
            id: `seller_${Date.now()}`,
            name: sellerInfo.name,
            discordId: sellerInfo.discordId,
            postingChannelId: sellerInfo.postingChannelId || null, // Ensure default to null
            trackingChannelId: sellerInfo.trackingChannelId || null, // Ensure default to null
            createdAt: new Date().toISOString() // Add creation timestamp
        };
        sellers.push(newSeller);
        await saveSellers(sellers);
        return newSeller;
    },
    updateSellerChannels: async (sellerId, { postingChannelId, trackingChannelId }) => {
        let sellers = await getSellers();
        const sellerIndex = sellers.findIndex(s => s.id === sellerId);

        if (sellerIndex === -1) {
            throw new Error("Seller not found.");
        }

        // Update the channels for the found seller
        sellers[sellerIndex].postingChannelId = postingChannelId || null;
        sellers[sellerIndex].trackingChannelId = trackingChannelId || null;

        await saveSellers(sellers);
        return sellers[sellerIndex]; // Return the updated seller object
    },
    // You can add other seller-related functions here (e.g., deleteSeller, getSellerById)
};
