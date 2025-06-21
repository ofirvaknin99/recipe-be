
import express, { Application, Request as ExpressRequest, Response as ExpressResponse, json, urlencoded } from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const app: Application = express(); // Use imported Application type
const port = process.env.PORT || 3001;

app.use(cors());
app.use(json()); // Corrected: Use named import 'json'
app.use(urlencoded({ extended: true })); // Corrected: Use named import 'urlencoded'

interface ReelData {
  title: string;
  description: string;
  creatorUsername?: string;
  thumbnailUrl: string;
  originalLink: string;
}

interface ReelDataResponse {
  success: boolean;
  data?: ReelData;
  message?: string;
}

// --- IMPORTANT ---
// This implementation requires yt-dlp to be installed and accessible in your system's PATH.
// Download and install yt-dlp from: https://github.com/yt-dlp/yt-dlp#installation
// -----------------
const fetchReelDataWithYtDlp = async (reelUrl: string): Promise<ReelData> => {
  if (!reelUrl || !reelUrl.includes("instagram.com/reel/")) {
    throw new Error("Invalid Instagram Reel URL format.");
  }

  const command = `yt-dlp --dump-single-json --no-warnings --no-call-home "${reelUrl}"`;

  console.log(`[Server] Executing yt-dlp command: ${command}`);

  try {
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.warn(`[Server] yt-dlp stderr: ${stderr}`);
    }

    if (!stdout) {
      throw new Error("yt-dlp did not return any data (stdout was empty).");
    }

    const jsonData = JSON.parse(stdout);

    const title = jsonData.title ||
                  (jsonData.description ? jsonData.description.split('\n')[0].substring(0, 100) : 'Untitled Reel') ||
                  'Untitled Instagram Reel';
    const description = jsonData.description || 'No description available.';
    // Only use jsonData.uploader for creatorUsername if available, otherwise it remains undefined.
    const creatorUsername = jsonData.uploader; 
    const thumbnailUrl = jsonData.thumbnail || `https://picsum.photos/seed/${jsonData.id || 'default'}/400/300`;

    return {
      title,
      description,
      creatorUsername, // This will be undefined if jsonData.uploader is not present
      thumbnailUrl,
      originalLink: reelUrl,
    };
  } catch (error: any) {
    console.error(`[Server] Error executing yt-dlp or parsing output for URL: ${reelUrl}`, error);
    if (error.message && error.message.includes('command not found')) {
        throw new Error("yt-dlp command not found. Please ensure yt-dlp is installed and in your system PATH.");
    }
    throw new Error(`Failed to fetch data using yt-dlp. yt-dlp error: ${error.message || 'Unknown error'}`);
  }
};

interface ExtractReelDataQuery {
    url?: string;
}

// Basic root endpoint for health checks
app.get('/', (req: ExpressRequest, res: ExpressResponse) => { // Use aliased types
  res.status(200).json({ success: true, message: 'Backend server is healthy and running!' });
});

app.get('/api/extract-reel-data', async (
  req: ExpressRequest<{}, any, any, ExtractReelDataQuery>, // Use aliased ExpressRequest
  res: ExpressResponse<ReelDataResponse> // Use aliased ExpressResponse
) => {
  const reelUrl = req.query.url; 

  if (!reelUrl) {
    return res.status(400).json({ success: false, message: 'Instagram Reel URL is required.' }); 
  }

  console.log(`[Server] Received request for Reel URL: ${reelUrl}`);

  try {
    const data = await fetchReelDataWithYtDlp(reelUrl);
    console.log(`[Server] Successfully fetched data with yt-dlp for: ${reelUrl}`);
    return res.json({ success: true, data }); 

  } catch (error) {
    console.error('[Server] Error processing reel data request:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred while fetching reel data.';
    if (message.startsWith("yt-dlp command not found") || message.startsWith("Failed to fetch data using yt-dlp")) {
        return res.status(500).json({ success: false, message }); 
    }
    return res.status(500).json({ success: false, message: 'Server error processing request.' }); 
  }
});

app.listen(port, () => {
  console.log(`[Server] Backend server running at http://localhost:${port}`);
  console.log(`[Server] Root endpoint for health check available at GET /`);
  console.log(`[Server] IMPORTANT: Ensure yt-dlp is installed and in your system PATH for local dev (Docker handles this in deployment).`);
  console.log(`[Server] Installation guide: https://github.com/yt-dlp/yt-dlp#installation`);
});
