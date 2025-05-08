const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://upappuswna0375g',
  credentials: true
}));

app.use(express.json());

// 🔥 UTIL: Extract cookie value from header
function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const target = cookies.find(c => c.startsWith(`${cookieName}=`));
  return target ? target.split('=')[1] : null;
}

// 🔐 JWT endpoint
app.post('/generate-jwt', async (req, res) => {
  try {
    // STEP 1 — Extract Qlik session cookie
    const cookieHeader = req.headers.cookie;
    //const sessionId = getCookieValue(cookieHeader, 'X-Qlik-Session-HTTP');
    const sessionId = "4d5cbc1c-7e23-4789-bbd1-3b1c9526d1f2"

    if (!sessionId) {
      return res.status(401).json({ error: 'Missing X-Qlik-Session cookie' });
    }

    // STEP 2 — Call Qlik Proxy Session API to get user info
    const qpsUrl = `http://upappuswna0375g/qps/session/${sessionId}`;

    const qpsRes = await fetch(qpsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `X-Qlik-Session=${sessionId}`
      }
    });

    if (!qpsRes.ok) {
      const errorText = await qpsRes.text();
      console.error('❌ QPS Error:', errorText);
      return res.status(401).json({ error: 'Invalid Qlik session' });
    }

    const qpsJson = await qpsRes.json();
    const userId = qpsJson?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in QPS response' });
    }

    console.log(`🔐 JWT requested by Qlik user: ${userId}`);

    // === Snowflake Config ===
    const snowflakeAccountURL = "nni_sandbox.us-east-1";
    const role = "DQ_POC_ROLE";
    const ENDPOINT = "jqamamim-novonordisk-nnisandbox.snowflakecomputing.app";
    const path = "generate_jwt";
    const PAT = process.env.SNOWFLAKE_PAT;

    const bodyParams = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: PAT,
      subject_token_type: "programmatic_access_token",
      scope: `session:role:${role} ${ENDPOINT}`
    });

    const tokenRes = await fetch(`https://${snowflakeAccountURL}.snowflakecomputing.com/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams.toString()
    });

    const accessToken = (await tokenRes.text()).trim();

    if (!accessToken) {
      return res.status(500).json({ error: 'Access token generation failed' });
    }

    const spcsRes = await fetch(`https://${ENDPOINT}/${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Snowflake Token="${accessToken}"`
      }
    });

    const spcsJson = await spcsRes.json();

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
