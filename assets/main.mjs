const THUMBNAIL_SIZE = 144;

/**
 * @param {File} file
 */
export async function generateThumbnail(file) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  var ctx = canvas.getContext("2d");

  /** @type HTMLImageElement */
  if (file.type.startsWith("image/")) {
    const image = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = URL.createObjectURL(file);
    });
    ctx.drawImage(image, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "video/mp4") {
    // Generate thumbnail from video
    const video = await new Promise(async (resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.src = URL.createObjectURL(file);
      setTimeout(() => reject(new Error("Video load timeout")), 2000);
      await video.play();
      await video.pause();
      video.currentTime = 0;
      resolve(video);
    });
    ctx.drawImage(video, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  }

  /** @type Blob */
  const thumbnailBlob = await new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob))
  );

  return thumbnailBlob;
}

/**
 * @param {Blob} blob
 */
export async function blobDigest(blob) {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  const digestArray = Array.from(new Uint8Array(digest));
  const digestHex = digestArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return digestHex;
}

export const SIZE_LIMIT = 100 * 1000 * 1000; // 100MB
const MULTIPART_CONCURRENCY = 4;
const MULTIPART_MAX_RETRIES = 3;
const MULTIPART_RETRY_BASE_DELAY = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMultipartStateKey(key, file) {
  return `multipart:${key}:${file.size}:${file.lastModified}`;
}

function loadMultipartState(stateKey) {
  try {
    const raw = localStorage.getItem(stateKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function saveMultipartState(stateKey, state) {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch (_e) {}
}

function clearMultipartState(stateKey) {
  try {
    localStorage.removeItem(stateKey);
  } catch (_e) {}
}

function calcPartSize(fileSize, partNumber, totalChunks) {
  if (partNumber < totalChunks) return SIZE_LIMIT;
  return fileSize - SIZE_LIMIT * (totalChunks - 1);
}

/**
 * @param {string} key
 * @param {File} file
 * @param {Record<string, any>} options
 */
export async function multipartUpload(key, file, options) {
  const headers = options?.headers || {};
  headers["content-type"] = file.type;
  const totalChunks = Math.ceil(file.size / SIZE_LIMIT);

  const stateKey = getMultipartStateKey(key, file);
  const cachedState = loadMultipartState(stateKey) || {};
  let uploadId = cachedState.uploadId;
  const uploadedPartsMap = cachedState.uploadedParts || {};

  if (!uploadId) {
    uploadId = await axios
      .post(`/api/write/items/${key}?uploads`, "", { headers })
      .then((res) => res.data.uploadId);
  }

  const loadedByPart = {};
  for (let i = 1; i <= totalChunks; i++) {
    if (uploadedPartsMap[i]) {
      loadedByPart[i] = calcPartSize(file.size, i, totalChunks);
    } else {
      loadedByPart[i] = 0;
    }
  }

  const reportProgress = () => {
    if (typeof options?.onUploadProgress !== "function") return;
    const loaded = Object.values(loadedByPart).reduce(
      (sum, current) => sum + current,
      0
    );
    options.onUploadProgress({ loaded, total: file.size });
  };

  saveMultipartState(stateKey, { uploadId, uploadedParts: uploadedPartsMap });
  reportProgress();

  const pendingPartNumbers = [];
  for (let i = 1; i <= totalChunks; i++) {
    if (!uploadedPartsMap[i]) pendingPartNumbers.push(i);
  }

  const uploadOnePart = async (partNumber) => {
    const chunk = file.slice(
      (partNumber - 1) * SIZE_LIMIT,
      partNumber * SIZE_LIMIT
    );

    for (let attempt = 1; attempt <= MULTIPART_MAX_RETRIES; attempt++) {
      try {
        const searchParams = new URLSearchParams({ partNumber, uploadId });
        const response = await axios.put(
          `/api/write/items/${key}?${searchParams}`,
          chunk,
          {
            onUploadProgress(progressEvent) {
              loadedByPart[partNumber] = Math.min(
                progressEvent.loaded || 0,
                calcPartSize(file.size, partNumber, totalChunks)
              );
              reportProgress();
            },
          }
        );

        const etag = response.headers.etag;
        uploadedPartsMap[partNumber] = { partNumber, etag };
        loadedByPart[partNumber] = calcPartSize(file.size, partNumber, totalChunks);
        saveMultipartState(stateKey, { uploadId, uploadedParts: uploadedPartsMap });
        reportProgress();
        return;
      } catch (error) {
        if (attempt >= MULTIPART_MAX_RETRIES) {
          throw error;
        }
        const delay = MULTIPART_RETRY_BASE_DELAY * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(MULTIPART_CONCURRENCY, pendingPartNumbers.length || 1) },
    async () => {
      while (pendingPartNumbers.length) {
        const partNumber = pendingPartNumbers.shift();
        if (!partNumber) return;
        await uploadOnePart(partNumber);
      }
    }
  );

  await Promise.all(workers);

  const uploadedParts = [];
  for (let i = 1; i <= totalChunks; i++) {
    uploadedParts.push(uploadedPartsMap[i]);
  }

  const completeParams = new URLSearchParams({ uploadId });
  await axios.post(`/api/write/items/${key}?${completeParams}`, {
    parts: uploadedParts,
  });

  clearMultipartState(stateKey);
}
