require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { store, save } = require('./dataStore');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === '!setup') {
    store.sellers[message.author.id] = { id: message.author.id };
    save();
    return message.reply('You are now registered as a seller.');
  }

  if (command === '!additem') {
    if (!store.sellers[message.author.id]) return message.reply('Use !setup to register first.');
    const [category, price, name, ...desc] = args;
    if (!category || !price || !name) return message.reply('Usage: !additem <category> <price> <name> [description]');
    if (!store.items[category]) store.items[category] = [];
    const item = { id: Date.now(), seller: message.author.id, category, price: parseFloat(price), name, description: desc.join(' ') };
    store.items[category].push(item);
    save();
    return message.reply(`Added item ${name} in ${category}.`);
  }

  if (command === '!list') {
    const category = args[0];
    if (!category || !store.items[category]) return message.reply('Category not found.');
    const embed = new EmbedBuilder().setColor(store.settings.embedColor).setTitle(`Items in ${category}`);
    for (const it of store.items[category]) {
      embed.addFields({ name: `${it.id}: ${it.name} - $${it.price}`, value: it.description || 'No description', inline: false });
    }
    return message.reply({ embeds: [embed] });
  }

  if (command === '!categories') {
    const list = Object.keys(store.items);
    if (!list.length) return message.reply('No categories.');
    return message.reply('Categories: ' + list.join(', '));
  }

  if (command === '!claim') {
    const id = parseInt(args[0], 10);
    for (const cat of Object.keys(store.items)) {
      const found = store.items[cat].find(i => i.id === id);
      if (found) {
        store.claims.push({ id, claimer: message.author.id, seller: found.seller, price: found.price });
        save();
        return message.reply(`Claimed item ${id}.`);
      }
    }
    return message.reply('Item not found.');
  }

  if (command === '!claims') {
    const userClaims = store.claims.filter(c => c.claimer === message.author.id);
    if (!userClaims.length) return message.reply('No claims.');
    const embed = new EmbedBuilder().setColor(store.settings.embedColor).setTitle('Your Claims');
    for (const c of userClaims) {
      embed.addFields({ name: `Item ${c.id}`, value: `Seller <@${c.seller}> - $${c.price}` });
    }
    return message.reply({ embeds: [embed] });
  }

  if (command === '!help') {
    return message.reply('Commands: !setup, !additem, !list <category>, !categories, !claim <id>, !claims');
  }
});

client.login(process.env.DISCORD_TOKEN);
