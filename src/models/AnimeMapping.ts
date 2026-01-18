import mongoose, { Schema, Document } from 'mongoose';

export interface IAnimeMapping extends Document {
  anilistId: number;
  title: string;
  format: string;
  year: number | null;
  mal: number | null;
  tmdb: number | null;
  hianime: string | null;
  animekai: string | null;
  animepahe: string | null;
  animesama: string | null;
  anicrush: string | null;
  flixhq: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AnimeMappingSchema: Schema = new Schema({
  anilistId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    index: true
  },
  format: {
    type: String,
    default: null
  },
  year: {
    type: Number,
    default: null,
    index: true
  },
  mal: {
    type: Number,
    default: null,
    index: true
  },
  tmdb: {
    type: Number,
    default: null,
    index: true
  },
  hianime: {
    type: String,
    default: null
  },
  animekai: {
    type: String,
    default: null
  },
  animepahe: {
    type: String,
    default: null
  },
  animesama: {
    type: String,
    default: null
  },
  anicrush: {
    type: String,
    default: null
  },
  flixhq: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
AnimeMappingSchema.index({ title: 'text' });
AnimeMappingSchema.index({ createdAt: -1 });
AnimeMappingSchema.index({ updatedAt: -1 });

export const AnimeMapping = mongoose.model<IAnimeMapping>('AnimeMapping', AnimeMappingSchema);
