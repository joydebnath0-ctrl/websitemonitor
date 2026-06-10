const express = require('express');
const app = express();
app.get('/', (req, res) => {
  res.send('<h1>Admin Panel</h1>');
});
app.listen(5000, () => console.log('Admin listening on port 5000'));
