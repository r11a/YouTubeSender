const API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_CATEGORIES = { "1": "קולנוע ואנימציה", "2": "רכב", "10": "מוזיקה", "15": "בעלי חיים", "17": "ספורט", "19": "טיולים ואירועים", "20": "גיימינג", "22": "אנשים ובלוגים", "23": "קומדיה", "24": "בידור", "25": "חדשות", "26": "סגנון והדרכה", "27": "חינוך", "28": "מדע וטכנולוגיה" };
const COUNTRY_PATTERNS = [
  ["אלבניה", /\b(albania|albanian|tirana|berat|osum|gjirokast[eë]r|shkod[eë]r|sarand[eë])\b|אלבניה/i],
  ["מונטנגרו", /\b(montenegro|montenegrin|kotor|budva|virpazar|skadar|durmitor|podgorica)\b|מונטנגרו/i],
  ["יוון", /\b(greece|greek|athens|santorini|crete|mykonos|corfu|rhodes)\b|יוון/i],
  ["איטליה", /\b(italy|italian|rome|venice|florence|tuscany|sicily|milan|naples)\b|איטליה/i],
  ["קרואטיה", /\b(croatia|croatian|dubrovnik|split|zadar|plitvice|zagreb)\b|קרואטיה/i],
  ["בוסניה והרצגובינה", /\b(bosnia|herzegovina|sarajevo|mostar)\b|בוסניה/i],
  ["סרביה", /\b(serbia|serbian|belgrade|novi sad)\b|סרביה/i],
  ["צפון מקדוניה", /\b(north macedonia|macedonia|skopje|ohrid)\b|מקדוניה/i],
  ["קוסובו", /\b(kosovo|pristina|prizren)\b|קוסובו/i],
  ["סלובניה", /\b(slovenia|slovenian|ljubljana|bled)\b|סלובניה/i],
  ["רומניה", /\b(romania|romanian|bucharest|transylvania|brasov)\b|רומניה/i],
  ["בולגריה", /\b(bulgaria|bulgarian|sofia|plovdiv|varna)\b|בולגריה/i],
  ["טורקיה", /\b(turkey|türkiye|turkish|istanbul|antalya|cappadocia|izmir)\b|טורקיה/i],
  ["גאורגיה", /\b(georgia|georgian|tbilisi|batumi|kazbegi)\b|גאורגיה/i],
  ["ישראל", /\b(israel|jerusalem|tel aviv|haifa|eilat|dead sea)\b|ישראל/i],
  ["פורטוגל", /\b(portugal|portuguese|lisbon|porto|madeira|algarve)\b|פורטוגל/i],
  ["ספרד", /\b(spain|spanish|madrid|barcelona|andalusia|mallorca|canary)\b|ספרד/i],
  ["צרפת", /\b(france|french|paris|provence|normandy|riviera)\b|צרפת/i],
  ["אוסטריה", /\b(austria|austrian|vienna|salzburg|tyrol|hallstatt)\b|אוסטריה/i],
  ["שווייץ", /\b(switzerland|swiss|zurich|geneva|interlaken|lauterbrunnen)\b|שווייץ/i]
];

export function inferVideoFolder(video) {
  const haystack = `${video.snippet?.title || video.title || ""} ${video.snippet?.description || video.description || ""} ${(video.snippet?.tags || video.tags || []).join(" ")}`;
  const country = COUNTRY_PATTERNS.find(([, pattern]) => pattern.test(haystack));
  if (country) return { folder: country[0], source: "country" };
  const categoryId = video.snippet?.categoryId || video.youtubeCategoryId || "";
  return { folder: YOUTUBE_CATEGORIES[categoryId] || "כללי", source: "category" };
}

function durationSeconds(iso = "PT0S") {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return Number(match?.[1] || 0) * 3600 + Number(match?.[2] || 0) * 60 + Number(match?.[3] || 0);
}

