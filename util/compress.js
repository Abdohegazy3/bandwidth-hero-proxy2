const sharp = require('sharp');
const Jimp = require('jimp');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  // التحقق الأساسي من صحة البيانات المدخلة
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid input buffer');
  }

  const options = {
    quality: Math.max(1, Math.min(quality || 40, 100)),
    progressive: true,
    optimizeScans: true,
    chromaSubsampling: '4:4:4',
    force: true,
    effort: 1, // تقليل المجهود لتسريع المعالجة
  };

  // المحاولة الأساسية مع sharp
  let result;
  try {
    let image = sharp(buffer, {
      failOnError: false,
      limitInputPixels: 268_435_456,
      sequentialRead: true, // تسريع القراءة
      pages: -1,
    });

    if (isGrayscale) {
      image = image.grayscale();
    }

    image = image.toFormat(isWebp ? 'webp' : 'jpeg', options);
    result = await image.toBuffer({ resolveWithObject: true });
  } catch (err) {
    console.warn('Sharp processing failed:', err.message);
  }

  // إذا فشل sharp، جرب تحويل إلى JPEG بدلاً من WebP
  if (!result || !result.data || !result.info) {
    console.warn('Retrying with JPEG format using sharp');
    try {
      let image = sharp(buffer, {
        failOnError: false,
        limitInputPixels: 268_435_456,
        sequentialRead: true,
        pages: -1,
      });

      if (isGrayscale) {
        image = image.grayscale();
      }

      image = image.toFormat('jpeg', options);
      result = await image.toBuffer({ resolveWithObject: true });
    } catch (err) {
      console.warn('Sharp JPEG processing failed:', err.message);
    }
  }

  // المحاولة الأخيرة: استخدام jimp إذا فشل sharp
  if (!result || !result.data || !result.info) {
    console.warn('Falling back to jimp processing');
    const image = await Jimp.read(buffer);

    if (isGrayscale) {
      image.grayscale();
    }

    image.quality(options.quality);
    const output = await image.getBufferAsync(Jimp.MIME_JPEG);

    return {
      err: null,
      output,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': output.length.toString(),
        'x-original-size': originalSize.toString(),
        'x-bytes-saved': (originalSize - output.length).toString(),
      },
    };
  }

  const { data: output, info } = result;
  return {
    err: null,
    output,
    headers: {
      'content-type': isWebp ? 'image/webp' : 'image/jpeg',
      'content-length': info.size.toString(),
      'x-original-size': originalSize.toString(),
      'x-bytes-saved': (originalSize - info.size).toString(),
    },
  };
};
