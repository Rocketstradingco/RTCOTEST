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
  res.send(`
    <h1>Admin Panel</h1>
    <form method="post" action="/admin/add-category?password=${ADMIN_PASSWORD}">
      <label>Category: <input name="category"/></label>
      <button type="submit">Add Category</button>
    </form>
    <form method="post" action="/admin/add-item?password=${ADMIN_PASSWORD}">
      <label>Category:<input name="category"/></label><br/>
      <label>Name:<input name="name"/></label><br/>
      <label>Description:<input name="description"/></label><br/>
      <label>Price:<input name="price" type="number" step="any"/></label><br/>
      <label>Image URL:<input name="image"/></label><br/>
      <button type="submit">Add Item</button>
    </form>
  `);
});

app.post('/admin/add-category', auth, (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).send('Category required');
  if (!store.items[category]) store.items[category] = [];
  save();
  res.send('Category added');
});

app.post('/admin/add-item', auth, (req, res) => {
  const { category, name, description, price, image } = req.body;
  if (!category || !name) return res.status(400).send('Category and name required');
  if (!store.items[category]) store.items[category] = [];
  store.items[category].push({ id: Date.now(), name, description, price, image });
  save();
  res.send('Item added');
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

