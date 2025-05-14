const axios = require('axios');
const pick = require('lodash').pick; // استبدال util/pick بـ lodash لأنه غير موجود في الكود الأصلي
const shouldCompress = require('../util/shouldCompress');
const compress = require('../util/compress');
const DEFAULT_QUALITY = 40;

exports.handler = async (e, t) => {
  let { url: r } = e.queryStringParameters,
    { jpeg: s, bw: o, l: a } = e.queryStringParameters;

  if (!r)
    return { statusCode: 200, body: 'bandwidth-hero-proxy' }; // تغيير الاستجابة إلى bandwidth-hero-proxy كما هو مطلوب

  try {
    r = JSON.parse(r);
  } catch {}
  Array.isArray(r) && (r = r.join('&url='));
  r = r.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, 'http://');

  let d = !s,
    n = o != 0,
    i = parseInt(a, 10) || 40;

  try {
    let h = {};
    const response = await axios.get(r, {
      headers: {
        ...pick(e.headers, ['cookie', 'dnt', 'referer']),
        'user-agent': 'Bandwidth-Hero Compressor',
        'x-forwarded-for': e.headers['x-forwarded-for'] || e.ip,
        via: '1.1 bandwidth-hero',
      },
      responseType: 'arraybuffer', // للحصول على البيانات الثنائية
    });

    if (response.status >= 400) {
      return { statusCode: response.status || 302 };
    }

    h = response.headers;
    const c = Buffer.from(response.data); // تحويل arraybuffer إلى Buffer
    const l = response.headers['content-type'] || '';
    const p = c.length;

    if (!shouldCompress(l, p, d)) {
      console.log('Bypassing... Size: ', c.length);
      return {
        statusCode: 200,
        body: c.toString('base64'),
        isBase64Encoded: true,
        headers: { 'content-encoding': 'identity', ...h },
      };
    }

    let { err: u, output: y, headers: g } = await compress(c, d, n, i, p);
    if (u) throw (console.log('Conversion failed: ', r), u);

    console.log(`From ${p}, Saved: ${(p - y.length) / p}%`);
    let $ = y.toString('base64');
    return {
      statusCode: 200,
      body: $,
      isBase64Encoded: true,
      headers: { 'content-encoding': 'identity', ...h, ...g },
    };
  } catch (f) {
    return console.error(f), { statusCode: 500, body: f.message || '' };
  }
};
