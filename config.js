require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    postingChannelId: process.env.DISCORD_POSTING_CHANNEL_ID,
    trackingChannelId: process.env.DISCORD_TRACKING_CHANNEL_ID,
    sharedImageDumpChannelId: process.env.DISCORD_SHARED_IMAGE_DUMP_CHANNEL_ID, // NEW LINE
    jwtSecret: process.env.JWT_SECRET
};