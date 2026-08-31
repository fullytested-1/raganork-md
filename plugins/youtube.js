const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function sanitizeFilename(name) {
  const clean = (name || "download")
    .toString()
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 100);
  return clean || "download";
}

function tempPath(ext) {
  return path.join(
    os.tmpdir(),
    `yt_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`
  );
}

async function downloadFile(url, destPath) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return destPath;
}

function extractYoutubeUrl(text) {
  if (!text) return null;
  const found = text.match(/\bhttps?:\/\/\S+/gi);
  if (!found) return null;
  let url = found[0];
  if (!url.includes("youtube.com") && !url.includes("youtu.be")) return null;

  if (url.includes("youtube.com/shorts/")) {
    const shortId = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]+)/)?.[1];
    if (shortId) url = `https://www.youtube.com/watch?v=${shortId}`;
  }
  return url;
}

async function cleanup(filePath) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// API wrappers
// ---------------------------------------------------------------------------

async function ytmp4Download(url) {
  const { data } = await axios.get(
    "https://jerrycoder.oggyapi.workers.dev/down/ytmp4-v1",
    { params: { url } }
  );
  if (!data || data.status !== "success" || !data.url) {
    throw new Error("YT video API returned no result");
  }
  return data;
}

async function ytaPlay(query) {
  const { data } = await axios.get(
    "https://yta-api-9p2z.onrender.com/api/play",
    { params: { q: query } }
  );
  if (!data || data.status !== true || !data.download_result?.result?.url) {
    throw new Error("YT audio API returned no result");
  }
  return data;
}

async function spotifyDownload(url) {
  const { data } = await axios.get(
    "https://api.nexray.eu.cc/downloader/spotify",
    { params: { url } }
  );
  if (!data || data.status !== true || !data.result?.url) {
    throw new Error("Spotify link API returned no result");
  }
  return data;
}

