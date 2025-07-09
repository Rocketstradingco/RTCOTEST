const fs = require('fs/promises');
const path = require('path');
const dataFilePath = path.join(__dirname, 'users.json');
let io = null;
const initializeDataFile = async () => { try { await fs.access(dataFilePath); } catch { await fs.writeFile(dataFilePath, JSON.stringify([])); }};
initializeDataFile();
const getUsers = async () => JSON.parse(await fs.readFile(dataFilePath, 'utf-8'));
const saveUsers = async (users) => {
    await fs.writeFile(dataFilePath, JSON.stringify(users, null, 2));
    if (io) io.emit('data_update', { users: await getUsers() });
};
module.exports = {
    setSocketIO: (socketInstance) => { io = socketInstance; },
    getUsers,
    findOrCreateUser: async (discordUser) => {
        const users = await getUsers();
        let user = users.find(u => u.id === discordUser.id);
        if (!user) {
            user = { id: discordUser.id, username: discordUser.username };
            users.push(user);
            await saveUsers(users);
        }
        return user;
    },
};
