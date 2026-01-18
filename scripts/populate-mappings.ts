import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { AnimeMapping } from '../src/models/AnimeMapping.js';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

// Provider imports
import { getEpisodesForAnime as getHiAnimeEpisodes } from '../src/providers/hianime.js';
import { getEpisodesForAnime as getAnimeSamaEpisodes } from '../src/providers/animesama.js';
import { AnimeKai } from '../src/providers/animekai.js';
import { AnimePahe } from '../src/providers/animepahe.js';
import { mapAniListToAnicrush } from '../src/providers/anicrush/mapper.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/anime-mappings',
  ANILIST_IDS_FILE: path.join(__dirname, '../anilist-ids.json'),
  CONCURRENCY: parseInt(process.env.CONCURRENCY || '10'),
  SKIP_EXISTING: process.env.SKIP_EXISTING === 'true'
};

const SITEMAP_URLS = [
  'https://anilist.co/sitemap/anime-0.xml',
  'https://anilist.co/sitemap/anime-1.xml',
  'https://anilist.co/sitemap/anime-2.xml'
];

let processed = 0;
let failed = 0;
let total = 0;

// Fetch and compile all AniList IDs from sitemaps
async function fetchAnilistIds(): Promise<number[]> {
  if (existsSync(CONFIG.ANILIST_IDS_FILE)) {
    console.log('[INFO] Loading existing anilist-ids.json');
    const data = readFileSync(CONFIG.ANILIST_IDS_FILE, 'utf-8');
    return JSON.parse(data);
  }

  console.log('[INFO] Fetching AniList IDs from sitemaps...');
  const allIds: number[] = [];

  for (const url of SITEMAP_URLS) {
    try {
      console.log(`[FETCH] ${url}`);
      const response = await axios.get(url, { timeout: 30000 });
      const result = await parseStringPromise(response.data);

      const urls = result.urlset?.url || [];
      for (const entry of urls) {
        const loc = entry.loc?.[0];
        if (loc) {
          const match = loc.match(/\/anime\/(\d+)/);
          if (match) allIds.push(parseInt(match[1]));
        }
      }
    } catch (err: any) {
      console.error(`[ERROR] Failed to fetch ${url}: ${err.message}`);
    }
  }

  const uniqueIds = [...new Set(allIds)].sort((a, b) => a - b);
  writeFileSync(CONFIG.ANILIST_IDS_FILE, JSON.stringify(uniqueIds, null, 2));
  console.log(`[INFO] Saved ${uniqueIds.length} IDs to anilist-ids.json`);

  return uniqueIds;
}

// Fetch anime info from AniList
async function getAnilistInfo(id: number): Promise<{ title: string; format: string; year: number | null; malId: number | null } | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        title { english romaji }
        format
        seasonYear
        startDate { year }
        idMal
      }
    }
  `;

  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query,
      variables: { id }
    }, { timeout: 10000 });

    const media = response.data?.data?.Media;
    if (!media) return null;

    return {
      title: media.title.english || media.title.romaji || '',
      format: media.format || 'TV',
      year: media.seasonYear || media.startDate?.year || null,
      malId: media.idMal || null
    };
  } catch {
    return null;
  }
}

// Provider mappers - all run in parallel
async function mapHiAnime(anilistId: number): Promise<string | null> {
  try {
    const result = await getHiAnimeEpisodes(anilistId);
    return result?.hianimeId || null;
  } catch {
    return null;
  }
}

async function mapAnimeSama(anilistId: number): Promise<string | null> {
  try {
    const result = await getAnimeSamaEpisodes(anilistId);
    return result?.animesamaSlug || null;
  } catch {
    return null;
  }
}

async function mapAnimeKai(title: string): Promise<string | null> {
  try {
    const animekai = new AnimeKai();
    const results = await animekai.search(title);
    if (results?.results?.length > 0) {
      return results.results[0].id.split('/').pop() || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function mapAnimePahe(title: string): Promise<string | null> {
  try {
    const pahe = new AnimePahe();
    const results = await pahe.scrapeSearchResults(title);
    if (results?.length > 0) {
      return results[0].session || null;
    }
    return null;
  } catch {
    return null;
  }
}

async function mapAnicrush(anilistId: number): Promise<string | null> {
  try {
    const result = await mapAniListToAnicrush(String(anilistId));
    return result?.anicrush_id || null;
  } catch {
    return null;
  }
}

// Process a single anime - providers run in parallel
async function processAnime(anilistId: number): Promise<void> {
  // Check if exists
  if (CONFIG.SKIP_EXISTING) {
    const existing = await AnimeMapping.findOne({ anilistId });
    if (existing) return;
  }

  // Get AniList info
  const info = await getAnilistInfo(anilistId);
  if (!info) {
    failed++;
    return;
  }

  // Map all providers in PARALLEL
  const [hianime, animesama, animekai, animepahe, anicrush] = await Promise.all([
    mapHiAnime(anilistId),
    mapAnimeSama(anilistId),
    mapAnimeKai(info.title),
    mapAnimePahe(info.title),
    mapAnicrush(anilistId)
  ]);

  await AnimeMapping.findOneAndUpdate(
    { anilistId },
    {
      $set: {
        anilistId,
        title: info.title,
        format: info.format,
        year: info.year,
        mal: info.malId,
        tmdb: null,
        hianime,
        animesama,
        animekai,
        animepahe,
        anicrush,
        flixhq: null
      }
    },
    { upsert: true }
  );

  processed++;
  const found = [hianime, animesama, animekai, animepahe, anicrush].filter(Boolean).length;
  console.log(`[${processed}/${total}] ${anilistId} "${info.title.slice(0, 25)}" - ${found}/5`);
}

// Process batch with concurrency
async function processBatch(ids: number[]): Promise<void> {
  const promises = ids.map(id =>
    processAnime(id).catch(() => { failed++; })
  );
  await Promise.all(promises);
}

// Main
async function main() {
  console.log('=== Anime Mapping Populator ===');
  console.log(`Concurrency: ${CONFIG.CONCURRENCY}\n`);

  await mongoose.connect(CONFIG.MONGODB_URI);
  console.log('[DB] Connected\n');

  const ids = await fetchAnilistIds();
  total = ids.length;
  console.log(`[INFO] Processing ${total} anime\n`);

  // Process in batches
  for (let i = 0; i < ids.length; i += CONFIG.CONCURRENCY) {
    const batch = ids.slice(i, i + CONFIG.CONCURRENCY);
    await processBatch(batch);

    // Progress every 500
    if (processed % 500 === 0 && processed > 0) {
      console.log(`\n--- Progress: ${processed}/${total} (${((processed/total)*100).toFixed(1)}%) | Errors: ${failed} ---\n`);
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);

  await mongoose.connection.close();
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n[EXIT] ${processed}/${total} done`);
  await mongoose.connection.close();
  process.exit(0);
});

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
