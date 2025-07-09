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
    const firstAdmin = !store.settings.admin;
    store.sellers[message.author.id] = { id: message.author.id, admin: firstAdmin };
    if (firstAdmin) {
      store.settings.admin = message.author.id;
    }
    save();
    return message.reply(firstAdmin ? 'You are registered as admin seller.' : 'You are now registered as a seller.');
  }

  if (command === '!addcard') {
    if (!store.sellers[message.author.id]) return message.reply('Use !setup to register first.');
    const [category, price, name, ...desc] = args;
    if (!category || !price || !name) return message.reply('Usage: !addcard <category> <price> <name> [description]');
    if (!store.cards[category]) store.cards[category] = [];
    let image = message.attachments.first()?.url || args.find(a => /^https?:/.test(a));
    const card = { id: Date.now(), seller: message.author.id, category, price: parseFloat(price), name, description: desc.join(' ') };
    if (image && store.settings.imageDumpChannel) {
      try {
        const dump = await client.channels.fetch(store.settings.imageDumpChannel);
        const sent = await dump.send({ files: [image] });
        image = sent.attachments.first()?.url;
      } catch {
        // ignore errors and keep original url
      }
    }
    if (image) card.image = image;
    store.cards[category].push(card);
    save();
    return message.reply(`Added card ${name} in ${category}.`);
  }

  if (command === '!addcategory') {
    if (!store.sellers[message.author.id]) return message.reply('Use !setup first.');
    const name = args[0];
    if (!name) return message.reply('Usage: !addcategory <name>');
    if (!store.cards[name]) store.cards[name] = [];
    save();
    return message.reply(`Category ${name} added.`);
  }

  if (command === '!deletecard') {
    const id = parseInt(args[0], 10);
    if (!id) return message.reply('Usage: !deletecard <id>');
    for (const cat of Object.keys(store.cards)) {
      const idx = store.cards[cat].findIndex(c => c.id === id);
      if (idx !== -1) {
        const card = store.cards[cat][idx];
        if (card.seller !== message.author.id && message.author.id !== store.settings.admin) {
          return message.reply('You cannot delete this card');
        }
        store.cards[cat].splice(idx, 1);
        save();
        return message.reply('Card deleted');
      }
    }
    return message.reply('Card not found');
  }

  if (command === '!list') {
    const category = args[0];
    if (!category || !store.cards[category]) return message.reply('Category not found.');
    const embed = new EmbedBuilder().setColor(store.settings.embedColor).setTitle(`Cards in ${category}`);
    for (const it of store.cards[category]) {
      embed.addFields({
        name: `${it.id}: ${it.name} - $${it.price}`,
        value: it.description || 'No description',
        inline: false
      });
      if (it.image) embed.setImage(it.image);
    }
    return message.reply({ embeds: [embed] });
  }

  if (command === '!categories') {
    const list = Object.keys(store.cards);
    if (!list.length) return message.reply('No categories.');
    return message.reply('Categories: ' + list.join(', '));
  }

  if (command === '!sellers') {
    const embed = new EmbedBuilder().setColor(store.settings.embedColor).setTitle('Sellers');
    for (const s of Object.values(store.sellers)) {
      embed.addFields({ name: s.id, value: s.admin ? 'admin' : 'seller', inline: false });
    }
    return message.reply({ embeds: [embed] });
  }

  if (command === '!setimagechannel') {
    if (message.author.id !== store.settings.admin) return message.reply('Only admin can set this.');
    const channel = args[0];
    if (!channel) return message.reply('Usage: !setimagechannel <channelId>');
    store.settings.imageDumpChannel = channel;
    save();
    return message.reply('Image channel updated.');
  }

  if (command === '!settings') {
    if (message.author.id !== store.settings.admin) return message.reply('Only admin can update settings.');
    const [key, value] = args;
    if (!key || value === undefined) return message.reply('Usage: !settings <key> <value>');
    if (!(key in store.settings)) return message.reply('Unknown setting');
    store.settings[key] = value;
    save();
    return message.reply(`Setting ${key} updated.`);
  }

  if (command === '!claim') {
    const id = parseInt(args[0], 10);
    for (const cat of Object.keys(store.cards)) {
      const found = store.cards[cat].find(i => i.id === id);
      if (found) {
        store.claims.push({ id, claimer: message.author.id, seller: found.seller, price: found.price, paid: false });
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
    const rows = [];
    for (const c of userClaims) {
      embed.addFields({ name: `Item ${c.id}`, value: `Seller <@${c.seller}> - $${c.price} - ${c.paid ? 'PAID' : 'UNPAID'}` });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paid_${c.id}`).setLabel('Paid').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`unclaim_${c.id}`).setLabel('Unclaim').setStyle(ButtonStyle.Danger)
      );
      rows.push(row);
    }
    return message.reply({ embeds: [embed], components: rows.slice(0,5) });
  }

  if (command === '!reportpayment') {
    const id = parseInt(args[0], 10);
    const claim = store.claims.find(c => c.id === id && c.claimer === message.author.id);
    if (!claim) return message.reply('Claim not found');
    claim.paid = true;
    save();
    return message.reply('Payment recorded.');
  }

  if (command === '!unclaim') {
    const id = parseInt(args[0], 10);
    const idx = store.claims.findIndex(c => c.id === id && c.claimer === message.author.id);
    if (idx === -1) return message.reply('Claim not found');
    store.claims.splice(idx, 1);
    save();
    return message.reply('Claim removed.');
  }

  if (command === '!help') {
    return message.reply('Commands: !setup, !addcategory, !addcard, !deletecard <id>, !list <category>, !categories, !sellers, !claim <id>, !claims, !reportpayment <claimId>, !unclaim <claimId>, !setimagechannel, !settings');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  const [action, id] = interaction.customId.split('_');
  const claimId = parseInt(id, 10);
  const claim = store.claims.find(c => c.id === claimId && c.claimer === interaction.user.id);
  if (!claim) return interaction.reply({ content: 'Claim not found', ephemeral: true });
  if (action === 'paid') {
    claim.paid = true;
    save();
    return interaction.reply({ content: 'Marked as paid', ephemeral: true });
  }
  if (action === 'unclaim') {
    const idx = store.claims.indexOf(claim);
    store.claims.splice(idx, 1);
    save();
    return interaction.reply({ content: 'Unclaimed', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
