// Image handling for multimodal models
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ImageData {
  type: 'base64' | 'url';
  mimeType: string;
  data: string; // base64 string or URL
  width?: number;
  height?: number;
  filename?: string;
}

// Supported image formats
const SUPPORTED_FORMATS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

// Check if a file is a supported image
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext in EXTENSION_TO_MIME;
}

// Load image from file
export async function loadImageFromFile(filePath: string): Promise<ImageData | null> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = EXTENSION_TO_MIME[ext];

    if (!mimeType) {
      return null;
    }

    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');

    return {
      type: 'base64',
      mimeType,
      data: base64,
      filename: path.basename(filePath),
    };
  } catch {
    return null;
  }
}

// Parse image from URL
export function parseImageUrl(url: string): ImageData | null {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    const mimeType = EXTENSION_TO_MIME[ext] || 'image/jpeg';

    return {
      type: 'url',
      mimeType,
      data: url,
    };
  } catch {
    return null;
  }
}

// Check if URL is an image URL
export function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return ext in EXTENSION_TO_MIME;
  } catch {
    return false;
  }
}

// Format image for Ollama API
export function formatForOllama(image: ImageData): string {
  if (image.type === 'base64') {
    return image.data; // Ollama expects just the base64 string
  }
  return image.data; // URL
}

// Format image for OpenAI API
export function formatForOpenAI(image: ImageData): {
  type: 'image_url';
  image_url: { url: string; detail?: string };
} {
  if (image.type === 'url') {
    return {
      type: 'image_url',
      image_url: { url: image.data },
    };
  }

  // Base64 data URL
  const dataUrl = `data:${image.mimeType};base64,${image.data}`;
  return {
    type: 'image_url',
    image_url: { url: dataUrl },
  };
}

// Extract images from message text (file paths and URLs)
export async function extractImages(text: string, cwd: string): Promise<{
  cleanText: string;
  images: ImageData[];
}> {
  const images: ImageData[] = [];
  let cleanText = text;

  // Find file paths (patterns like ./image.png, /path/to/image.jpg, ~/photos/pic.png)
  const pathPattern = /(?:^|\s)((?:~|\.{0,2})?\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
  const pathMatches = text.matchAll(pathPattern);

  for (const match of pathMatches) {
    const filePath = match[1];
    const absolutePath = filePath.startsWith('~')
      ? path.join(process.env.HOME || '', filePath.slice(1))
      : filePath.startsWith('/')
      ? filePath
      : path.join(cwd, filePath);

    const image = await loadImageFromFile(absolutePath);
    if (image) {
      images.push(image);
      cleanText = cleanText.replace(match[0], '');
    }
  }

  // Find URLs
  const urlPattern = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^\s]*)?/gi;
  const urlMatches = text.matchAll(urlPattern);

  for (const match of urlMatches) {
    const image = parseImageUrl(match[0]);
    if (image) {
      images.push(image);
      cleanText = cleanText.replace(match[0], '');
    }
  }

  return {
    cleanText: cleanText.trim(),
    images,
  };
}

// Check if model supports images
export function modelSupportsImages(modelName: string): boolean {
  const lowerModel = modelName.toLowerCase();

  const visionModels = [
    'llava',
    'bakllava',
    'llava-llama3',
    'llava-phi3',
    'moondream',
    'cogvlm',
    'yi-vl',
    'gpt-4-vision',
    'gpt-4o',
    'gpt-4-turbo',
    'claude-3',
    'gemini-pro-vision',
    'gemini-1.5',
  ];

  return visionModels.some(vm => lowerModel.includes(vm));
}

// Estimate token cost of an image
export function estimateImageTokens(image: ImageData): number {
  // Very rough estimate based on OpenAI's pricing
  // Low detail: ~85 tokens, High detail: ~170 tokens per 512x512 tile

  // Without dimensions, assume a reasonable default
  if (!image.width || !image.height) {
    return 255; // Low-detail estimate
  }

  // High detail calculation (like OpenAI)
  const shortSide = Math.min(image.width, image.height);
  const longSide = Math.max(image.width, image.height);

  // Scale to fit within 2048x2048
  let scale = 1;
  if (longSide > 2048) {
    scale = 2048 / longSide;
  }

  const scaledShort = Math.floor(shortSide * scale);
  const scaledLong = Math.floor(longSide * scale);

  // Scale so shortest side is 768
  if (scaledShort > 768) {
    scale = 768 / scaledShort;
  }

  const finalWidth = Math.floor(scaledLong * scale);
  const finalHeight = Math.floor(scaledShort * scale);

  // Count 512x512 tiles
  const tilesX = Math.ceil(finalWidth / 512);
  const tilesY = Math.ceil(finalHeight / 512);
  const totalTiles = tilesX * tilesY;

  return 85 + 170 * totalTiles;
}