async function spotifySearchDownload(query) {
  const { data } = await axios.get(
    "https://api.nexray.eu.cc/downloader/spotifyplay",
    { params: { q: query } }
  );
  if (!data || data.status !== true || !data.result?.download_url) {
    throw new Error("Spotify search API returned no result");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Shared flows
// ---------------------------------------------------------------------------

async function handleVideoDownload(message, url) {
  let downloadMsg;
  let videoPath;

  try {
    downloadMsg = await message.sendReply(
      "_📥 Fetching & downloading video..._"
    );

    const info = await ytmp4Download(url);
    videoPath = tempPath("mp4");
    await downloadFile(info.url, videoPath);

    await message.edit("_Uploading video..._", message.jid, downloadMsg.key);

    const stats = fs.statSync(videoPath);
    const title = info.title || "video";

    if (stats.size > VIDEO_SIZE_LIMIT) {
      const stream = fs.createReadStream(videoPath);
      await message.sendMessage({ stream }, "document", {
        fileName: `${sanitizeFilename(title)}.mp4`,
        mimetype: "video/mp4",
        caption: `_*${title}*_\n\n_File size: ${formatBytes(
          stats.size
        )}_\n_Quality: ${info.quality || "N/A"}_`,
      });
      stream.destroy();
    } else {
      const stream = fs.createReadStream(videoPath);
      await message.sendReply({ stream }, "video", {
        caption: `_*${title}*_\n\n_Quality: ${info.quality || "N/A"}_`,
      });
      stream.destroy();
    }

    await message.edit("_Download complete!_", message.jid, downloadMsg.key);
  } catch (error) {
    console.error("Video download error:", error);
    if (downloadMsg) {
      await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    } else {
      await message.sendReply("_Download failed. Please try again._");
    }
  } finally {
    await cleanup(videoPath);
  }
}

async function handleAudioSearch(message, query) {
  let downloadMsg;
  let audioPath;

  try {
    downloadMsg = await message.sendReply(
      "_🔎 Searching & downloading audio..._"
    );

    const data = await ytaPlay(query);
    const title =
      data.video_info?.title ||
      data.download_result?.result?.title ||
      query;
    const mp3Url = data.download_result.result.url;

    audioPath = tempPath("mp3");
    await downloadFile(mp3Url, audioPath);

    await message.edit(
      `_Sending *${title}*..._`,
      message.jid,
      downloadMsg.key
    );

    const stream = fs.createReadStream(audioPath);
    await message.sendReply({ stream }, "audio", {
      mimetype: "audio/mpeg",
      fileName: `${sanitizeFilename(title)}.mp3`,
    });
    stream.destroy();

    await message.edit(
      `_Downloaded *${title}*!_`,
      message.jid,
      downloadMsg.key
    );
  } catch (error) {
    console.error("Audio search error:", error);
    if (downloadMsg) {
      await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    } else {
      await message.sendReply("_Download failed. Please try again._");
    }
  } finally {
    await cleanup(audioPath);
  }
}

async function handleSpotifyLink(message, url) {
  let downloadMsg;
  let audioPath;

  try {
    downloadMsg = await message.sendReply("_Fetching Spotify track..._");

    const data = await spotifyDownload(url);
    const { title, artist } = data.result;

    await message.edit(
      `_Downloading *${title}* by *${artist}*..._`,
      message.jid,
      downloadMsg.key
    );

    audioPath = tempPath("mp3");
    await downloadFile(data.result.url, audioPath);

    await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

    const stream = fs.createReadStream(audioPath);
    await message.sendReply({ stream }, "audio", {
      mimetype: "audio/mpeg",
      fileName: `${sanitizeFilename(title)}.mp3`,
    });
    stream.destroy();

    await message.edit("_Download complete!_", message.jid, downloadMsg.key);
  } catch (error) {
    console.error("Spotify link download error:", error);
    if (downloadMsg) {
      await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    } else {
      await message.sendReply("_Download failed. Please try again._");
    }
  } finally {
    await cleanup(audioPath);
  }
}

async function handleSpotifySearch(message, query) {
  let downloadMsg;
  let audioPath;

  try {
    downloadMsg = await message.sendReply("_🔎 Searching Spotify..._");

    const data = await spotifySearchDownload(query);
    const r = data.result;

    await message.edit(
      `_Downloading *${r.title}* by *${r.artist}*..._`,
      message.jid,
      downloadMsg.key
    );

    audioPath = tempPath("mp3");
    await downloadFile(r.download_url, audioPath);

    await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

    const stream = fs.createReadStream(audioPath);
    await message.sendReply({ stream }, "audio", {
      mimetype: "audio/mpeg",
      fileName: `${sanitizeFilename(r.title)}.mp3`,
    });
    stream.destroy();

    await message.edit(
      `_Downloaded *${r.title}*!_`,
      message.jid,
      downloadMsg.key
    );
  } catch (error) {
    console.error("Spotify search download error:", error);
    if (downloadMsg) {
      await message.edit("_Download failed!_", message.jid, downloadMsg.key);
    } else {
      await message.sendReply("_Download failed. Please try again._");
    }
  } finally {
    await cleanup(audioPath);
  }
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

Module(
  {
    pattern: "ytv ?(.*)",
    fromMe: fromMe,
    desc: "Download a YouTube video",
    usage: ".ytv <link>",
    use: "download",
  },
  async (message, match) => {
    const raw = match[1] || message.reply_message?.text;
    const url = extractYoutubeUrl(raw);

    if (!url) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .ytv https://youtube.com/watch?v=xxxxx or https://youtube.com/shorts/xxxxx_"
      );
    }

    await handleVideoDownload(message, url);
  }
);

Module(
  {
    pattern: "video ?(.*)",
    fromMe: fromMe,
    desc: "Download a YouTube video",
    usage: ".video <link>",
    use: "download",
  },
  async (message, match) => {
    const raw = match[1] || message.reply_message?.text;
    const url = extractYoutubeUrl(raw);

    if (!url) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .video https://youtube.com/watch?v=xxxxx or https://youtube.com/shorts/xxxxx_"
      );
    }

    await handleVideoDownload(message, url);
  }
);

Module(
  {
    pattern: "song ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube and download audio",
    usage: ".song <query>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1] || message.reply_message?.text;
    if (!query) {
      return await message.sendReply(
        "_Please provide a search query!_\n_Example: .song faded alan walker_"
      );
    }
    await handleAudioSearch(message, query);
  }
);

Module(
  {
    pattern: "play ?(.*)",
    fromMe: fromMe,
    desc: "Search and play audio from YouTube",
    usage: ".play <song name>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1] || message.reply_message?.text;
    if (!query) {
      return await message.sendReply(
        "_Please provide a song name!_\n_Example: .play faded alan walker_"
      );
    }
    await handleAudioSearch(message, query);
  }
);

Module(
  {
    pattern: "yta ?(.*)",
    fromMe: fromMe,
    desc: "Search and download YouTube audio",
    usage: ".yta <query>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1] || message.reply_message?.text;
    if (!query) {
      return await message.sendReply(
        "_Please provide a search query!_\n_Example: .yta faded alan walker_"
      );
    }
    await handleAudioSearch(message, query);
  }
);

