const { Module } = require("../main");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const config = require("../config");
const MODE = config.MODE;
const fromMe = MODE === "public" ? false : true;

const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

// Helper function to fetch media as stream/buffer
async function getBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data);
}

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

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply(`_Searching & downloading *${query}*..._`);
      const apiUrl = `https://yta-api-9p2z.onrender.com/api/play?q=${encodeURIComponent(query)}`;
      const { data } = await axios.get(apiUrl);

      if (!data.status || !data.download_result?.result?.url) {
        return await message.edit("_Failed to download audio!_", message.jid, downloadMsg.key);
      }

      const audioUrl = data.download_result.result.url;
      const title = data.download_result.result.title || data.video_info?.title || "Audio";

      await message.edit(`_Sending *${title}*..._`, message.jid, downloadMsg.key);

      const audioBuffer = await getBuffer(audioUrl);
      await message.sendMessage({ stream: audioBuffer }, "audio", {
        mimetype: "audio/mp4",
        caption: `_*${title}*_`,
      });

      await message.edit(`_Downloaded *${title}*!_`, message.jid, downloadMsg.key);
    } catch (error) {
      console.error("Song error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
    }
  }
);

Module(
  {
    pattern: "ytv ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube video",
    usage: ".ytv <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .ytv https://youtu.be/xxxxx_"
      );
    }

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply("_Fetching video..._");
      const apiUrl = `https://jerrycoder.oggyapi.workers.dev/down/ytmp4-v1?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl);

      if (data.status !== "success" || !data.url) {
        return await message.edit("_Failed to fetch video link!_", message.jid, downloadMsg.key);
      }

      await message.edit(`_Downloading *${data.title}*..._`, message.jid, downloadMsg.key);

      const videoBuffer = await getBuffer(data.url);
      const size = videoBuffer.length;

      if (size > VIDEO_SIZE_LIMIT) {
        await message.sendMessage({ stream: videoBuffer }, "document", {
          fileName: `${data.title || "video"}.mp4`,
          mimetype: "video/mp4",
          caption: `_*${data.title}*_\n\n_File size: ${formatBytes(size)}_\n_Quality: ${data.quality || "720p"}_`,
        });
      } else {
        await message.sendReply({ stream: videoBuffer }, "video", {
          caption: `_*${data.title}*_\n\n_Quality: ${data.quality || "720p"}_`,
        });
      }

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
    } catch (error) {
      console.error("YTV error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Failed to download video. Check the link._");
      }
    }
  }
);

Module(
  {
    pattern: "video ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube video",
    usage: ".video <link>",
    use: "download",
  },
  async (message, match) => {
    let url = match[1] || message.reply_message?.text;

    if (url && /\bhttps?:\/\/\S+/gi.test(url)) {
      url = url.match(/\bhttps?:\/\/\S+/gi)[0];
    }

    if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
      return await message.sendReply(
        "_Please provide a valid YouTube link!_\n_Example: .video https://youtu.be/xxxxx_"
      );
    }

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply("_Downloading video..._");
      const apiUrl = `https://jerrycoder.oggyapi.workers.dev/down/ytmp4-v1?url=${encodeURIComponent(url)}`;
      const { data } = await axios.get(apiUrl);

      if (data.status !== "success" || !data.url) {
        return await message.edit("_Failed to download video!_", message.jid, downloadMsg.key);
      }

      await message.edit("_Uploading video..._", message.jid, downloadMsg.key);

      const videoBuffer = await getBuffer(data.url);
      const size = videoBuffer.length;

      if (size > VIDEO_SIZE_LIMIT) {
        await message.sendMessage({ stream: videoBuffer }, "document", {
          fileName: `${data.title || "video"}.mp4`,
          mimetype: "video/mp4",
          caption: `_*${data.title}*_\n\n_File size: ${formatBytes(size)}_`,
        });
      } else {
        await message.sendReply({ stream: videoBuffer }, "video", {
          caption: `_*${data.title}*_`,
        });
      }

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
    } catch (error) {
      console.error("Video error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
    }
  }
);

