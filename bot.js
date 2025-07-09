const { Client, GatewayIntentBits, ChannelType, Partials, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // Added ButtonBuilder, ButtonStyle
const config = require('./config');
const sellerManager = require('./sellerManager');
const cardManager = require('./cardManager');
const userManager = require('./userManager');
const claimManager = require('./claimManager');
const postManager = require('./postManager'); // Import postManager

// --- CONFIGURATION ---
const ADMIN_USER_IDS = ['1289695143598751889'];
const BOT_PREFIX = '!';
const interactiveSetups = new Map();
const categorySessions = new Map();

const client = new Client({
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions ], // Added GuildMessageReactions for button interactions
    partials: [ Partials.Channel, Partials.Message, Partials.Reaction ] // Added Partials.Message, Partials.Reaction
});

const readyPromise = new Promise(resolve => client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    resolve();
}));

// --- HELPER FUNCTION to check if a user is a registered seller ---
async function isSeller(userId) {
    const sellers = await sellerManager.getSellers();
    return sellers.some(seller => seller.discordId === userId);
}

// --- PRIMARY EVENT HANDLER ---
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;

    // --- Step 1: Handle ongoing interactive setups ---
    if (interactiveSetups.has(msg.author.id)) {
        const setup = interactiveSetups.get(msg.author.id);
        // Special handling for channel name input during setup
        if (setup.step === 'awaiting_posting_channel_name' || setup.step === 'awaiting_tracking_channel_name' ||
            setup.step === 'confirm_posting_channel' || setup.step === 'confirm_tracking_channel') {
            await handleChannelNameInput(msg, setup);
            return;
        }
        if (setup.command === 'setup') await handleSellerSetup(msg, setup);
        if (setup.command === 'addcard') await handleCardSetup(msg, setup);
        return;
    }

    // --- Step 2: Process new commands ---
    if (!msg.content.startsWith(BOT_PREFIX)) return;

    const args = msg.content.slice(BOT_PREFIX.length).trim().match(/(?:[^\s"]+|"[^"]*")+/g).map(arg => arg.replace(/"/g, ''));
    const command = args.shift().toLowerCase();

    // --- Determine User's Role ---
    const userIsAdmin = ADMIN_USER_IDS.includes(msg.author.id);
    const userIsSeller = await isSeller(msg.author.id);

    // --- COMMAND ROUTER ---
    switch(command) {
        // -- Public Commands --
        case 'register':
            await userManager.findOrCreateUser(msg.author);
            return msg.reply('You have been successfully registered!');

        case 'cart':
            const userClaims = (await claimManager.getClaims()).filter(c => c.userId === msg.author.id);
            if (userClaims.length === 0) return msg.reply("You have not claimed any items yet.");
            const cartEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle(`${msg.author.username}'s Cart`)
                .setDescription(userClaims.map(c => `- **${c.cardName}** (ID: \`${c.cardId}\`)`).join('\n'));
            return msg.channel.send({ embeds: [cartEmbed] });

        case 'claim': // Temporary command for testing !cart
            const cardIdToClaim = args[0];
            if (!cardIdToClaim) return msg.reply("Please provide a card ID to claim.");
            const cards = await cardManager.getCards();
            const cardToClaim = cards.find(c => c.id === cardIdToClaim);
            if (!cardToClaim) return msg.reply("That card ID was not found.");
            await claimManager.addClaim({ userId: msg.author.id, username: msg.author.username, cardId: cardToClaim.id, cardName: cardToClaim.name });
            return msg.reply(`You have successfully claimed **${cardToClaim.name}**!`);

        case 'setup':
            if (userIsSeller) return msg.reply("You are already set up as a seller. Use `!myinfo` to see your details.");
            interactiveSetups.set(msg.author.id, { command: 'setup', step: 'name', data: { discordId: msg.author.id } });
            return msg.reply('**Welcome to Seller Setup!**\nThis will guide you through setting up your seller profile.\n\nFirst, what is your seller name?');

        // -- Seller & Admin Commands --
        case 'myinfo':
            if (!userIsSeller) return msg.reply("This command is for sellers only. Use `!setup` to get started.");
            const sellers = await sellerManager.getSellers();
            const sellerProfile = sellers.find(s => s.discordId === msg.author.id);

            // Added a check for sellerProfile existence and fallbacks for its properties
            if (!sellerProfile) {
                return msg.reply("Error: Your seller profile could not be found. Please ensure you have completed the `!setup` process.");
            }

            const infoEmbed = new EmbedBuilder()
                .setColor('#FFEB3B')
                .setTitle(`${sellerProfile.name || 'Unknown Seller'}'s Info`) // Fallback for name
                .addFields(
                    { name: 'Seller Name', value: sellerProfile.name || 'N/A', inline: true },
                    { name: 'Discord ID', value: `\`${sellerProfile.discordId || 'N/A'}\``, inline: true }, // Fallback for discordId
                    { name: 'Posting Channel', value: sellerProfile.postingChannelId ? `<#${sellerProfile.postingChannelId}>` : 'Not Set', inline: false },
                    { name: 'Tracking Channel', value: sellerProfile.trackingChannelId ? `<#${sellerProfile.trackingChannelId}>` : 'Not Set', inline: false },
                );
            return msg.channel.send({ embeds: [infoEmbed] });

        case 'addcard':
            if (!userIsSeller) return msg.reply("This command is for sellers only. Use `!setup` to get started.");
            const [price, category, cardName] = args;
            if (!price || !category || !cardName) return msg.reply('**Usage:** `!addcard <Price> "<Category>" "<Name>"`');
            if (isNaN(parseFloat(price))) return msg.reply('Price must be a valid number.');

            const sellerData = (await sellerManager.getSellers()).find(s => s.discordId === msg.author.id);
            interactiveSetups.set(msg.author.id, {
                command: 'addcard', step: 'front_image',
                data: { sellerId: sellerData.id, price: parseFloat(price), category, name: cardName }
            });
            return msg.reply('✅ Card details staged. **Please upload the FRONT image now.**');

        // -- Admin-Only Commands --
        case 'delcard':
            if (!userIsAdmin) return msg.reply("This is an admin-only command.");
            const cardIdToDelete = args[0];
            if (!cardIdToDelete) return msg.reply('**Usage:** `!delcard <Card_ID>`');
            try {
                await cardManager.deleteCard(cardIdToDelete);
                msg.reply(`✅ Card \`${cardIdToDelete}\` has been deleted.`);
            } catch (error) { msg.reply(`❌ **Error:** ${error.message}`); }
            break;

        case 'postcategory': {
            if (!userIsAdmin) return msg.reply('This is an admin-only command.');
            const [postCategory, channelIdArg] = args;
            if (!postCategory) return msg.reply('**Usage:** `!postcategory <Category> [Channel_ID]`');
            const targetChannelId = channelIdArg || msg.channel.id;
            try {
                const postedId = await sendCategoryPost(postCategory, targetChannelId);
                msg.reply(`Category post sent with message ID \`${postedId}\`.`);
            } catch (error) {
                msg.reply(`❌ **Error:** ${error.message}`);
            }
            break; }

        case 'rtcohelp':
            const helpEmbed = new EmbedBuilder().setColor('#b91c1c').setTitle('RTCO Bot Command List');
            const fields = [
                { name: '--- User Commands ---', value: '`!register` (register with bot)\n`!setup` (start seller setup)\n`!cart` (view claims)\n`!claim <ID>` (claim)\n`!rtcohelp` (help)' }
            ];

            if (userIsSeller) {
                fields.push({ name: '--- Seller Commands ---', value: '`!myinfo` (seller info)\n`!addcard` (add card)' });
            }
            if (userIsAdmin) {
                fields.push({ name: '--- Admin Commands ---', value: '`!delcard <ID>` (delete card)\n`!postcategory <Category> [Channel_ID]` (post category embed)' });
            }
            helpEmbed.addFields(fields);
            return msg.channel.send({ embeds: [helpEmbed] });

        default:
            return msg.reply("Unknown command. Type `!rtcohelp` to see a list of available commands.");
    }
});

// --- INTERACTION HANDLER (for dropdown menus AND buttons) ---
client.on('interactionCreate', async (interaction) => {
    // Handle StringSelectMenu interactions (from old setup flow or general use)
    if (interaction.isStringSelectMenu()) {
        const setup = interactiveSetups.get(interaction.user.id);
        if (!setup || setup.command !== 'setup') return;

        if (interaction.customId === 'seller_setup_posting') {
            setup.data.postingChannelId = interaction.values[0];
            setup.step = 'tracking_channel'; // Move to next step
            interactiveSetups.set(interaction.user.id, setup);
            await interaction.update({ content: '✅ Posting channel set. **Now, please type the name of your TRACKING channel.**', components: [] });
        }
        else if (interaction.customId === 'seller_setup_tracking') {
            setup.data.trackingChannelId = interaction.values[0];
            try {
                await sellerManager.addSeller(setup.data);
                await interaction.update({ content: `🎉 **Success!** You are now registered as seller **${setup.data.name}**. You can now use seller commands like \`!addcard\`.`, components: [] });
            } catch (error) {
                await interaction.update({ content: `❌ **Error:** ${error.message}`, components: [] });
            } finally {
                interactiveSetups.delete(interaction.user.id);
            }
        }
    }

    // Handle Button interactions
    if (interaction.isButton()) {
        const [action, value] = interaction.customId.split('_');

        const cards = await cardManager.getCards();
        const card = cards.find(c => c.id === value);

        switch (action) {
            case 'claim':
                if (!card) {
                    await interaction.reply({ content: 'Error: Card not found.', ephemeral: true });
                    return;
                }
                // Check if already claimed by someone else
                const existingClaims = await claimManager.getClaims();
                const alreadyClaimed = existingClaims.some(c => c.cardId === value);
                if (alreadyClaimed) {
                    await interaction.reply({ content: `❌ This item has already been claimed!`, ephemeral: true });
                    return;
                }

                await claimManager.addClaim({
                    userId: interaction.user.id,
                    username: interaction.user.username,
                    cardId: card.id,
                    cardName: card.name
                });
                await interaction.reply({ content: `✅ You have claimed **${card.name}**!`, ephemeral: true });
                // Attempt to update the original message to reflect the claim
                try {
                    const originalMessage = interaction.message;
                    const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0]); // Clone existing embed
                    // Find the field that contains this card and update its text
                    const cardText = `**${card.name || 'Untitled Card'}** - $${card.price} (ID: \`${card.id}\`)`;
                    const claimedText = `**${card.name || 'Untitled Card'}** - $${card.price} (ID: \`${card.id}\`) - Claimed by ${interaction.user.username}`;
                    
                    // This is a simple text replacement, might need more robust logic for complex embeds
                    updatedEmbed.setDescription(updatedEmbed.description.replace(cardText, claimedText));

                    // Disable the claim button for this card
                    const newComponents = originalMessage.components.map(row => {
                        return new ActionRowBuilder().addComponents(
                            row.components.map(button => {
                                if (button.customId === interaction.customId) {
                                    return ButtonBuilder.from(button).setDisabled(true).setLabel('Claimed!');
                                }
                                return ButtonBuilder.from(button);
                            })
                        );
                    });

                    await originalMessage.edit({ embeds: [updatedEmbed], components: newComponents });

                } catch (error) {
                    console.error(`Error updating embed after claim: ${error.message}`);
                }
                break;

            case 'unclaim':
                if (!card) {
                    await interaction.reply({ content: 'Error: Card not found.', ephemeral: true });
                    return;
                }
                // Check if claimed by this user
                const claimsByThisUser = (await claimManager.getClaims()).filter(c => c.userId === interaction.user.id && c.cardId === value);
                if (claimsByThisUser.length === 0) {
                    await interaction.reply({ content: `❌ You have not claimed this item.`, ephemeral: true });
                    return;
                }
                await claimManager.removeClaim(interaction.user.id, card.id);
                await interaction.reply({ content: `✅ You have unclaimed **${card.name}**!`, ephemeral: true });
                // Attempt to update the original message to reflect the unclaim
                try {
                    const originalMessage = interaction.message;
                    const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0]); // Clone existing embed
                    const cardText = `**${card.name || 'Untitled Card'}** - $${card.price} (ID: \`${card.id}\`) - Claimed by ${interaction.user.username}`;
                    const unclaimedText = `**${card.name || 'Untitled Card'}** - $${card.price} (ID: \`${card.id}\`)`;
                    updatedEmbed.setDescription(updatedEmbed.description.replace(cardText, unclaimedText));

                    // Re-enable the claim button for this card
                    const newComponents = originalMessage.components.map(row => {
                        return new ActionRowBuilder().addComponents(
                            row.components.map(button => {
                                if (button.customId === `claim_${value}`) { // Re-enable the claim button
                                    return ButtonBuilder.from(button).setDisabled(false).setLabel('Claim');
                                }
                                return ButtonBuilder.from(button);
                            })
                        );
                    });
                    await originalMessage.edit({ embeds: [updatedEmbed], components: newComponents });

                } catch (error) {
                    console.error(`Error updating embed after unclaim: ${error.message}`);
                }
                break;

            case 'refresh':
                await sendCategoryPost(value, interaction.channelId, interaction.message.id);
                await interaction.deferUpdate();
                break;

            case 'explore':
                const isMobile = !!interaction.member?.presence?.clientStatus?.mobile;
                await interaction.reply({ content: 'Loading...', ephemeral: true });
                await sendCategoryPage(interaction, value, 0, isMobile ? 4 : 9);
                break;

            case 'catnext':
            case 'catprev':
            case 'catclose':
                const sessionKey = `${interaction.user.id}_${value}`;
                const session = categorySessions.get(sessionKey) || { page: 0, perPage: 9 };
                if (action === 'catclose') {
                    categorySessions.delete(sessionKey);
                    await interaction.update({ content: 'Closed.', embeds: [], components: [] });
                    break;
                }
                const newPage = action === 'catnext' ? session.page + 1 : session.page - 1;
                await interaction.deferUpdate();
                await sendCategoryPage(interaction, value, newPage, session.perPage);
                break;

            default:
                await interaction.reply({ content: 'Unknown button action.', ephemeral: true });
                break;
        }
    }
});

