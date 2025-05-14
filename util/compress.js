const sharp = require('sharp');
const Jimp = require('jimp');
const probe = require('probe-image-size');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  try {
    // التحقق الأساسي من صحة البيانات المدخلة
    if (!buffer || !Buffer.isBuffer(buffer)) {
      console.error('Invalid buffer received');
      throw new Error('Invalid input buffer');
    }

    // التحقق من تنسيق الصورة باستخدام probe-image-size
    let imageInfo;
    try {
      imageInfo = await probe(buffer);
    } catch (probeErr) {
      console.warn('Probe failed, proceeding with sharp:', probeErr.message);
      imageInfo = null;
    }

    let format = isWebp ? 'webp' : 'jpeg';
    let options = {
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

    // المحاولة الأولى: الإعدادات الافتراضية مع sharp
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

    // المحاولة الثانية: استخدام sequentialRead
    if (!result || !result.data || !result.info) {
      console.warn('Falling back to sequential read processing with sharp');
      try {
        result = await processWithSharp({
          failOnError: false,
          sequentialRead: true,
          density: 72,
        });
      } catch (err) {
        console.warn('Sharp sequential read processing failed:', err.message);
      }
    }

    // المحاولة الثالثة: تحجيم آمن مع sharp
    if (!result || !result.data || !result.info) {
      console.warn('Forcing processing with resize using sharp');
      let image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
      })
        .resize({ fit: 'inside', withoutEnlargement: true });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      try {
        result = await image.toBuffer({ resolveWithObject: true });
      } catch (err) {
        console.warn('Sharp resize processing failed:', err.message);
      }
    }

    // المحاولة الرابعة: تحويل إلى JPEG فقط إذا فشل WebP
    if (!result || !result.data || !result.info) {
      console.warn('WebP processing failed, forcing JPEG processing with sharp');
      try {
        result = await processWithSharp({
          failOnError: false,
          sequentialRead: true,
        }, false); // تحويل إلى JPEG بدلاً من WebP
      } catch (err) {
        console.warn('Sharp JPEG processing failed:', err.message);
      }
    }

    // المحاولة الخامسة: استخدام jimp كخطة احتياطية
    if (!result || !result.data || !result.info) {
      console.warn('Falling back to jimp processing');
      let image;
      try {
        image = await Jimp.read(buffer);
      } catch (err) {
        console.error('Jimp failed to read image:', err.message);
        throw new Error('Failed to process image with both sharp and jimp');
      }

      if (isGrayscale) {
        image = image.grayscale();
      }

      image = image.quality(options.quality);
      const output = await image.getBufferAsync(Jimp.MIME_JPEG); // jimp يدعم JPEG فقط

      return {
        err: null,
        output,
        headers: {
          'content-type': 'image/jpeg', // jimp ينتج JPEG فقط
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
  } catch (err) {
    console.error('Critical compression error:', err.message);
    // محاولة أخيرة باستخدام jimp
    let image;
    try {
      image = await Jimp.read(buffer);
    } catch (jimpErr) {
      console.error('Jimp final attempt failed:', jimpErr.message);
      throw new Error('Failed to process image with both sharp and jimp');
    }

    if (isGrayscale) {
      image = image.grayscale();
    }

    image = image.quality(Math.max(1, Math.min(quality || 40, 100)));
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
};
