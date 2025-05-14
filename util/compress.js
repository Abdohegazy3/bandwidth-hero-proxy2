const sharp = require('sharp');
const redirect = require('./redirect');

module.exports = async (buffer, isWebp, isGrayscale, quality, originalSize) => {
  try {
    // التحقق من صحة البيانات المدخلة
    if (!buffer || buffer.length === 0) {
      return redirect(''); // إعادة توجيه إلى URL فارغ (يمكن تعديله)
    }

    let image = sharp(buffer);
    if (isGrayscale) {
      image = image.grayscale();
    }

    if (isWebp) {
      image = image.webp({ quality: quality || 40 });
    } else {
      image = image.jpeg({ quality: quality || 40 });
    }

    const output = await image.toBuffer();

    return {
      err: null,
      output,
      headers: {
        'content-type': isWebp ? 'image/webp' : 'image/jpeg',
        'content-length': output.length.toString(),
        'x-original-size': originalSize.toString(),
        'x-bytes-saved': (originalSize - output.length).toString(),
      },
    };
  } catch (err) {
    console.error('Compression error:', err);
    return redirect(''); // إعادة توجيه في حالة الخطأ
  }
};
