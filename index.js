const express = require('express');
const axios = require('axios');
const fs = require('fs');
const unzipper = require('unzipper');
const { spawn } = require('child_process');

const app = express();
app.use(express.json());

app.get('/', auth, async (req, res) => {
  const artifactId = req.query['artifactId'];
  if (!artifactId) {
    return res.status(400).send({ error: 'Artifact ID is required' });
  }

  const owner = process.env.OWNER;
  const repo = process.env.REPO;
  const token = process.env.GITHUB_TOKEN;

  try {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      responseType: 'stream'
    });

    const outputDir = './artifact';
    fs.mkdirSync(outputDir, { recursive: true });
    response.data.pipe(unzipper.Extract({ path: outputDir }));

    await new Promise(resolve => setTimeout(resolve, 5000)); // Adjust timeout as needed

    const cid = await addDirectoryToIpfs(outputDir);

    return res.send({ cid });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: 'Failed to process artifact' });
  }
});

async function addDirectoryToIpfs(directory) {
  return new Promise((resolve, reject) => {
    const ipfsCmd = spawn('ipfs', ['add', '--quieter', '-r', directory]);
    let cid;

    ipfsCmd.stdout.on('data', (data) => {
      cid = data.toString().trim();
      resolve(cid);
    });

    ipfsCmd.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      reject(new Error(`Failed to add directory to IPFS`));
    });

    ipfsCmd.on('close', (code) => {
      if (code !== 0 && !cid) {
        reject(new Error(`Failed to add directory to IPFS with code ${code}`));
      }
    });
  });
}

function auth(req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);
  if (token !== process.env.AUTH_TOKEN) {
    return res.status(401).send({ error: 'Unauthorized: Invalid token' });
  }

  next();
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));