Module(
  {
    pattern: "yts ?(.*)",
    fromMe: fromMe,
    desc: "Search YouTube with detailed info",
    usage: ".yts <query>",
    use: "download",
  },
  async (message, match) => {
    const query = match[1];
    if (!query) {
      return await message.sendReply(
        "_Please provide a search query!_\n_Example: .yts ncs music_"
      );
    }

    try {
      const searchMsg = await message.sendReply("_Searching YouTube..._");
      const data = await ytaPlay(query);
      const info = data.video_info;
      const mp3Url = data.download_result.result.url;

      let caption = `_*${info.title}*_\n\n`;
      caption += `*Channel:* ${info.author || "N/A"}\n`;
      caption += `*Duration:* \`${info.duration || "N/A"}\`\n\n`;
      caption += `*URL:* ${info.url}\n`;
      caption += `*Audio URL:* ${mp3Url}\n\n`;
      caption += "_Reply with:_\n";
      caption += "*1.* Audio\n";
      caption += "*2.* Video";

      if (info.thumbnail) {
        try {
          const thumbResponse = await axios.get(info.thumbnail, {
            responseType: "arraybuffer",
          });
          const thumbnailBuffer = Buffer.from(thumbResponse.data);
          await message.sendReply(thumbnailBuffer, "image", { caption });
          return;
        } catch (e) {
          // if thumbnail fetch fails, fall back to plain text below
        }
      }

      await message.edit(caption, message.jid, searchMsg.key);
    } catch (error) {
      console.error("YTS search error:", error);
      await message.sendReply("_Search failed. Please try again later._");
    }
  }
);

// Handles the "Reply with: 1. Audio / 2. Video" flow from .yts
Module(
  {
    on: "text",
    fromMe: fromMe,
  },
  async (message) => {
    const numberMatch = message.text?.match(/^\d+$/);
    if (!numberMatch) return;
    const selectedNumber = parseInt(numberMatch[0]);

    if (
      !message.reply_message ||
      !message.reply_message.fromMe ||
      !message.reply_message.message
    ) {
      return;
    }

    const repliedText = message.reply_message.message;

    if (
      repliedText.includes("Reply with:") &&
      repliedText.includes("* Audio") &&
      repliedText.includes("* Video")
    ) {
      if (selectedNumber !== 1 && selectedNumber !== 2) {
        return await message.sendReply(
          "_Please select 1 for Audio or 2 for Video_"
        );
      }

      const urlMatch = repliedText.match(/\*URL:\*\s*(\S+)/);
      const audioUrlMatch = repliedText.match(/\*Audio URL:\*\s*(\S+)/);
      const titleMatch = repliedText.match(/_\*([^*]+)\*_/);
      const title = titleMatch ? titleMatch[1] : "audio";

      if (selectedNumber === 1) {
        if (!audioUrlMatch) return;

        let downloadMsg;
        let audioPath;
        try {
          downloadMsg = await message.sendReply("_Downloading audio..._");
          audioPath = tempPath("mp3");
          await downloadFile(audioUrlMatch[1], audioPath);

          await message.edit(
            "_Sending audio..._",
            message.jid,
            downloadMsg.key
          );

          const stream = fs.createReadStream(audioPath);
          await message.sendReply({ stream }, "audio", {
            mimetype: "audio/mpeg",
            fileName: `${sanitizeFilename(title)}.mp3`,
          });
          stream.destroy();

          await message.edit(
            "_Download complete!_",
            message.jid,
            downloadMsg.key
          );
        } catch (error) {
          console.error("YTS audio download error:", error);
          if (downloadMsg) {
            await message.edit(
              "_Download failed!_",
              message.jid,
              downloadMsg.key
            );
          }
        } finally {
          await cleanup(audioPath);
        }
      } else {
        if (!urlMatch) return;
        await handleVideoDownload(message, urlMatch[1]);
      }
    }
  }
);

Module(
  {
    pattern: "spotify ?(.*)",
    fromMe: fromMe,
    desc: "Search or download audio from Spotify",
    usage: ".spotify <spotify link or song name>",
    use: "download",
  },
  async (message, match) => {
    const input = match[1] || message.reply_message?.text;

    if (!input) {
      return await message.sendReply(
        "_Please provide a Spotify link or a song name!_\n_Example: .spotify Humko Tera Bina_\n_Example: .spotify https://open.spotify.com/track/xxxxx_"
      );
    }

    if (input.includes("spotify.com") && input.includes("/track/")) {
      const urlMatch = input.match(/\bhttps?:\/\/\S+/gi);
      const url = urlMatch ? urlMatch[0] : input;
      await handleSpotifyLink(message, url);
    } else {
      await handleSpotifySearch(message, input);
    }
  }
);
