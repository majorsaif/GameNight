export const PROFILE_PHOTO_MAX_BYTES = 50 * 1024;
export const PROFILE_PHOTO_MAX_DIMENSION = 200;
export const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function getBase64Payload(value) {
  if (typeof value !== 'string') return '';
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  const commaIndex = trimmedValue.indexOf(',');
  const payload = commaIndex >= 0 ? trimmedValue.slice(commaIndex + 1) : trimmedValue;
  return payload.replace(/\s/g, '');
}

export function estimatePhotoByteSize(value) {
  const payload = getBase64Payload(value);
  if (!payload) return 0;

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function getResizedDimensions(width, height, maxDimension) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : maxDimension;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : maxDimension;

  const scale = Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  };
}

function drawResizedImage(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create 2D canvas context');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file'));
    };

    image.src = objectUrl;
  });
}

export async function compressProfilePhotoFile(
  file,
  {
    maxBytes = PROFILE_PHOTO_MAX_BYTES,
    maxDimension = PROFILE_PHOTO_MAX_DIMENSION
  } = {}
) {
  if (!(file instanceof Blob)) {
    throw new Error('A valid image file is required');
  }

  const image = await loadImageFromFile(file);
  let { width, height } = getResizedDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    maxDimension
  );

  const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42, 0.34, 0.28, 0.22];
  const minDimension = 64;

  while (true) {
    const canvas = drawResizedImage(image, width, height);

    for (const quality of qualitySteps) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const byteSize = estimatePhotoByteSize(dataUrl);

      if (byteSize <= maxBytes) {
        return {
          dataUrl,
          byteSize,
          width,
          height,
          quality
        };
      }
    }

    if (width <= minDimension && height <= minDimension) {
      break;
    }

    const nextWidth = Math.max(minDimension, Math.floor(width * 0.85));
    const nextHeight = Math.max(minDimension, Math.floor(height * 0.85));

    if (nextWidth === width && nextHeight === height) {
      break;
    }

    width = nextWidth;
    height = nextHeight;
  }

  throw new Error(`Unable to compress image below ${maxBytes} bytes`);
}