// --- HELPER FUNCTIONS for Interactive Setups ---
async function handleSellerSetup(msg, setup) {
    if (setup.step === 'name') {
        setup.data.name = msg.content;
        setup.step = 'awaiting_posting_channel_name'; // New step for text input
        interactiveSetups.set(msg.author.id, setup);
        await msg.reply(`✅ Seller name set to **${msg.content}**. **Now, please type the name or paste the mention of your POSTING channel.** (e.g., \`item-sales\` or \`#item-sales\`)`);
    }
    // Removed the old dropdown logic here, it's now handled by handleChannelNameInput
}

async function handleChannelNameInput(msg, setup) {
    let channelInput = msg.content.trim();
    console.log(`[DEBUG] handleChannelNameInput: Raw user input: "${channelInput}"`); // DEBUG LOG

    // Attempt to extract ID if it's a channel mention format <#ID>
    const channelMentionMatch = channelInput.match(/^<#(\d+)>$/);
    let searchParam = channelInput; // Default to raw input for name search

    if (channelMentionMatch) {
        searchParam = channelMentionMatch[1]; // Use extracted ID for search
        console.log(`[DEBUG] handleChannelNameInput: Detected channel mention. Extracted ID: "${searchParam}"`); // DEBUG LOG
    } else {
        // If not a mention, remove leading # if present for name search
        if (channelInput.startsWith('#')) {
            searchParam = channelInput.substring(1);
            console.log(`[DEBUG] handleChannelNameInput: Removed leading '#'. Search param: "${searchParam}"`); // DEBUG LOG
        }
    }

    if (!searchParam) {
        return msg.reply('Please provide a channel name or ID.');
    }

    const matchingChannels = await searchChannels(searchParam);
    console.log('[DEBUG] handleChannelNameInput: Channels found by searchChannels:', matchingChannels); // DEBUG LOG

    if (matchingChannels.length === 0) {
        return msg.reply(`❌ No text channels found matching "${channelInput}". Please try again or type the exact channel ID.`);
    }

    let channelList = matchingChannels.map(c => `**#${c.name}** (ID: \`${c.id}\`)`).join('\n');
    if (matchingChannels.length > 5) { // Limit display to avoid spam
        channelList = matchingChannels.slice(0, 5).map(c => `**#${c.name}** (ID: \`${c.id}\`)`).join('\n') + `\n...and ${matchingChannels.length - 5} more.`;
    }

    // If only one channel is found, and it's an exact ID match, auto-confirm it
    if (matchingChannels.length === 1 && (searchParam === matchingChannels[0].id || searchParam.toLowerCase() === matchingChannels[0].name.toLowerCase())) {
        const confirmedChannel = matchingChannels[0];
        if (setup.step === 'awaiting_posting_channel_name' || setup.step === 'confirm_posting_channel') {
            setup.data.postingChannelId = confirmedChannel.id;
            setup.step = 'awaiting_tracking_channel_name';
            delete setup.temp_channels;
            interactiveSetups.set(msg.author.id, setup);
            await msg.reply(`✅ Posting channel set to **#${confirmedChannel.name}**. **Now, please type the name or paste the mention of your TRACKING channel.** (e.g., \`seller-tracking\` or \`#seller-tracking\`)`);
        } else if (setup.step === 'awaiting_tracking_channel_name' || setup.step === 'confirm_tracking_channel') {
            setup.data.trackingChannelId = confirmedChannel.id;
            try {
                await sellerManager.addSeller(setup.data);
                // Fetch the name of the posting channel for the success message
                const postingChannelName = setup.data.postingChannelId ? (client.channels.cache.get(setup.data.postingChannelId)?.name || 'Not Set') : 'Not Set';
                await msg.reply(`🎉 **Success!** You are now registered as seller **${setup.data.name}**. Posting: **#${postingChannelName}**. Tracking: **#${confirmedChannel.name}**. You can now use seller commands like \`!addcard\`.`);
            } catch (error) {
                await msg.reply(`❌ **Error:** ${error.message}`);
            } finally {
                interactiveSetups.delete(msg.author.id);
            }
        }
        return; // Exit after auto-confirmation
    }


    // If multiple channels found or no exact match, ask for explicit ID
    if (setup.step === 'awaiting_posting_channel_name') {
        setup.step = 'confirm_posting_channel';
        setup.temp_channels = matchingChannels; // Store matches for confirmation
        interactiveSetups.set(msg.author.id, setup);
        await msg.reply(`I found the following channels for "${channelInput}":\n${channelList}\nPlease type the **exact ID** of the channel you want to set as your POSTING channel.`);
    } else if (setup.step === 'awaiting_tracking_channel_name') {
        setup.step = 'confirm_tracking_channel';
        setup.temp_channels = matchingChannels; // Store matches for confirmation
        interactiveSetups.set(msg.author.id, setup);
        await msg.reply(`I found the following channels for "${channelInput}":\n${channelList}\nPlease type the **exact ID** of the channel you want to set as your TRACKING channel.`);
    } else if (setup.step === 'confirm_posting_channel') {
        const selectedChannelId = msg.content.trim();
        console.log(`[DEBUG] handleChannelNameInput: User typed ID for confirmation: "${selectedChannelId}" (Length: ${selectedChannelId.length})`); // DEBUG LOG
        console.log('[DEBUG] handleChannelNameInput: temp_channels content for lookup:', setup.temp_channels); // DEBUG LOG
        const confirmedChannel = setup.temp_channels.find(c => c.id === selectedChannelId);
        console.log('[DEBUG] handleChannelNameInput: Result of find operation (confirmedChannel):', confirmedChannel); // DEBUG LOG

        if (!confirmedChannel) {
            return msg.reply('❌ Invalid channel ID. Please type one of the IDs from the list above, or re-type the channel name to search again.');
        }

        setup.data.postingChannelId = confirmedChannel.id;
        setup.step = 'awaiting_tracking_channel_name'; // Move to next step
        delete setup.temp_channels; // Clear temporary data
        interactiveSetups.set(msg.author.id, setup);
        await msg.reply(`✅ Posting channel set to **#${confirmedChannel.name}**. **Now, please type the name or paste the mention of your TRACKING channel.** (e.g., \`seller-tracking\` or \`#seller-tracking\`)`);

    } else if (setup.step === 'confirm_tracking_channel') {
        const selectedChannelId = msg.content.trim();
        console.log(`[DEBUG] handleChannelNameInput: User typed ID for confirmation: "${selectedChannelId}" (Length: ${selectedChannelId.length})`); // DEBUG LOG
        console.log('[DEBUG] handleChannelNameInput: temp_channels content for lookup:', setup.temp_channels); // DEBUG LOG
        const confirmedChannel = setup.temp_channels.find(c => c.id === selectedChannelId);
        console.log('[DEBUG] handleChannelNameInput: Result of find operation (confirmedChannel):', confirmedChannel); // DEBUG LOG

        if (!confirmedChannel) {
            return msg.reply('❌ Invalid channel ID. Please type one of the IDs from the list above, or re-type the channel name to search again.');
        }

        setup.data.trackingChannelId = confirmedChannel.id;
        try {
            await sellerManager.addSeller(setup.data);
            // Fetch the name of the posting channel for the success message
            const postingChannelName = setup.data.postingChannelId ? (client.channels.cache.get(setup.data.postingChannelId)?.name || 'Not Set') : 'Not Set';
            await msg.reply(`🎉 **Success!** You are now registered as seller **${setup.data.name}**. Posting: **#${postingChannelName}**. Tracking: **#${confirmedChannel.name}**. You can now use seller commands like \`!addcard\`.`);
        } catch (error) {
            await msg.reply(`❌ **Error:** ${error.message}`);
        } finally {
            interactiveSetups.delete(msg.author.id);
        }
    }
}


async function handleCardSetup(msg, setup) {
    const image = msg.attachments.first();
    if (!image || !image.contentType?.startsWith('image/')) {
        return msg.reply('That was not an image. Please upload an image file.');
    }

    // Try to upload the image to the shared dump channel
    try {
        const uploadedImageInfo = await uploadImageToChannel(image);
        console.log(`[DEBUG] Image uploaded: ChannelID=${uploadedImageInfo.channelId}, MessageID=${uploadedImageInfo.messageId}, Filename=${uploadedImageInfo.filename}`); // DEBUG LOG

        if (setup.step === 'front_image') {
            setup.data.frontImage = uploadedImageInfo; // Store object with channelId, messageId, filename
            setup.step = 'back_image';
            interactiveSetups.set(msg.author.id, setup);
            await msg.reply('✅ Front image received and uploaded. **Please upload the BACK image now.**');
        } else if (setup.step === 'back_image') {
            setup.data.backImage = uploadedImageInfo; // Store object with channelId, messageId, filename
            try {
                await cardManager.addCard(setup.data);
                await msg.reply('🎉 **Success!** New card has been created and added to your inventory with image IDs.');
            } catch (error) {
                 await msg.reply(`❌ **Error saving card:** ${error.message}`);
            } finally {
                interactiveSetups.delete(msg.author.id);
            }
        }
    } catch (uploadError) {
        console.error(`[ERROR] Failed to upload image to shared dump channel: ${uploadError.message}`); // ERROR LOG
        interactiveSetups.delete(msg.author.id); // Clear setup on critical error
        return msg.reply(`❌ Failed to upload image to shared storage: ${uploadError.message}. Please ensure the bot has permissions in the configured image dump channel.`);
    }
}

// --- NEW FUNCTION: Upload Image to Shared Channel ---
async function uploadImageToChannel(attachment) {
    await readyPromise;
    if (!config.sharedImageDumpChannelId) {
        throw new Error('DISCORD_SHARED_IMAGE_DUMP_CHANNEL_ID is not configured in .env');
    }

    const dumpChannel = client.channels.cache.get(config.sharedImageDumpChannelId);
    if (!dumpChannel) {
        throw new Error(`Configured image dump channel (ID: ${config.sharedImageDumpChannelId}) not found or not accessible.`);
    }
    if (dumpChannel.type !== ChannelType.GuildText) {
        throw new Error(`Configured image dump channel (${dumpChannel.name}) is not a text channel.`);
    }

    try {
        const message = await dumpChannel.send({
            files: [{
                attachment: attachment.url, // Discord.js can directly take a URL from an attachment
                name: attachment.name // Use original filename
            }]
        });
        // Assuming the attachment is the first one in the message
        const uploadedAttachment = message.attachments.first();
        if (uploadedAttachment) {
            return {
                channelId: message.channel.id,
                messageId: message.id,
                filename: uploadedAttachment.name // Store the filename to reconstruct URL later
            };
        } else {
            throw new Error('Failed to retrieve uploaded attachment info.');
        }
    } catch (error) {
        console.error(`[ERROR] Error sending attachment to dump channel: ${error.message}`); // ERROR LOG
        throw new Error(`Bot could not upload image to dump channel. Check bot permissions and channel ID.`);
    }
}


// --- NEW FUNCTION: Send message to a specific channel ---
async function sendMessageToChannel(channelId, messageContent) {
    await readyPromise; // Ensure the bot is ready
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        throw new Error(`Channel with ID ${channelId} not found or not accessible.`);
    }
    if (channel.type !== ChannelType.GuildText) {
        throw new Error(`Channel ${channel.name} is not a text channel.`);
    }
    const sentMessage = await channel.send(messageContent);
    return sentMessage.id; // Return the message ID
}

