# Discord Inventory Bot

This repository contains a Discord inventory bot with a web admin interface. The bot allows sellers to register, create categories and add cards (items). Buyers can claim cards and track what they owe. All data lives in the `data/` folder and every change writes the full state to `debug_dump.txt` for troubleshooting.

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
4. Visit `http://localhost:3000/admin?password=YOURPASSWORD` to manage categories, cards and sellers. Settings can be tweaked from this page and raw data is available at `/admin/debug`.

## Basic Commands
- `!setup` - register yourself as a seller (first seller becomes admin)
- `!addcategory <name>` - create a category
- `!addcard <category> <price> <name> [description]` - add a card (attach an image to upload to the dump channel)
- `!deletecard <id>` - delete one of your cards
- `!sellers` - list registered sellers
- `!list <category>` - list cards in a category
- `!categories` - show available categories
- `!claim <id>` - claim a card
- `!claims` - view your claims (includes buttons to mark paid or unclaim)
- `!reportpayment <id>` - mark one of your claims as paid
- `!unclaim <id>` - remove one of your claims
- `!setimagechannel <channelId>` - admin command to define the image dump channel
- `!settings <key> <value>` - admin command to tweak settings
- `!help` - show commands

The bot posts images using the channel ID configured with `!setimagechannel`. Every change saves to `debug_dump.txt` so you can inspect the current state at any time.
