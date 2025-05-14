const sharp = require('sharp');
const redirect = require('./redirect');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  try {
    // التحقق من صحة البيانات المدخلة
    if (!buffer || buffer.length === 0) {
      return redirect(''); // إعادة توجيه إذا كانت البيانات غير موجودة أو فارغة
    }

    // إنشاء نسخة من البيانة لتجنب التعديل المباشر
    let image = sharp(buffer, { failOnError: false, limitInputPixels: 268_435_456 }); // حد أقصى 256 ميجابكسل
    let format = isWebp ? 'webp' : 'jpeg';
    let options = { quality: Math.max(1, Math.min(quality || 40, 100)), progressive: true, optimizeScans: true };

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

    // الحصول على البيانات الخارجة مع التحقق من الدقة
    const { data: output, info } = await image.toBuffer({ resolveWithObject: true });

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
    // معالجة أنواع الأخطاء المحددة
    if (err.message.includes('Input buffer contains unsupported image format')) {
      console.warn('Unsupported image format, returning original buffer');
      return {
        err: null,
        output: buffer,
        headers: {
          'content-type': 'application/octet-stream', // نوع غير محدد لتجنب الأخطاء
          'content-length': buffer.length.toString(),
          'x-original-size': originalSize.toString(),
          'x-bytes-saved': '0',
        },
      };
    }
    return redirect(''); // إعادة توجيه في حالات الأخطاء الأخرى
  }
};
