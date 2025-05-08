const express = require('express');
const fetch = require('node-fetch'); // if using Node 18+, native fetch is available
const cors = require('cors');
require('dotenv').config(); // Optional: to load secrets from .env

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://your-qlik-mashup-domain', // Replace with your actual mashup origin
  credentials: true
}));
app.use(express.json());

// Endpoint to return final JWT from SPCS
app.get('/get_jwt', async (req, res) => {
  try {
    // === CONFIGURATION ===
    const snowflakeAccountURL = "nni_sandbox.us-east-1";
    const role = "DQ_POC_ROLE";
    const ENDPOINT = "fsamamim-novonordisk-nnisandbox.snowflakecomputing.app";
    const path = "generate_jwt";

    const PAT = process.env.SNOWFLAKE_PAT; // Move your PAT to a .env file

    // === Step 1: Exchange PAT for access token ===
    const tokenUrl = `https://${snowflakeAccountURL}.snowflakecomputing.com/oauth/token`;
    const tokenBody = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: PAT,
      subject_token_type: "programmatic_access_token",
      scope: `session:role:${role} ${ENDPOINT}`
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString()
    });

    const tokenJson = await tokenRes.json();

    if (!tokenJson.access_token) {
      return res.status(500).json({ error: 'Failed to get access token', details: tokenJson });
    }

    const accessToken = tokenJson.access_token;

    // === Step 2: Call SPCS JWT Generator ===
    const spcsUrl = `https://${ENDPOINT}/${path}`;
    const spcsRes = await fetch(spcsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Snowflake Token="${accessToken}"`
      }
    });

    const spcsJson = await spcsRes.json();

    // Extract JWT from response
    if (spcsJson?.data?.[0]?.[1]) {
      const jwt = spcsJson.data[0][1];
      return res.json({ jwt });
    } else {
      return res.status(500).json({ error: 'Unexpected SPCS response format', spcsJson });
    }

  } catch (err) {
    console.error('Error in /get_jwt:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
