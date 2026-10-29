/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {LanguageEnum, VoiceEnum} from '../../audio/audio.constants';
import {PaginatedResponse} from './paginated-response.model';
import {SourceMediaItemLink} from './search.model';

export interface EnrichedSourceAsset {
  sourceAssetId: string;
  presignedUrl: string;
  presignedThumbnailUrl: string;
  gcsUri: string;
  mimeType?: string;
  role: string;
}

export interface EnrichedSourceMediaItem extends SourceMediaItemLink {
  presignedUrl: string;
  presignedThumbnailUrl: string;
  mimeType?: string;
  gcsUri: string;
}

/**
 * Defines the states for a long-running generation job.
 */
export enum JobStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

/**
 * Represents a single media item, mirroring the Pydantic model from the backend.
 */
export interface MediaItem {
  id: number;
  userEmail?: string;
  folderId?: number | null;
  createdAt?: string; // ISO 8601 date string
  updatedAt?: string; // ISO 8601 date string
  // itemType and assetType removed as per refactoring

  // Common fields across media types
  titles?: string[];
  descriptions?: string[];
  prompt?: string;
  originalPrompt?: string;
  rewrittenPrompt?: string;
  numMedia?: number;
  model?: string;
  mimeType?: string;
  generationTime?: number;
  error_message?: string;
  enrichedSourceAssets?: EnrichedSourceAsset[];
  enrichedSourceMediaItems?: EnrichedSourceMediaItem[];

  // URI and URL fields
  gcsUris: string[];
  presignedUrls?: string[];
  originalPresignedUrls?: string[];
  presignedThumbnailUrls?: string[];

  // Video specific
  aspect?: string; // Note: 'aspect' is used for video, 'aspectRatio' for image
  duration?: number;
  referenceImage?: string;
  lastReferenceImage?: string;
  enhancedPromptUsed?: boolean;
  comment?: string;
  status?: JobStatus; // Tracks the state of the generation job

  // Image specific
  modifiers?: string[];
  aspectRatio?: string;
  style?: string;
  lighting?: string;
  colorAndTone?: string;
  composition?: string;
  negativePrompt?: string;
  seed?: number;
  critique?: string;
  addWatermark?: boolean;
  googleSearch?: boolean;
  resolution?: string;
  groundingMetadata?: any;

  // Music specific
  audioAnalysis?: AudioAnalysis;
  voiceName?: VoiceEnum | string;
  languageCode?: LanguageEnum;

  // Debugging field
  rawData?: Record<string, any>;
  errorMessage?: string;
}

export interface AudioTrackAnalysis {
  raw_text?: string;
  rawText?: string;
  lyrics?: string;
  structure?: Record<string, any> | any[];
  [key: string]: any;
}

export interface AudioAnalysis {
  tracks?: Array<AudioTrackAnalysis | null>;
  [key: string]: any;
}

export interface SongStructureEntry {
  label: string;
  value: string;
}

function humanizeStructureKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function summarizeStructureSection(section: Record<string, any>): string {
  const parts: string[] = [];
  if (section['duration']) parts.push(String(section['duration']));
  if (section['bars'] !== undefined && section['bars'] !== null) {
    parts.push(`${section['bars']} bars`);
  }
  if (section['time']) parts.push(String(section['time']));
  const descriptor =
    section['description'] ||
    section['mood'] ||
    section['style'] ||
    section['notes'];
  if (descriptor) parts.push(String(descriptor));

  if (parts.length > 0) {
    return parts.join(' • ');
  }

  const extra = Object.entries(section)
    .filter(
      ([k, v]) =>
        !['name', 'section', 'type', 'lyrics'].includes(k) &&
        v !== undefined &&
        v !== null &&
        v !== '',
    )
    .map(([k, v]) => `${humanizeStructureKey(k)}: ${String(v)}`);
  return extra.join(' • ') || 'Section';
}

export function getAudioTrackAnalysis(
  item: {audioAnalysis?: AudioAnalysis | null} | null | undefined,
  index = 0,
): AudioTrackAnalysis | null {
  const analysis = item?.audioAnalysis ?? (item as any)?.audio_analysis;
  if (!analysis || typeof analysis !== 'object') {
    return null;
  }
  if (Array.isArray(analysis.tracks)) {
    return analysis.tracks[index] ?? null;
  }
  return null;
}

export function getAudioTrackLyrics(
  track: AudioTrackAnalysis | null | undefined,
): string | null {
  if (!track) return null;
  if (typeof track.lyrics === 'string' && track.lyrics.trim()) {
    return track.lyrics.trim();
  }
  if (!track.structure) {
    const raw = track.raw_text ?? track.rawText;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}

export function formatSongStructureEntries(
  track: AudioTrackAnalysis | null | undefined,
): SongStructureEntry[] {
  const structure = track?.structure;
  if (!structure) return [];

  if (Array.isArray(structure)) {
    return structure.map((sec, idx) => {
      if (typeof sec === 'string') {
        return {label: `Section ${idx + 1}`, value: sec};
      }
      if (sec && typeof sec === 'object') {
        const label = String(
          sec['name'] || sec['section'] || sec['type'] || `Section ${idx + 1}`,
        );
        return {label, value: summarizeStructureSection(sec)};
      }
      return {label: `Section ${idx + 1}`, value: String(sec)};
    });
  }

  if (typeof structure === 'object') {
    const entries: SongStructureEntry[] = [];
    for (const [key, val] of Object.entries(structure)) {
      if (
        key === 'lyrics' ||
        key === 'sections' ||
        val === undefined ||
        val === null ||
        val === ''
      ) {
        continue;
      }
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        entries.push({label: humanizeStructureKey(key), value: String(val)});
      } else if (Array.isArray(val)) {
        entries.push({
          label: humanizeStructureKey(key),
          value: val
            .map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
            .join(', '),
        });
      }
    }

    if (Array.isArray(structure['sections'])) {
      structure['sections'].forEach((sec: any, idx: number) => {
        if (typeof sec === 'string') {
          entries.push({label: `Section ${idx + 1}`, value: sec});
        } else if (sec && typeof sec === 'object') {
          const label = String(
            sec['name'] ||
              sec['section'] ||
              sec['type'] ||
              `Section ${idx + 1}`,
          );
          entries.push({label, value: summarizeStructureSection(sec)});
        }
      });
    }

    return entries;
  }

  return [];
}

export function formatTrackAnalysisForCopy(
  track: AudioTrackAnalysis | null | undefined,
): string {
  const parts: string[] = [];
  const entries = formatSongStructureEntries(track);
  if (entries.length > 0) {
    parts.push(entries.map(e => `${e.label}: ${e.value}`).join('\n'));
  }
  const lyrics = getAudioTrackLyrics(track);
  if (lyrics) {
    parts.push(lyrics);
  }
  return parts.join('\n\n');
}

/**
 * Defines the response structure for a paginated gallery query,
 * mirroring the Pydantic model from the backend.
 */
export type PaginatedGalleryResponse = PaginatedResponse<MediaItem>;
