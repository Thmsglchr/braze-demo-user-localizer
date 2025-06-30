const express = require('express');
const bodyParser = require('body-parser');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.static('public'));
app.use(bodyParser.json({ limit: '2mb' })); // 2MB to match Braze max

function pickWeightedGroup(groups) {
  const r = Math.random();
  let sum = 0;
  for (const g of groups) {
    sum += Number(g.weight);
    if (r < sum) return g;
  }
  // fallback if rounding errors
  return groups[groups.length - 1];
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGender() {
  return Math.random() < 0.5 ? 'male' : 'female';
}

app.post('/generate-and-upload', async (req, res) => {
  try {
    const { apiKey, apiEndpoint, config, totalUsers, idPrefix } = req.body;

    if (!apiKey || !apiEndpoint || !config || !config.groups) {
      res.status(400).send('Missing required parameters');
      return;
    }

    const groups = config.groups;
    const userCount = Math.min(parseInt(totalUsers, 10) || 1, 10000);
    const prefix = idPrefix || 'DEMO';

    // Generate user profiles
    function normalizeForEmail(str) {
      return str
        .toLowerCase()
        .normalize("NFD") // decompose accents
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[^a-z0-9]/g, ""); // remove non-alphanumeric chars
    }

    const users = [];
    for (let i = 1; i <= userCount; i++) {
      const group = pickWeightedGroup(groups);
      const gender = getGender();
      const firstName =
        gender === 'male'
          ? pickRandom(group.first_names_male)
          : pickRandom(group.first_names_female);
      const lastName = pickRandom(group.last_names);

      const email = `${normalizeForEmail(firstName)}.${normalizeForEmail(lastName)}@braze-demo.com`;

      users.push({
        external_id: prefix + i,
        country: group.country,
        language: group.language,
        time_zone: group.time_zone,
        home_city: pickRandom(group.cities),
        first_name: firstName,
        last_name: lastName,
        email: email,
        gender,
      });
    }

    const baseUrl = apiEndpoint.replace(/\/+$/, '');
    const url = `${baseUrl}/users/track`;

    // Send batches synchronously and accumulate responses
    const BATCH_SIZE = 75;
    let allResponses = [];

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
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
      allResponses.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${text}`);

      // Respect Braze rate limits: pause 150ms between batches
      await new Promise((r) => setTimeout(r, 150));
    }

    res.status(200).send(allResponses.join('\n\n'));
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});