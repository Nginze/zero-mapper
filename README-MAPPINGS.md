# Anime Mappings Population Script

This script populates your MongoDB database with anime mappings from AniList IDs to various providers (MAL, TMDB, AnimePahe, HiAnime, AnimeKai, AnimeSama).

## Features

- 🚀 **Concurrent Processing**: Processes multiple IDs in parallel with configurable concurrency
- 🔄 **Automatic Retries**: Retries failed requests with exponential backoff
- 💾 **Progress Tracking**: Real-time progress updates and ETA
- ⏭️ **Skip Existing**: Option to skip already-processed IDs
- 🎯 **Batch Processing**: Processes IDs in batches to avoid overwhelming APIs
- 📊 **Detailed Statistics**: Comprehensive summary of successful/failed mappings
- 🛡️ **Error Handling**: Graceful error handling and error storage in DB

## Prerequisites

1. **MongoDB**: Running MongoDB instance
2. **Node.js**: Version 18 or higher
3. **Dependencies**: Install required packages

```bash
pnpm install mongoose p-limit @types/mongoose
```

## Installation

1. Install dependencies:
```bash
pnpm add mongoose p-limit
pnpm add -D @types/mongoose
```

2. Set up your environment variables in `.env`:
```bash
cp .env.example .env
```

3. Edit `.env` and configure:
```env
MONGODB_URI=mongodb://localhost:27017/anime-mappings
TMDB_API_KEY=your_tmdb_api_key
MAL_CLIENT_ID=your_mal_client_id  # Optional

# Script Performance Settings
CONCURRENT_REQUESTS=10    # Number of parallel requests
RETRY_ATTEMPTS=3          # Number of retry attempts per ID
RETRY_DELAY=2000          # Delay between retries (ms)
BATCH_SIZE=100            # IDs per batch
SKIP_EXISTING=true        # Skip already-mapped IDs
```

## Usage

### Run the script

```bash
# Using tsx (development)
pnpm tsx scripts/populate-mappings.ts

# Or build and run
pnpm build
node dist/scripts/populate-mappings.js
```

### Performance Tuning

Adjust these environment variables based on your setup:

**For Fast Processing (if you have good API rate limits):**
```env
CONCURRENT_REQUESTS=20
BATCH_SIZE=200
RETRY_ATTEMPTS=2
```

**For Conservative Processing (to avoid rate limits):**
```env
CONCURRENT_REQUESTS=5
BATCH_SIZE=50
RETRY_ATTEMPTS=5
RETRY_DELAY=3000
```

**For Maximum Speed (use with caution):**
```env
CONCURRENT_REQUESTS=50
BATCH_SIZE=500
RETRY_ATTEMPTS=2
RETRY_DELAY=1000
```

## Expected Performance

With 20,000 AniList IDs and default settings (10 concurrent requests):

- **Estimated Time**: 2-4 hours
- **Success Rate**: ~85-95% (some IDs may not exist or have limited data)
- **Database Size**: ~500MB-1GB (depending on data richness)

### Performance Estimates by Concurrency

| Concurrent Requests | Estimated Time | Risk Level |
|---------------------|----------------|------------|
| 5                   | 6-8 hours      | Low        |
| 10 (default)        | 3-4 hours      | Low        |
| 20                  | 1.5-2 hours    | Medium     |
| 50                  | 40-60 minutes  | High       |

**Note**: Higher concurrency increases the risk of rate limiting and API errors.

## MongoDB Schema

The script stores data in the following structure:

```typescript
{
  anilistId: Number,           // Primary key
  anilist: {
    id: Number,
    title: {
      romaji: String,
      english: String,
      native: String
    },
    episodes: Number,
    year: Number,
    score: Number
  },
  mal: { /* MyAnimeList data */ },
  tmdb: { /* The Movie Database data */ },
  animepahe: { /* AnimePahe data */ },
  hianime: { /* HiAnime data */ },
  animekai: { /* AnimeKai data */ },
  animesama: { /* AnimeSama data */ },
  lastUpdated: Date,
  fetchedAt: Date,
  error: String                // Only if fetch failed
}
```

## Monitoring Progress

The script outputs real-time progress:

```
📊 Progress: 1250/20000 (6.25%)
✅ Successful: 1180
❌ Failed: 50
⏭️  Skipped: 20
⏱️  Elapsed: 450s
🚀 Rate: 2.78 items/s
⏰ ETA: 6738s (112.3 min)
```

## Querying Your Database

After the script completes, you can query mappings:

```javascript
// Find by AniList ID
db.animemappings.findOne({ anilistId: 21 })

// Find by MAL ID
db.animemappings.findOne({ 'mal.id': 21 })

// Find by TMDB ID
db.animemappings.findOne({ 'tmdb.id': 12345 })

// Find by title
db.animemappings.find({
  'anilist.title.english': /One Piece/i
})

// Find all errors
db.animemappings.find({ error: { $exists: true } })

// Count successful mappings
db.animemappings.countDocuments({ error: { $exists: false } })
```

## Error Handling

The script handles errors gracefully:

1. **Network Errors**: Retries with exponential backoff
2. **API Rate Limits**: Automatically slows down with batch delays
3. **Invalid IDs**: Stores error message in database
4. **Database Errors**: Logs and continues processing

Failed IDs are stored in the database with an `error` field for later review.

## Graceful Shutdown

Press `Ctrl+C` to gracefully shutdown. The script will:
1. Complete current batch
2. Close database connection
3. Print final statistics

## Resuming After Interruption

If the script is interrupted, simply run it again with `SKIP_EXISTING=true` to skip already-processed IDs:

```bash
SKIP_EXISTING=true pnpm tsx scripts/populate-mappings.ts
```

## Updating Existing Mappings

To refresh all mappings (including existing ones):

```bash
SKIP_EXISTING=false pnpm tsx scripts/populate-mappings.ts
```

## Troubleshooting

### Rate Limiting Issues

If you encounter rate limiting:
1. Reduce `CONCURRENT_REQUESTS` to 5 or lower
2. Increase `RETRY_DELAY` to 5000 or higher
3. Reduce `BATCH_SIZE` to 50 or lower

### MongoDB Connection Issues

```bash
# Check MongoDB is running
mongosh

# Or for MongoDB Compass, connect to:
mongodb://localhost:27017
```

### High Error Rate

If more than 20% of requests fail:
1. Check your API keys are valid
2. Verify internet connection
3. Reduce concurrency
4. Check if external APIs are down

## API Rate Limits

Be aware of API rate limits:

- **AniList**: ~90 requests/minute (no key required)
- **TMDB**: ~40 requests/10 seconds (with API key)
- **MAL**: ~50 requests/minute (with client ID)

The script's default settings respect these limits with 10 concurrent requests.

## Contributing

To add more providers or modify the mapping logic, edit:
- Schema: `src/models/AnimeMapping.ts`
- Mapper: `src/mappers/cross-mapper.ts`
- Script: `scripts/populate-mappings.ts`

## License

ISC
