const fs = require('fs/promises');
const path = require('path');
const dataFilePath = path.join(__dirname, 'claims.json');
let io = null;

const initializeDataFile = async () => { try { await fs.access(dataFilePath); } catch { await fs.writeFile(dataFilePath, JSON.stringify([])); }};
initializeDataFile();

const getClaims = async () => JSON.parse(await fs.readFile(dataFilePath, 'utf-8'));
const saveClaims = async (claims) => {
    await fs.writeFile(dataFilePath, JSON.stringify(claims, null, 2));
    if (io) io.emit('data_update', { claims: await getClaims() });
};

module.exports = {
    setSocketIO: (socketInstance) => { io = socketInstance; },
    getClaims,
    // **NEW** Function to add a claim
    addClaim: async (claimData) => {
        const claims = await getClaims();
        // Example claimData: { userId: '123', username: 'testuser', cardId: 'card_456', cardName: 'Pikachu' }
        const newClaim = { 
            id: `claim_${Date.now()}`, 
            ...claimData, 
            timestamp: new Date().toISOString() 
        };
        claims.unshift(newClaim); // Add to the top of the list
        await saveClaims(claims);
        return newClaim;
    },
    // Function to remove a claim based on user and card
    removeClaim: async (userId, cardId) => {
        const claims = await getClaims();
        const index = claims.findIndex(
            c => c.userId === userId && c.cardId === cardId
        );
        if (index === -1) {
            throw new Error('Claim not found.');
        }
        claims.splice(index, 1);
        await saveClaims(claims);
        return true;
    },};