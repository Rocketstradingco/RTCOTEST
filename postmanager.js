const fs = require('fs/promises');
const path = require('path');
const dataFilePath = path.join(__dirname, 'posts.json');
let io = null;
const initializeDataFile = async () => { try { await fs.access(dataFilePath); } catch { await fs.writeFile(dataFilePath, JSON.stringify([])); }};
initializeDataFile();
const getPosts = async () => JSON.parse(await fs.readFile(dataFilePath, 'utf-8'));
const savePosts = async (posts) => {
    await fs.writeFile(dataFilePath, JSON.stringify(posts, null, 2));
    if (io) io.emit('data_update', { posts: await getPosts() });
};
module.exports = {
    setSocketIO: (socketInstance) => { io = socketInstance; },
    getPosts,
    upsertPost: async (category, channelId, messageId) => {
        const posts = await getPosts();
        const existingPostIndex = posts.findIndex(p => p.category === category && p.channelId === channelId);
        if (existingPostIndex > -1) {
            posts[existingPostIndex].messageId = messageId;
        } else {
            posts.push({ category, channelId, messageId });
        }
        await savePosts(posts);
        return posts;
    },
};