Module(
  {
    pattern: "yta ?(.*)",
    fromMe: fromMe,
    desc: "Download YouTube audio as document",
    usage: ".yta <link or query>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        "_Please provide a YouTube link or query!_\n_Example: .yta https://youtu.be/xxxxx_"
      );
    }

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply("_Downloading audio..._");
      const apiUrl = `https://yta-api-9p2z.onrender.com/api/play?q=${encodeURIComponent(input)}`;
      const { data } = await axios.get(apiUrl);

      if (!data.status || !data.download_result?.result?.url) {
        return await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      }

      const audioUrl = data.download_result.result.url;
      const title = data.download_result.result.title || data.video_info?.title || "Audio";

      await message.edit("_Sending document..._", message.jid, downloadMsg.key);

      const audioBuffer = await getBuffer(audioUrl);
      await message.sendMessage({ stream: audioBuffer }, "document", {
        fileName: `${title}.mp3`,
        mimetype: "audio/mp4",
        caption: `_*${title}*_`,
      });

      await message.edit("_Download complete!_", message.jid, downloadMsg.key);
    } catch (error) {
      console.error("YTA error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
    }
  }
);

Module(
  {
    pattern: "play ?(.*)",
    fromMe: fromMe,
    desc: "Play audio from YouTube search or link",
    usage: ".play <song name or link>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;
    if (!input) {
      return await message.sendReply(
        "_Please provide a song name or link!_\n_Example: .play faded alan walker_"
      );
    }

    let downloadMsg;
    try {
      downloadMsg = await message.sendReply("_Searching & Downloading..._");
      const apiUrl = `https://yta-api-9p2z.onrender.com/api/play?q=${encodeURIComponent(input)}`;
      const { data } = await axios.get(apiUrl);

      if (!data.status || !data.download_result?.result?.url) {
        return await message.edit("_Song not found!_", message.jid, downloadMsg.key);
      }

      const audioUrl = data.download_result.result.url;
      const title = data.download_result.result.title || data.video_info?.title || "Audio";

      await message.edit(`_Sending *${title}*..._`, message.jid, downloadMsg.key);

      const audioBuffer = await getBuffer(audioUrl);
      await message.sendReply({ stream: audioBuffer }, "audio", {
        mimetype: "audio/mp4",
      });

      await message.edit(`_Downloaded *${title}*!_`, message.jid, downloadMsg.key);
    } catch (error) {
      console.error("Play error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
    }
  }
);

Module(
  {
    pattern: "spotify ?(.*)",
    fromMe: fromMe,
    desc: "Search or Download audio from Spotify link/query",
    usage: ".spotify <spotify link or song name>",
    use: "download",
  },
  async (message, match) => {
    let input = match[1] || message.reply_message?.text;

    if (!input) {
      return await message.sendReply(
        "_Please provide a Spotify link or song name!_\n_Example: .spotify https://open.spotify.com/track/xxxxx_\n_Or: .spotify Humko Tere Bina_"
      );
    }

    let downloadMsg;
    try {
      let isLink = input.includes("spotify.com");
      let apiUrl;

      if (isLink) {
        if (/\bhttps?:\/\/\S+/gi.test(input)) {
          input = input.match(/\bhttps?:\/\/\S+/gi)[0];
        }
        apiUrl = `https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(input)}`;
      } else {
        apiUrl = `https://api.nexray.eu.cc/downloader/spotifyplay?q=${encodeURIComponent(input)}`;
      }

      downloadMsg = await message.sendReply("_Fetching Spotify audio..._");
      const { data } = await axios.get(apiUrl);

      if (!data.status || !data.result) {
        return await message.edit("_Failed to fetch Spotify track!_", message.jid, downloadMsg.key);
      }

      const { title, artist, url: downloadUrl, download_url } = data.result;
      const finalDownloadUrl = download_url || downloadUrl;

      if (!finalDownloadUrl) {
        return await message.edit("_Download URL not available!_", message.jid, downloadMsg.key);
      }

      await message.edit(
        `_Downloading *${title}* by *${artist}*..._`,
        message.jid,
        downloadMsg.key
      );

      const audioBuffer = await getBuffer(finalDownloadUrl);

      await message.edit("_Sending audio..._", message.jid, downloadMsg.key);

      await message.sendReply({ stream: audioBuffer }, "audio", {
        mimetype: "audio/mp4",
      });

      await message.edit(
        `_Downloaded *${title}*!_`,
        message.jid,
        downloadMsg.key
      );
    } catch (error) {
      console.error("Spotify error:", error);
      if (downloadMsg) {
        await message.edit("_Download failed!_", message.jid, downloadMsg.key);
      } else {
        await message.sendReply("_Download failed. Please try again._");
      }
    }
  }
);
