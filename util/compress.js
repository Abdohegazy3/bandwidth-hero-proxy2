const sharp = require('sharp');
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

    // الدالة التي تحاول المعالجة بإعدادات مختلفة
    const processImage = async (attemptOptions) => {
      let image = sharp(buffer, attemptOptions);

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      return await image.toBuffer({ resolveWithObject: true });
    };

    // المحاولة الأولى: الإعدادات الافتراضية
    let result;
    try {
      result = await processImage({
        failOnError: false,
        limitInputPixels: 268_435_456,
        pages: -1,
      });
    } catch (err) {
      console.warn('Initial processing failed:', err.message);
    }

    // المحاولة الثانية: استخدام sequentialRead
    if (!result || !result.data || !result.info) {
      console.warn('Falling back to sequential read processing');
      try {
        result = await processImage({
          failOnError: false,
          sequentialRead: true,
          density: 72,
        });
      } catch (err) {
        console.warn('Sequential read processing failed:', err.message);
      }
    }

    // المحاولة الثالثة: تحجيم آمن مع إعدادات أكثر مرونة
    if (!result || !result.data || !result.info) {
      console.warn('Forcing processing with resize');
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

      result = await image.toBuffer({ resolveWithObject: true });
    }

    // المحاولة الأخيرة: معالجة قسرية بإعدادات بسيطة
    if (!result || !result.data || !result.info) {
      console.warn('Forcing minimal processing');
      let image = sharp(buffer, { failOnError: false });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      result = await image.toBuffer({ resolveWithObject: true });
    }

    const { data: output, info } = result;

    // ضمان أن يكون هناك ناتج صالح
    if (!output || output.length === 0) {
      console.error('Output is empty after all attempts, forcing minimal processing');
      let image = sharp(buffer, { failOnError: false });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      const minimalResult = await image.toBuffer({ resolveWithObject: true });
      return {
        err: null,
        output: minimalResult.data,
        headers: {
          'content-type': isWebp ? 'image/webp' : 'image/jpeg',
          'content-length': minimalResult.info.size.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': (originalSize - minimalResult.info.size).toString(),
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
    // محاولة أخيرة قسرية
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

    const finalResult = await image.toBuffer({ resolveWithObject: true });

    return {
      err: null,
      output: finalResult.data,
      headers: {
        'content-type': isWebp ? 'image/webp' : 'image/jpeg',
        'content-length': finalResult.info.size.toString(),
        'x-original-size': originalSize.toString(),
        'x-bytes-saved': (originalSize - finalResult.info.size).toString(),
      },
    };
  }
};
