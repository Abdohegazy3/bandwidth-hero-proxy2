module.exports = (contentType, size, isWebp) => {
  if (!contentType || !contentType.startsWith('image/')) return false;
  if (size < 10000) return false;
  return isWebp || contentType.includes('jpeg') || contentType.includes('png');
};
