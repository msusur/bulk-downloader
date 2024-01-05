const fs = require('fs');
const axios = require('axios');
const cliProgress = require('cli-progress');
const path = require('path');

// Function to get the highest index from the files in the downloads folder
function getLatestFileIndex(downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath); // Create the directory if it doesn't exist
    return 0;
  }

  const files = fs.readdirSync(downloadPath);
  const indices = files.map(file => {
    const match = file.match(/^file_(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });

  return indices.length > 0 ? Math.max(...indices) + 1 : 0;
}


// Sleep function to introduce delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// Function to map MIME types to file extensions
function getExtensionFromMimeType(mimeType) {
  const mimeMap = {
    'video/mp4': 'mp4',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'application/zip': 'zip',
    'video/x-msvideo': 'AVI',
    'video/x-ms-wmv - Windo': 'Media',
    'video/mpeg': 'MPEG',
    'video/webm': 'WebM',
    'video/ogg': 'OGG',
    'video/3gpp': '3GP',
    'video/quicktime': 'MOV',
    'video/x-flv': 'FLV',
    'video/x-matroska': 'MKV',
    'video/x-m4v': 'm4v',
    // Add more MIME types and their corresponding extensions here
  };
  return mimeMap[mimeType] || 'txt'; // Default to .txt if MIME type is not in the map
}

// Function to download a file or create error file
async function downloadFile(url, outputPath, id, retryCount = 0, maxRetries = 5, timeout = 30000) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: timeout // Set timeout for the request
    });

    const mimeType = response.headers['content-type'];
    const extension = getExtensionFromMimeType(mimeType);
    const fileName = `file_${id}.${extension}`;
    const fullFilePath = `${outputPath}/${fileName}`;

    if (response.status === 200) {
      response.data.pipe(fs.createWriteStream(fullFilePath));
      return new Promise((resolve, reject) => {
        response.data.on('end', () => resolve());
        response.data.on('error', err => reject(err));
      });
    } else if (response.status === 404 || response.status === 500) {
      fs.writeFileSync(`${outputPath}/${id}:${response.status}`, '');
    }
  } catch (error) {
    if (error.response && (error.response.status === 404 || error.response.status === 500)) {
      fs.writeFileSync(`${outputPath}/${id}:${error.response.status}`, '');
    } else if ((error.code === 'ECONNABORTED' || error.code === 'ECONNRESET') && retryCount < maxRetries) {
      // Handle timeout or ECONNRESET
      console.error(`\nRetry ${retryCount + 1}/${maxRetries} for ${url} due to ${error.code}`);
      return downloadFile(url, outputPath, id, retryCount + 1, maxRetries, timeout);
    } else {
      console.error(`\nError downloading ${id}: ${error}`);
    }
  }
}

// Main async function to handle downloads
async function main() {
  const urls = fs.readFileSync('urls.txt', 'utf8').split('\n');
  const outputPath = 'downloads';
  let currentIndex = getLatestFileIndex(outputPath);
  const delayBetweenBatches = 5000; // Delay in milliseconds, adjust as needed
  const chunkSize = 3;

  console.log(`\n Starting from ${currentIndex}`);

  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(urls.length, 0);

  while (currentIndex < urls.length) {
    const chunk = urls.slice(currentIndex, currentIndex + chunkSize);
    await Promise.all(chunk.map((url, index) => {
      const id = currentIndex + index;
      return downloadFile(url, outputPath, id).then(() => progressBar.increment());
    }));
    currentIndex += chunkSize;

    // Wait for a while before starting the next batch
    await sleep(delayBetweenBatches);
  }

  progressBar.stop();
}

main().catch(console.error);