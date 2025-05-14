const sharp = require('sharp');
const Jimp = require('jimp');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  // التحقق الأساسي من صحة البيانات المدخلة
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid input buffer');
  }

  const options = {
    quality: Math.max(1, Math.min(quality || 40, 100)), // الحفاظ على الجودة من الملحق
    progressive: true,
    optimizeScans: true,
    chromaSubsampling: '4:4:4',
    force: true,
    effort: 1,
  };

  // الدالة التي تحاول المعالجة باستخدام sharp
  const processWithSharp = async (attemptOptions, targetFormat) => {
    let image = sharp(buffer, attemptOptions);

    if (isGrayscale) {
      image = image.grayscale();
    }

    image = image.toFormat(targetFormat, options);
    return await image.toBuffer({ resolveWithObject: true });
  };

  // المحاولة الأولى: تحويل إجباري إلى JPEG (تجاهل isWebp)
  let result;
  try {
    result = await processWithSharp({
      failOnError: false,
      limitInputPixels: 268_435_456,
      sequentialRead: true,
      pages: -1,
    }, 'jpeg');
  } catch (err) {
    console.warn('Sharp JPEG processing failed:', err.message);
  }

  // المحاولة الثانية: تحويل إلى WebP كخيار احتياطي (اختياري)
  if (!result || !result.data || !result.info) {
    console.warn('Falling back to WebP processing with sharp');
    try {
      result = await processWithSharp({
        failOnError: false,
        limitInputPixels: 268_435_456,
        sequentialRead: true,
        pages: -1,
      }, 'webp');
    } catch (err) {
      console.warn('Sharp WebP processing failed:', err.message);
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
      'content-type': info.format === 'webp' ? 'image/webp' : 'image/jpeg',
      'content-length': info.size.toString(),
      'x-original-size': originalSize.toString(),
      'x-bytes-saved': (originalSize - info.size).toString(),
    },
  };
};