// --- NEW FUNCTION: Send/Update Category Post ---
async function sendCategoryPost(category, channelId, existingMessageId = null) {
    await readyPromise; // Ensure the bot is ready
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        throw new Error(`Channel with ID ${channelId} not found or not accessible.`);
    }
    if (channel.type !== ChannelType.GuildText) {
        throw new Error(`Channel ${channel.name} is not a text channel.`);
    }

    const cardsInCategory = (await cardManager.getCards()).filter(card => card.category === category);
    const existingClaims = await claimManager.getClaims(); // Fetch all claims

    const embedFields = [];
    const components = []; // To hold ActionRows for buttons
    let coverImage = null;

    if (cardsInCategory.length > 0) {
        // Create a button row for each card (or group of cards if too many buttons)
        // Discord limits 5 buttons per ActionRow, 5 ActionRows per message
        let currentActionRow = new ActionRowBuilder();
        let buttonCountInRow = 0;
        let totalButtonRows = 0;

        coverImage = cardManager.getDiscordImageUrl(
            cardsInCategory[0].frontImage.channelId,
            cardsInCategory[0].frontImage.messageId,
            cardsInCategory[0].frontImage.filename
        );

        for (const card of cardsInCategory) {
            const isClaimed = existingClaims.some(claim => claim.cardId === card.id);
            const claimer = isClaimed ? existingClaims.find(claim => claim.cardId === card.id).username : null;

            const cardDescription = `**${card.name || 'Untitled Card'}** - $${card.price} (ID: \`${card.id}\`)` +
                                    (isClaimed ? ` - Claimed by ${claimer}` : '');

            embedFields.push({
                name: `Card: ${card.name || 'Untitled'}`,
                value: cardDescription,
                inline: false
            });

            // Add Claim/Unclaim buttons
            if (buttonCountInRow < 5 && totalButtonRows < 5) { // Max 5 buttons per row, max 5 rows
                const claimButton = new ButtonBuilder()
                    .setCustomId(`claim_${card.id}`)
                    .setLabel(isClaimed ? 'Claimed!' : 'Claim')
                    .setStyle(isClaimed ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(isClaimed); // Disable if already claimed

                const unclaimButton = new ButtonBuilder()
                    .setCustomId(`unclaim_${card.id}`)
                    .setLabel('Unclaim')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!isClaimed); // Disable if not claimed

                currentActionRow.addComponents(claimButton, unclaimButton); // Add both buttons

                buttonCountInRow += 2; // Each card adds 2 buttons

                if (buttonCountInRow >= 5) { // If row is full, add it and start new one
                    components.push(currentActionRow);
                    currentActionRow = new ActionRowBuilder();
                    buttonCountInRow = 0;
                    totalButtonRows++;
                }
            }
        }

        // Push any remaining buttons in the last row
        if (buttonCountInRow > 0) {
            components.push(currentActionRow);
            totalButtonRows++;
        }

        // Add Explore/Refresh buttons as final row
        const exploreButton = new ButtonBuilder()
            .setCustomId(`explore_${category}`)
            .setLabel('Explore')
            .setStyle(ButtonStyle.Primary);

        const refreshButton = new ButtonBuilder()
            .setCustomId(`refresh_${category}`)
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary);

        components.push(new ActionRowBuilder().addComponents(exploreButton, refreshButton));

    } else {
        embedFields.push({ name: 'No Items', value: 'No items currently in this category.', inline: false });
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Category: ${category} Items`)
        .setTimestamp()
        .setFooter({ text: 'RTCO Bot' })
        .addFields(embedFields);

    if (coverImage) embed.setImage(coverImage);

    let sentMessage;
    if (existingMessageId) {
        try {
            const messageToEdit = await channel.messages.fetch(existingMessageId);
            sentMessage = await messageToEdit.edit({ embeds: [embed], components: components });
        } catch (error) {
            console.warn(`Could not find message with ID ${existingMessageId} to edit. Sending a new one.`, error.message);
            sentMessage = await channel.send({ embeds: [embed], components: components });
        }
    } else {
        sentMessage = await channel.send({ embeds: [embed], components: components });
    }

    return sentMessage.id; // Return the ID of the sent or edited message
}

async function sendCategoryPage(interaction, category, page, perPage) {
    const cards = await cardManager.getCardsByCategory(category);
    const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
    const normalizedPage = ((page % totalPages) + totalPages) % totalPages;
    const start = normalizedPage * perPage;
    const pageCards = cards.slice(start, start + perPage);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Browse ${category} (${normalizedPage + 1}/${totalPages})`)
        .setDescription(pageCards.map(c => `**${c.name}**` ).join('\n'));

    if (pageCards[0]) {
        const url = cardManager.getDiscordImageUrl(
            pageCards[0].frontImage.channelId,
            pageCards[0].frontImage.messageId,
            pageCards[0].frontImage.filename
        );
        embed.setImage(url);
    }

    const left = new ButtonBuilder().setCustomId(`catprev_${category}`).setLabel('←').setStyle(ButtonStyle.Secondary);
    const close = new ButtonBuilder().setCustomId(`catclose_${category}`).setLabel('Back').setStyle(ButtonStyle.Danger);
    const right = new ButtonBuilder().setCustomId(`catnext_${category}`).setLabel('→').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(left, close, right);

    await interaction.editReply({ embeds: [embed], components: [row] });
    categorySessions.set(`${interaction.user.id}_${category}`, { page: normalizedPage, perPage });
}


// --- NEW FUNCTION: Search Channels by Name or ID ---
async function searchChannels(query) {
    await readyPromise; // Ensure the bot is ready
    const guild = await client.guilds.fetch(config.guildId);
    const channels = await guild.channels.fetch();
    const lowerCaseQuery = query.toLowerCase();

    // Filter for text channels and match by name (case-insensitive) or by exact ID
    return channels.filter(c => 
        c.type === ChannelType.GuildText && 
        (c.name.toLowerCase().includes(lowerCaseQuery) || c.id === query) // Added ID match
    ).map(c => ({ id: c.id, name: c.name }));
}


// --- EXPORTED MODULE ---
module.exports = {
    startBot: async () => {
        await client.login(config.token);
    },
    getGuildChannels: async () => {
        await readyPromise;
        const guild = await client.guilds.fetch(config.guildId);
        const channels = await guild.channels.fetch();
        // Return only text channels, adhering to Discord's 25 option limit for select menus
        return channels.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name }));
    },
    sendMessageToChannel,
    sendCategoryPost,
    sendCategoryPage,
    searchChannels, // Export the new search function
    uploadImageToChannel // Export the new image upload function
};
