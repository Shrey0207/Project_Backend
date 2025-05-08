const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

// POST endpoint to generate JWT
app.post('/generate-jwt', async (req, res) => {
  try {
    // Get the userId and other necessary data from the request body
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId in request body' });
    }

    console.log(`🔐 JWT requested by user: ${userId}`);

    // === CONFIGURATION ===
    const snowflakeAccountURL = "nni_sandbox.us-east-1";
    const role = "DQ_POC_ROLE";
    const ENDPOINT = "jqamamim-novonordisk-nnisandbox.snowflakecomputing.app";
    const path = "generate_jwt";
    const PAT = process.env.SNOWFLAKE_PAT;

    // Step 1: Exchange PAT for access token
    const tokenUrl = `https://${snowflakeAccountURL}.snowflakecomputing.com/oauth/token`; // Replace with your token URL if needed

    if (!PAT) {
      console.error("❌ PAT is undefined");
      return res.status(500).json({ error: 'PAT missing' });
    }

    const bodyParams = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: PAT,
      subject_token_type: "programmatic_access_token",
      scope: `session:role:${role} ${ENDPOINT}`
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    const accessToken = (await tokenRes.text()).trim();
    console.log("Access token:", accessToken);

    if (!accessToken) {
      return res.status(500).json({ error: 'Access token generation failed' });
    }

    // Step 2: Call SPCS container endpoint to generate JWT
    const spcsUrl = `https://${ENDPOINT}/${path}`;
    const spcsRes = await fetch(spcsUrl, {
      method: "POST",
      headers: {
        "Authorization": `Snowflake Token="${accessToken}"`
      }
    });

    const spcsJson = await spcsRes.json();
    console.log("SPCS Raw Response:", spcsJson);

    // Extract JWT from the response
    if (spcsJson?.data && spcsJson.data[0] && spcsJson.data[0][1]) {
      const jwtToken = spcsJson.data[0][1];
      console.log("Generated JWT:", jwtToken);
      return res.json({ jwt: jwtToken });
    } else {
      return res.status(500).json({ error: 'Unexpected SPCS response format', spcsJson });
    }
  } catch (err) {
    console.error('Error in /generate-jwt:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
