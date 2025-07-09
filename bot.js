require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadData(file, fallback) {
  const filePath = path.join(DATA_DIR, file);
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath));
  return fallback;
}
function saveData(file, data) {
  const filePath = path.join(DATA_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let sellers = loadData('sellers.json', {});
let items = loadData('items.json', {});
let claims = loadData('claims.json', []);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === '!setup') {
    sellers[message.author.id] = { id: message.author.id };
    saveData('sellers.json', sellers);
    return message.reply('You are now registered as a seller.');
  }

  if (command === '!additem') {
    if (!sellers[message.author.id]) return message.reply('Use !setup to register first.');
    const [category, price, name, ...desc] = args;
    if (!category || !price || !name) return message.reply('Usage: !additem <category> <price> <name> [description]');
    if (!items[category]) items[category] = [];
    const item = { id: Date.now(), seller: message.author.id, category, price: parseFloat(price), name, description: desc.join(' ') };
    items[category].push(item);
    saveData('items.json', items);
    return message.reply(`Added item ${name} in ${category}.`);
  }

  if (command === '!list') {
    const category = args[0];
    if (!category || !items[category]) return message.reply('Category not found.');
    const embed = new EmbedBuilder().setTitle(`Items in ${category}`);
    for (const it of items[category]) {
      embed.addFields({ name: `${it.id}: ${it.name} - $${it.price}`, value: it.description || 'No description', inline: false });
    }
    return message.reply({ embeds: [embed] });
  }

  if (command === '!claim') {
    const id = parseInt(args[0], 10);
    for (const cat of Object.keys(items)) {
      const found = items[cat].find(i => i.id === id);
      if (found) {
        claims.push({ id, claimer: message.author.id, seller: found.seller, price: found.price });
        saveData('claims.json', claims);
        return message.reply(`Claimed item ${id}.`);
      }
    }
    return message.reply('Item not found.');
  }

  if (command === '!claims') {
    const userClaims = claims.filter(c => c.claimer === message.author.id);
    if (!userClaims.length) return message.reply('No claims.');
    const embed = new EmbedBuilder().setTitle('Your Claims');
    for (const c of userClaims) {
      embed.addFields({ name: `Item ${c.id}`, value: `Seller <@${c.seller}> - $${c.price}` });
    }
    return message.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
