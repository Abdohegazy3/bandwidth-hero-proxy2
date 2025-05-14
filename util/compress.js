const sharp = require('sharp');
const redirect = require('./redirect');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  try {
    // التحقق الأساسي من صحة البيانات المدخلة
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      console.warn('Invalid or empty buffer received');
      return redirect('');
    }

    // إعداد sharp مع خيارات للتعامل مع الصور المتضررة
    let image = sharp(buffer, {
      failOnError: false, // محاولة معالجة الصور المتضررة
      limitInputPixels: 268_435_456, // حد أقصى 256 ميجابكسل
      animated: false,
    });

    let format = isWebp ? 'webp' : 'jpeg';
    let options = {
      quality: Math.max(1, Math.min(quality || 40, 100)), // ضمان الجودة بين 1 و100
      progressive: true,
      optimizeScans: true,
      chromaSubsampling: '4:4:4', // تحسين جودة اللون
      force: true, // فرض إعادة التشكيل
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

    // محاولة المعالجة والحصول على البيانات الخارجة
    const result = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
      console.error('Failed to process image with sharp:', err.message);
      return null;
    });

    if (!result || !result.data || !result.info) {
      console.error('Failed to generate output, attempting fallback processing');
      // محاولة إصلاح الصورة عن طريق تحويلها إلى raw وإعادة المعالجة
      image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true, // قراءة تسلسلية لتجنب الأخطاء
      });

      if (isGrayscale) {
        image = image.grayscale();
      }

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      const fallbackResult = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
        console.error('Fallback processing failed:', err.message);
        return null;
      });

      if (!fallbackResult || !fallbackResult.data || !fallbackResult.info) {
        console.error('All processing attempts failed, returning redirect');
        return redirect('');
      }

      const { data: output, info } = fallbackResult;
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

    const { data: output, info } = result;

    // التحقق من أن الحجم الناتج منطقي
    if (!output || output.length >= originalSize) {
      console.warn('Output size is invalid or larger than original, attempting reprocessing');
      // إعادة المحاولة مع خيارات أكثر صرامة
      image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
      });

      if (isGrayscale) {
        image = image.grayscale();
      }

      options.quality = Math.max(1, options.quality - 10); // تقليل الجودة لتقليل الحجم
      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      const retryResult = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
        console.error('Retry processing failed:', err.message);
        return null;
      });

      if (!retryResult || !retryResult.data || !retryResult.info) {
        console.error('Retry processing failed, returning redirect');
        return redirect('');
      }

      const { data: retryOutput, info: retryInfo } = retryResult;
      return {
        err: null,
        output: retryOutput,
        headers: {
          'content-type': isWebp ? 'image/webp' : 'image/jpeg',
          'content-length': retryInfo.size.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': (originalSize - retryInfo.size).toString(),
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
    console.error('Compression error:', err.message);
    if (
      err.message.includes('Input buffer contains unsupported image format') ||
      err.message.includes('VIPS_ERROR')
    ) {
      console.error('Unsupported or corrupted image detected, forcing processing');
      // محاولة أخيرة بتحويل الصورة إلى raw ثم إعادة المعالجة
      let image = sharp(buffer, {
        failOnError: false,
        sequentialRead: true,
      });

      if (isGrayscale) {
        image = image.grayscale();
      }

      const options = {
        quality: Math.max(1, Math.min(quality || 40, 100)),
        progressive: true,
        optimizeScans: true,
        chromaSubsampling: '4:4:4',
        force: true,
      };

      if (isWebp) {
        image = image.toFormat('webp', options);
      } else {
        image = image.toFormat('jpeg', options);
      }

      const finalResult = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
        console.error('Final processing attempt failed:', err.message);
        return null;
      });

      if (!finalResult || !finalResult.data || !finalResult.info) {
        console.error('All processing attempts failed, returning redirect');
        return redirect('');
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
    } else if (err.message.includes('out of memory')) {
      console.error('Memory limit exceeded, returning redirect');
      return redirect('');
    }
    return redirect('');
  }
};
