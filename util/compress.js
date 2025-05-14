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
  };

  // الدالة التي تحاول المعالجة باستخدام sharp
  const processWithSharp = async (attemptOptions, useWebp = isWebp) => {
    let image = sharp(buffer, attemptOptions);

    if (isGrayscale) {
      image = image.grayscale();
    }

    if (useWebp) {
      image = image.toFormat('webp', options);
    } else {
      image = image.toFormat('jpeg', options);
    }

    return await image.toBuffer({ resolveWithObject: true });
  };

  // المحاولة الأولى: معالجة مباشرة مع sharp
  let result;
  try {
    result = await processWithSharp({
      failOnError: false,
      limitInputPixels: 268_435_456,
      pages: -1,
    });
  } catch (err) {
    console.warn('Sharp initial processing failed:', err.message);
  }

  // المحاولة الثانية: استخدام sequentialRead مع تحجيم آمن
  if (!result || !result.data || !result.info) {
    console.warn('Falling back to sequential read processing with sharp');
    try {
      let image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
      }).resize({ fit: 'inside', withoutEnlargement: true });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      result = await image.toBuffer({ resolveWithObject: true });
    } catch (err) {
      console.warn('Sharp sequential read processing failed:', err.message);
    }
  }

  // المحاولة الثالثة: تحويل إلى JPEG إذا فشل WebP
  if (!result || !result.data || !result.info) {
    console.warn('WebP processing failed, forcing JPEG processing with sharp');
    try {
      result = await processWithSharp({
        failOnError: false,
        sequentialRead: true,
      }, false); // تحويل إلى JPEG
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
