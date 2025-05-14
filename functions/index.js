const puppeteerCore = require('puppeteer-core');
const chromium = require('@sparticuz/chromium'); // بديل حديث لـ chrome-aws-lambda
const pick = require('lodash').pick;
const shouldCompress = require('../util/shouldCompress');
const compress = require('../util/compress');
const DEFAULT_QUALITY = 40;

exports.handler = async (e, t) => {
  let { url: r } = e.queryStringParameters,
    { jpeg: s, bw: o, l: a } = e.queryStringParameters;

  if (!r)
    return { statusCode: 200, body: 'bandwidth-hero-proxy' };

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

    // تحديد المسار التنفيذي لـ Chrome في بيئة Netlify
    const executablePath = await chromium.executablePath;

    // إعداد Puppeteer باستخدام chrome المدمج
    const browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // إعدادات لتقليد سلوك المستخدم الحقيقي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setExtraHTTPHeaders({
      ...pick(e.headers, ['cookie', 'dnt', 'referer']),
      'user-agent': 'Bandwidth-Hero Compressor',
      'x-forwarded-for': e.headers['x-forwarded-for'] || e.ip,
      'via': '1.1 bandwidth-hero',
    });

    // الذهاب إلى الصفحة وانتظار مرور التحدي
    await page.goto(r, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction('document.querySelector("body") && !document.querySelector(".cf-browser-verification")', { timeout: 30000 });

    // استرجاع الصورة مباشرة (بدلاً من المحتوى الكلي)
    const imageBuffer = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, r);

    const c = Buffer.from(imageBuffer);

    // إغلاق المتصفح
    await browser.close();

    const l = 'image/jpeg'; // تحديد نوع المحتوى مباشرة
    const p = c.length;

    if (!shouldCompress(l, p, d)) {
      console.log('Bypassing... Size: ', p);
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
    console.error(f);
    return { statusCode: 500, body: f.message || 'Error processing request' };
  }
};
