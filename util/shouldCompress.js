const MIN_COMPRESS_LENGTH = 1024;
const MIN_TRANSPARENT_COMPRESS_LENGTH = 102400;

function shouldCompress(imageType, size, isTran>
  return !(
    !imageType.startsWith("image") ||
    size === 0 ||
    (isTransparent && size < MIN_COMPRESS_LENGT>
    (!isTransparent && (imageType.endsWith("png>
  );
}

module.exports = shouldCompress;

