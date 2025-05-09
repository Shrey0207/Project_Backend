const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const crypto = require('crypto');
const snowflake = require('snowflake-sdk');
require('dotenv').config();
const fs = require('fs');
// // Load and decode the base64 private key
// const privateKeyPem = Buffer.from(process.env.PRIVATE_KEY_BASE64, 'base64').toString('utf-8');

// // Create crypto key object
// const privateKey = crypto.createPrivateKey({
//   key: privateKeyPem,
//   format: 'pem',
//   passphrase: process.env.PRIVATE_KEY_PASSPHRASE,
// });

const privateKeyPath = path.join(__dirname, 'Private_Key.p8');

const privateKeyObject = crypto.createPrivateKey({
  key: fs.readFileSync(privateKeyPath, 'utf8'),
  format: 'pem',
  passphrase: process.env.PRIVATE_KEY_PASSPHRASE,
});

const privateKey = privateKeyObject.export({
  format: 'pem',
  type: 'pkcs8',
});


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://upappuswna0375g', // exact match, including protocol
  credentials: true
}));

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

        // Step 0: Validate userId in Snowflake
        const connection = snowflake.createConnection({
          account: process.env.SNOWFLAKE_ACCOUNT,
          username: process.env.SNOWFLAKE_USER,
          authenticator:'SNOWFLAKE_JWT',
          privateKey: privateKey,
          warehouse: process.env.SNOWFLAKE_WAREHOUSE,
          database: process.env.SNOWFLAKE_DATABASE,
          schema: process.env.SNOWFLAKE_SCHEMA,
          role: process.env.SNOWFLAKE_ROLE
        });

        await new Promise((resolve, reject) => {
          connection.connect((err) => {
            if (err) {
              console.error("❌ Snowflake connection error:", err);
              reject(err);
            } else {
              console.log("✅ Connected to Snowflake");
              resolve();
            }
          });
        });

        const validationQuery = `
        SELECT NAME 
        FROM ${process.env.SNOWFLAKE_TABLE}
        WHERE LOWER(NOVO_ID) = LOWER(?)
        LIMIT 1
      `;
  
      const result = await new Promise((resolve, reject) => {
        connection.execute({
          sqlText: validationQuery,
          binds: [userId],
          complete: function(err, stmt, rows) {
            if (err) {
              console.error("❌ Query error:", err);
              reject(err);
            } else {
              resolve(rows);
            }
          }
        });
      });
  
      if (!result || result.length === 0) {
        return res.status(403).json({ error: `Access denied: User ${userId} not allowed.` });
      }
  
      const userName = result[0].NAME;
      console.log(`✅ SPCS access granted to: ${userName}`);
  
    // Continue with PAT exchange and SPCS call...
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
