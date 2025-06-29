const express = require('express');
const bodyParser = require('body-parser');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json({ limit: '2mb' }));

app.post('/generate-batch', async (req, res) => {
  try {
    const { apiKey, batch } = req.body;
    let apiEndpoint = req.body.apiEndpoint || '';

    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).send('Batch must be a non-empty array of users');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).send('API key is required');
    }
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    const url = `${apiEndpoint}/users/track`;

    const payload = { attributes: batch };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    console.error('Error in /generate-batch:', err);
    res.status(500).send('Server error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});