async function call(endpoint, params, apiKey) {
  const url = new URL(`${API}/${endpoint}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `YouTube API ${response.status}`);
  return payload;
}

function parseChannelInput(input) {
  const value = input.trim();
  const idMatch = value.match(/(?:channel\/)?(UC[\w-]{20,})/);
  if (idMatch) return { id: idMatch[1] };
  const handleMatch = value.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (handleMatch) return { forHandle: handleMatch[1] };
  if (value.startsWith("@")) return { forHandle: value.slice(1) };
  return { forHandle: value };
}

export async function resolveChannel(input, apiKey) {
  if (!apiKey) throw new Error("יש להגדיר YouTube API Key");
  const payload = await call("channels", { part: "snippet,contentDetails,statistics", ...parseChannelInput(input) }, apiKey);
  const channel = payload.items?.[0];
  if (!channel) throw new Error("הערוץ לא נמצא");
  return {
    youtubeId: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    thumbnail: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
    subscriberCount: Number(channel.statistics?.subscriberCount || 0),
    viewCount: Number(channel.statistics?.viewCount || 0),
    videoCount: Number(channel.statistics?.videoCount || 0),
    input
  };
}

export async function testYouTubeConnection(apiKey) {
  if (!apiKey) throw new Error("YouTube API Key לא הוגדר");
  await call("videos", { part: "id", id: "dQw4w9WgXcQ" }, apiKey);
  return { ok: true, service: "youtube", message: "YouTube Data API זמין" };
}

export async function syncChannel(store, channel, apiKey) {
  const startedAt = new Date().toISOString();
  const playlistItems = [];
  let pageToken = "";
  do {
    const page = await call("playlistItems", { part: "snippet,contentDetails", playlistId: channel.uploadsPlaylistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) }, apiKey);
    playlistItems.push(...(page.items || [])); pageToken = page.nextPageToken || "";
  } while (pageToken);

  const videoIds = playlistItems.map((item) => item.contentDetails.videoId);
  const details = [];
  for (let index = 0; index < videoIds.length; index += 50) {
    const page = await call("videos", { part: "snippet,contentDetails,statistics,status", id: videoIds.slice(index, index + 50).join(",") }, apiKey);
    details.push(...(page.items || []));
  }
  let discovered = 0;
  for (const video of details) {
    const current = store.data.videos.find((item) => item.youtubeId === video.id);
    const inferredFolder = inferVideoFolder(video);
    const values = {
      channelId: channel.id, youtubeId: video.id, title: video.snippet.title, description: video.snippet.description,
      thumbnail: video.snippet.thumbnails?.maxres?.url || video.snippet.thumbnails?.high?.url,
      publishedAt: video.snippet.publishedAt, duration: video.contentDetails.duration,
      privacyStatus: video.status?.privacyStatus || "public", viewCount: Number(video.statistics?.viewCount || 0),
      likeCount: Number(video.statistics?.likeCount || 0), commentCount: Number(video.statistics?.commentCount || 0),
      url: `https://www.youtube.com/watch?v=${video.id}`, lastSyncedAt: startedAt,
      distributionStatus: current?.distributionStatus || "new",
      contentType: current?.contentType || (/\b#shorts?\b/i.test(`${video.snippet.title} ${video.snippet.description}`) || durationSeconds(video.contentDetails.duration) <= 180 ? "short" : "standard"),
      youtubeCategoryId: video.snippet.categoryId || "",
      folder: current?.folderSource === "manual" ? current.folder : inferredFolder.folder,
      folderSource: current?.folderSource === "manual" ? "manual" : inferredFolder.source,
      tags: video.snippet.tags || []
    };
    if (current) {
      if (values.commentCount > (current.commentCount || 0)) store.data.notifications.unshift({ id: `note_${Date.now()}_${video.id}`, type: "comments", title: "תגובות חדשות", message: `${values.commentCount - (current.commentCount || 0)} תגובות חדשות ב־${video.snippet.title}`, videoId: current.id, createdAt: startedAt, read: false });
      Object.assign(current, values, { updatedAt: startedAt });
    } else { await store.create("videos", "vid", values); discovered += 1; }
  }
  const freshChannel = await resolveChannel(channel.youtubeId, apiKey);
  if (freshChannel.subscriberCount > (channel.subscriberCount || 0)) store.data.notifications.unshift({ id: `note_${Date.now()}_subs`, type: "subscribers", title: "הערוץ גדל", message: `נוספו ${freshChannel.subscriberCount - (channel.subscriberCount || 0)} עוקבים מאז הסנכרון הקודם`, createdAt: startedAt, read: false });
  Object.assign(channel, freshChannel, { lastSyncedAt: startedAt, updatedAt: startedAt });
  store.data.analyticsSnapshots.push({
    id: `snap_${Date.now()}_${channel.id}`, channelId: channel.id, capturedAt: startedAt,
    subscriberCount: freshChannel.subscriberCount, viewCount: freshChannel.viewCount,
    videoCount: freshChannel.videoCount, commentCount: details.reduce((sum, item) => sum + Number(item.statistics?.commentCount || 0), 0)
  });
  store.data.analyticsSnapshots = store.data.analyticsSnapshots.slice(-3650);
  const log = await store.create("syncLogs", "sync", { channelId: channel.id, status: "success", discovered, total: details.length, startedAt, finishedAt: new Date().toISOString() });
  await store.save(); return log;
}
