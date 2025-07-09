require('dotenv').config();
const express = require('express');
const { store, save } = require('./dataStore');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_me';
const PORT = process.env.PORT || 3000;

function auth(req, res, next) {
  if (req.query.password !== ADMIN_PASSWORD) return res.status(401).send('Unauthorized');
  next();
}

app.get('/', (req, res) => {
  res.send('Discord Inventory Bot');
});

app.get('/admin', auth, (req, res) => {
  const cats = Object.keys(store.cards)
    .map(c => `<li>${c} (${store.cards[c].length} cards)</li>`)
    .join('');
  const sellerList = Object.values(store.sellers)
    .map(s => `<li>${s.id}${s.admin ? ' (admin)' : ''}</li>`) 
    .join('');
  res.send(`
    <h1>Admin Panel</h1>
    <h2>Categories</h2>
    <ul>${cats || '<li>None</li>'}</ul>
    <form method="post" action="/admin/add-category?password=${ADMIN_PASSWORD}">
      <label>Category: <input name="category"/></label>
      <button type="submit">Add Category</button>
    </form>
    <h2>Add Card</h2>
    <form method="post" action="/admin/add-card?password=${ADMIN_PASSWORD}">
      <label>Category:<input name="category"/></label><br/>
      <label>Name:<input name="name"/></label><br/>
      <label>Description:<input name="description"/></label><br/>
      <label>Price:<input name="price" type="number" step="any"/></label><br/>
      <label>Image URL:<input name="image"/></label><br/>
      <button type="submit">Add Card</button>
    </form>
    <h2>Sellers</h2>
    <ul>${sellerList || '<li>None</li>'}</ul>
    <h2>Settings</h2>
    <form method="post" action="/admin/update-setting?password=${ADMIN_PASSWORD}">
      <label>Key:<input name="key"/></label>
      <label>Value:<input name="value"/></label>
      <button type="submit">Update Setting</button>
    </form>
  `);
});

app.post('/admin/add-category', auth, (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).send('Category required');
  if (!store.cards[category]) store.cards[category] = [];
  save();
  res.send('Category added');
});

app.post('/admin/add-card', auth, (req, res) => {
  const { category, name, description, price, image } = req.body;
  if (!category || !name) return res.status(400).send('Category and name required');
  if (!store.cards[category]) store.cards[category] = [];
  store.cards[category].push({ id: Date.now(), name, description, price, image });
  save();
  res.send('Card added');
});

app.post('/admin/update-setting', auth, (req, res) => {
  const { key, value } = req.body;
  if (!(key in store.settings)) return res.status(400).send('Unknown setting');
  store.settings[key] = value;
  save();
  res.send('Setting updated');
});

app.get('/admin/debug', auth, (req, res) => {
  res.type('json').send(JSON.stringify(store, null, 2));
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

