import crypto from 'crypto';
import { compareTwoStrings } from 'string-similarity';

/**
 * Duplicate Detection Utilities
 * Implements 3-level duplicate detection as specified in PROTECTION_SYSTEM_FINAL.md
 */

/**
 * Level 1: Generate exact SHA256 hash of content
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Level 2: Generate normalized hash (whitespace/formatting removed)
 * Catches formatting changes, extra spaces, different line endings
 */
export function generateNormalizedHash(content: string): string {
  const normalized = content
    // Remove all whitespace variations
    .replace(/\s+/g, ' ')
    // Convert to lowercase for case-insensitive matching
    .toLowerCase()
    // Remove common punctuation that doesn't affect meaning
    .replace(/[.,!?;:(){}[\]'"]/g, '')
    // Trim leading/trailing whitespace
    .trim();
  
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Level 3: Generate perceptual hash for semantic similarity
 * Uses simhash algorithm for ~80% similarity detection
 * 
 * For text: Creates fingerprint based on word frequency and position
 * For images: Would use pHash (not implemented here - requires image processing lib)
 */
export function generatePerceptualHash(content: string, type: 'text' | 'image' = 'text'): string {
  if (type === 'image') {
    // Image perceptual hashing would require a library like 'sharp' + 'imghash'
    // For MVP, return empty string - implement in future iteration
    return '';
  }

  // Text perceptual hash using simhash
  return generateSimHash(content);
}

/**
 * SimHash implementation for text similarity
 * Creates a 256-bit fingerprint based on word features
 */
function generateSimHash(text: string): string {
  const features = extractFeatures(text);
  const hashBits = 256;
  const vector = new Array(hashBits).fill(0);

  // For each feature, hash it and update the vector
  for (const [feature, weight] of Object.entries(features)) {
    const hash = crypto.createHash('sha256').update(feature).digest();
    
    for (let i = 0; i < hashBits; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const bit = (hash[byteIndex] >> bitIndex) & 1;
      
      if (bit === 1) {
        vector[i] += weight;
      } else {
        vector[i] -= weight;
      }
    }
  }

  // Convert vector to binary fingerprint
  const fingerprint = vector.map(v => (v > 0 ? '1' : '0')).join('');
  
  // Convert binary string to hex for storage
  const hexHash = binaryToHex(fingerprint);
  
  return hexHash;
}

/**
 * Extract weighted features from text for simhash
 */
function extractFeatures(text: string): Record<string, number> {
  const features: Record<string, number> = {};
  
  // Split into words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2); // Skip very short words

  // Count word frequencies
  for (const word of words) {
    features[word] = (features[word] || 0) + 1;
  }

  // Also include bigrams (2-word sequences) for better accuracy
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]}_${words[i + 1]}`;
    features[bigram] = (features[bigram] || 0) + 0.5; // Lower weight for bigrams
  }

  return features;
}

/**
 * Convert binary string to hexadecimal
 */
function binaryToHex(binary: string): string {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/**
 * Calculate Hamming distance between two hex hashes
 * Used to determine similarity of perceptual hashes
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be the same length');
  }

  let distance = 0;
  
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    distance += countBits(xor);
  }

  return distance;
}

/**
 * Count number of set bits in a number
 */
function countBits(n: number): number {
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

/**
 * Check if two perceptual hashes are similar
 * Threshold of 20% difference (51/256 bits) allows ~80% similarity matching
 */
export function areSimilar(hash1: string, hash2: string, threshold: number = 51): boolean {
  const distance = hammingDistance(hash1, hash2);
  return distance <= threshold;
}

/**
 * Calculate text similarity percentage using Dice coefficient
 * Alternative/complementary to perceptual hash
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  return compareTwoStrings(text1, text2);
}

/**
 * Comprehensive duplicate check
 * Returns detection level if duplicate found, null otherwise
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  level?: 'exact' | 'normalized' | 'perceptual';
  similarity?: number;
  originalHash?: string;
}

export function checkDuplicate(
  content: string,
  existingHashes: {
    exact?: string[];
    normalized?: string[];
    perceptual?: string[];
  }
): DuplicateCheckResult {
  // Level 1: Exact hash check
  const exactHash = generateContentHash(content);
  if (existingHashes.exact?.includes(exactHash)) {
    return {
      isDuplicate: true,
      level: 'exact',
      similarity: 1.0,
      originalHash: exactHash,
    };
  }

  // Level 2: Normalized hash check
  const normalizedHash = generateNormalizedHash(content);
  if (existingHashes.normalized?.includes(normalizedHash)) {
    return {
      isDuplicate: true,
      level: 'normalized',
      similarity: 0.95, // Estimate
      originalHash: normalizedHash,
    };
  }

  // Level 3: Perceptual hash check
  const perceptualHash = generatePerceptualHash(content);
  if (perceptualHash && existingHashes.perceptual) {
    for (const existingHash of existingHashes.perceptual) {
      // Skip if hashes are different lengths (safety check)
      if (perceptualHash.length !== existingHash.length) {
        continue;
      }
      
      if (areSimilar(perceptualHash, existingHash)) {
        const distance = hammingDistance(perceptualHash, existingHash);
        const similarity = 1 - (distance / 256);
        
        return {
          isDuplicate: true,
          level: 'perceptual',
          similarity,
          originalHash: existingHash,
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Generate all hash types for content
 */
export interface ContentHashes {
  exact: string;
  normalized: string;
  perceptual: string;
}

export function generateAllHashes(content: string, contentType: 'text' | 'image' = 'text'): ContentHashes {
  return {
    exact: generateContentHash(content),
    normalized: generateNormalizedHash(content),
    perceptual: generatePerceptualHash(content, contentType),
  };
}

export default {
  generateContentHash,
  generateNormalizedHash,
  generatePerceptualHash,
  hammingDistance,
  areSimilar,
  calculateTextSimilarity,
  checkDuplicate,
  generateAllHashes,
};
