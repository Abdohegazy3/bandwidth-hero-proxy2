const Jimp = require('jimp');

async function compress(imagePath, useWebp, grayscale, quality, originalSize) {
  try {
    // قراءة الصورة باستخدام Jimp
    const image = await Jimp.read(imagePath);

    // تطبيق grayscale إذا كان مطلوبًا
    if (grayscale) {
      image.grayscale();
    }

    // ضبط الجودة (Jimp لا يدعم WebP، لذا سنستخدم JPEG)
    const output = await image
      .quality(quality || 40) // ضبط الجودة
      .getBufferAsync(Jimp.MIME_JPEG); // تحويل إلى JPEG

    return {
      err: null,
      headers: {
        'content-type': 'image/jpeg', // Jimp ينتج JPEG فقط
        'content-length': output.length,
        'x-original-size': originalSize,
        'x-bytes-saved': originalSize - output.length,
      },
      output,
    };
  } catch (err) {
    return { err };
  }
}

module.exports = compress;
