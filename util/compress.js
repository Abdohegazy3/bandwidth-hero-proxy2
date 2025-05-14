const sharp = require('sharp');
const probe = require('probe-image-size');
const redirect = require('./redirect');

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

    // إعداد sharp مع خيارات مرنة
    let image = sharp(buffer, {
      failOnError: false,
      limitInputPixels: 268_435_456, // حد أقصى 256 ميجابكسل
      pages: -1,
    });

    let format = isWebp ? 'webp' : 'jpeg';
    let options = {
      quality: Math.max(1, Math.min(quality || 40, 100)),
      progressive: true,
      optimizeScans: true,
      chromaSubsampling: '4:4:4',
      force: true,
    };

    // تطبيق grayscale إذا كان مطلوبًا
    if (isGrayscale) {
      image = image.grayscale();
    }

    // تحديد الصيغة بناءً على المتغير isWebp
    if (isWebp) {
      image = image.toFormat('webp', options);
    } else {
      image = image.toFormat('jpeg', options);
    }

    // محاولة المعالجة الأولية
    let result = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
      console.warn('Initial processing failed:', err.message);
      return null;
    });

    // إذا فشلت المعالجة الأولية، استخدم إعدادات إضافية
    if (!result || !result.data || !result.info) {
      console.warn('Falling back to advanced processing');
      image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
        density: 72,
      });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      result = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
        console.error('Advanced processing failed:', err.message);
        return null;
      });
    }

    // إذا فشلت جميع المحاولات، استخدم معالجة قسرية بدون raw
    if (!result || !result.data || !result.info) {
      console.warn('Forcing final processing attempt');
      image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
      })
        .resize({ fit: 'inside', withoutEnlargement: true }) // تحجيم آمن
        .toFormat(format, options);

      result = await image.toBuffer({ resolveWithObject: true });
    }

    const { data: output, info } = result;

    // ضمان أن يكون هناك ناتج، حتى لو كان الحجم الأصلي
    if (!output || output.length === 0) {
      console.warn('Output is empty, using original buffer with processing');
      image = sharp(buffer, { failOnError: false });
      if (isGrayscale) image = image.grayscale();
      result = await image.toFormat(format, options).toBuffer({ resolveWithObject: true });
      const { data: fallbackOutput, info: fallbackInfo } = result;
      return {
        err: null,
        output: fallbackOutput,
        headers: {
          'content-type': isWebp ? 'image/webp' : 'image/jpeg',
          'content-length': fallbackInfo.size.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': (originalSize - fallbackInfo.size).toString(),
        },
      };
    }

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
    // محاولة أخيرة قسرية بدون raw
    let image = sharp(buffer, {
      failOnError: false,
      sequentialRead: true,
    })
      .resize({ fit: 'inside', withoutEnlargement: true })
      .toFormat(isWebp ? 'webp' : 'jpeg', {
        quality: Math.max(1, Math.min(quality || 40, 100)),
        progressive: true,
        optimizeScans: true,
        chromaSubsampling: '4:4:4',
      });

    const finalResult = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
      console.error('Final attempt failed:', err.message);
      return null;
    });

    if (!finalResult || !finalResult.data || !finalResult.info) {
      console.error('All attempts failed, returning minimal processed output');
      return {
        err: null,
        output: buffer,
        headers: {
          'content-type': isWebp ? 'image/webp' : 'image/jpeg',
          'content-length': buffer.length.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': '0',
        },
      };
    }

    const { data: output, info } = finalResult;
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
  }
};
