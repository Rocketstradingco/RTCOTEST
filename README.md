# RTCO Super Admin Bot

This project provides a small admin dashboard and Discord bot for managing sellers and trading cards. Data is persisted to local JSON files and served through an Express API.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with your Discord credentials. The following variables are used:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `DISCORD_POSTING_CHANNEL_ID`
   - `DISCORD_TRACKING_CHANNEL_ID`
   - `DISCORD_SHARED_IMAGE_DUMP_CHANNEL_ID`
   - `JWT_SECRET`

3. Start the server:
   ```bash
   npm start
   ```

The application will launch the Express dashboard and the Discord bot.

All console output is mirrored to `debug.log` for easier troubleshooting.

## Additional Bot Commands

- `!postcategory <Category> [Channel_ID]` – post or update a category embed with refresh/explore buttons
