# Discord Inventory Bot

This repository contains a simple Discord bot together with a minimal web admin interface.
It allows sellers to register themselves, add items to categories and let users claim items through Discord.

## Setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Edit the `.env` file with your Discord bot token and other IDs.
3. Start the bot and web server
   ```bash
   node bot.js &
   node server.js
   ```
4. Visit `http://localhost:3000/admin?password=YOURPASSWORD` to manage categories and items.

## Basic Commands
- `!setup` - register yourself as a seller
- `!additem <category> <price> <name> [description]` - add an item
- `!list <category>` - list items in a category
- `!claim <id>` - claim an item
- `!claims` - view your claims

This is only a minimal starting point and will need further work to become a fully featured inventory system.
