const sharp = require('sharp');
const redirect = require('./redirect');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  try {
    // التحقق من صحة البيانات المدخلة
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      console.warn('Invalid or empty buffer received');
      return redirect('');
    }

    // إنشاء نسخة من البيانة مع تحقق من تنسيق JPEG
    let image = sharp(buffer, {
      failOnError: false,
      limitInputPixels: 268_435_456, // حد أقصى 256 ميجابكسل
      animated: false,
    });

    // التحقق من تنسيق الصورة
    const metadata = await image.metadata().catch((err) => {
      console.warn('Failed to read metadata:', err.message);
      return null;
    });

    if (!metadata || (metadata.format !== 'jpeg' && metadata.format !== 'jpg' && !isWebp)) {
      console.warn('Invalid or unsupported image format detected');
      return {
        err: null,
        output: buffer,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': buffer.length.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': '0',
        },
      };
    }

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

    // الحصول على البيانات الخارجة
    const result = await image.toBuffer({ resolveWithObject: true }).catch((err) => {
      console.warn('Failed to process image with sharp:', err.message);
      return null;
    });

    if (!result || !result.data || !result.info) {
      console.warn('Failed to generate output, returning original buffer');
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

    const { data: output, info } = result;

    // التحقق من أن الحجم الناتج منطقي
    if (!output || output.length >= originalSize) {
      console.warn('Output size is invalid or larger than original, using original buffer');
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
      console.warn('Unsupported or corrupted image detected, returning original buffer');
      return {
        err: null,
        output: buffer,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': buffer.length.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': '0',
        },
      };
    } else if (err.message.includes('out of memory')) {
      console.warn('Memory limit exceeded, returning original buffer');
      return {
        err: null,
        output: buffer,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': buffer.length.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': '0',
        },
      };
    }
    return redirect('');
  }
};
