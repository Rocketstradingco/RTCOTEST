# Discord Inventory Bot

This repository contains a Discord inventory bot with a small web admin interface.
Sellers register through Discord, add items and categories and users claim those items.
All data is kept in the `data/` folder and a `debug_dump.txt` file is automatically updated whenever changes occur.

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
- `!categories` - show available categories
- `!claim <id>` - claim an item
- `!claims` - view your claims
- `!help` - show commands

This is only a minimal starting point and will need further work to become a fully featured inventory system.
