const express = require('express');
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

    // Debug logs
    console.log('Braze endpoint:', url);
    console.log('Number of users to send:', users.length);

    // Send to Braze in batches of 75
    const BATCH_SIZE = 75;
    let allResponses = [];
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const payload = { attributes: batch };
      console.log(`Sending batch ${Math.floor(i/BATCH_SIZE)+1}:`, JSON.stringify(payload, null, 2).substring(0, 300) + ' ...');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      allResponses.push(`Batch ${Math.floor(i/BATCH_SIZE)+1}: ${text}`);
      // Throttle: Braze recommends at least ~75ms, here 150ms for safety
      await new Promise(r => setTimeout(r, 150));
    }

    res.status(200).send(allResponses.join('\n\n'));
  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).send('Error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});