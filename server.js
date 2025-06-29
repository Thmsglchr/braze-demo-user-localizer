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
  // Fallback if rounding issue
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
    const apiKey = req.body.apiKey;
    const apiEndpoint = req.body.apiEndpoint;
    const config = req.body.config;
    const totalUsers = parseInt(req.body.totalUsers, 10) || 1;
    const idPrefix = req.body.idPrefix || "DEMO";

    const groups = config.groups;

    let users = [];
    for (let i = 1; i <= totalUsers; i++) {
      // Pick a group based on weights
      const group = pickWeightedGroup(groups);

      // Gender for random first name
      const gender = getGender();
      const firstName = gender === 'male'
        ? pickRandom(group.first_names_male)
        : pickRandom(group.first_names_female);

      // Compose full user profile
      users.push({
        external_id: idPrefix + i,
        country: group.country,
        language: group.language,
        time_zone: group.time_zone,
        home_city: pickRandom(group.cities),
        first_name: firstName,
        last_name: pickRandom(group.last_names),
        gender: gender
      });
    }

    // Braze endpoint
    const baseUrl = apiEndpoint.replace(/\/+$/, '');
    const url = `${baseUrl}/users/track`;

    // Set streaming headers
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const BATCH_SIZE = 75;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = users.slice(i, i + BATCH_SIZE);
      const payload = { attributes: batch };

      res.write(`Sending batch ${batchNum} (${batch.length} users)...\n`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();

      res.write(`Batch ${batchNum} response: ${text}\n\n`);

      // Throttle: Braze recommends at least ~75ms between requests; 150ms for safety
      await new Promise(r => setTimeout(r, 150));
    }

    res.write('✅ All batches processed!\n');
    res.end();
  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});