const axios = require('axios');
const pick = require('lodash').pick;
const shouldCompress = require('../util/shouldCompress');
const compress = require('../util/compress');

function copyHeaders(source, target = {}) {
  for (const [key, value] of Object.entries(source)) {
    target[key.toLowerCase()] = value;
  }
  return target;
}

const DEFAULT_QUALITY = 40;

exports.handler = async (event, context) => {
  let { url, jpeg, bw, l } = event.queryStringParameters || {};

  // إذا لم يتم توفير URL، عُد باستجابة تدل على الخدمة كـ bandwidth-hero-proxy
  if (!url) {
    return {
      statusCode: 200,
      headers: {
        'X-Bandwidth-Hero': '1', // رأس لتأكيد الخدمة
        'X-Service-Name': 'bandwidth-hero-proxy', // رأس مخصص لتعريف الخدمة
        'content-type': 'text/plain',
      },
      body: 'bandwidth-hero-proxy', // تغيير الاستجابة إلى bandwidth-hero-proxy
    };
  }

  try {
    url = JSON.parse(url);
  } catch {}
  if (Array.isArray(url)) {
    url = url.join('&url=');
  }
  url = url.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, 'http://');

  const isWebp = !jpeg; // Jimp ينتج JPEG فقط
  const isGrayscale = bw !== '0';
  const quality = parseInt(l, 10) || DEFAULT_QUALITY;

  try {
    const response = await axios.get(url, {
      headers: {
        ...pick(event.headers || {}, ['cookie', 'dnt', 'referer']),
        'user-agent': 'Bandwidth-Hero Compressor',
        'x-forwarded-for': event.headers?.['x-forwarded-for'] || event.clientContext?.ip || '',
        via: '1.1 bandwidth-hero',
      },
      timeout: 10000,
      maxRedirects: 5,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (!response.status || response.status >= 400) {
      return {
        statusCode: response.status || 302,
        body: '',
      };
    }

    const contentType = response.headers['content-type'] || '';
    const dataSize = response.data.length;
    let headers = copyHeaders(response.headers);
    headers['content-encoding'] = 'identity';

    if (!shouldCompress(contentType, dataSize, isWebp)) {
      console.log('Bypassing... Size:', dataSize);
      return {
        statusCode: 200,
        body: response.data.toString('base64'),
        isBase64Encoded: true,
        headers,
      };
    }

    const { err, output, headers: compressHeaders } = await compress(
      response.data,
      isWebp,
      isGrayscale,
      quality,
      dataSize
    );

    if (err) {
      console.log('Conversion failed:', url);
      if (compressHeaders && compressHeaders.location) {
        return {
          statusCode: 302,
          headers: compressHeaders,
          body: '',
        };
      }
      return {
        statusCode: 500,
        body: err.message || 'Compression failed',
      };
    }

    console.log(`From ${dataSize}, Saved: ${(dataSize - output.length) / dataSize}%`);
    headers = { ...headers, ...compressHeaders };

    return {
      statusCode: 200,
      body: output.toString('base64'),
      isBase64Encoded: true,
      headers,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message || 'Internal Server Error',
    };
  }
};
