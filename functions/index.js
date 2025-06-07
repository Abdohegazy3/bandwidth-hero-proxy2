const pick = require("../util/pick"),
  fetch = require("node-fetch"),
  shouldCompress = require("../util/shouldCompress"),
  compress = require("../util/compress"),
  DEFAULT_QUALITY = 40;

exports.handler = async (e, t) => {
  let { url: r } = e.queryStringParameters,
    { jpeg: s, bw: o, l: a } = e.queryStringParameters;

  // إرجاع رسالة ترحيب إذا لم يتم تقديم URL
  if (!r) {
    return {
      statusCode: 200,
      body: "Bandwidth Hero Data Compression Service",
    };
  }

  // تحليل وتنظيف عنوان URL
  try {
    r = JSON.parse(r);
  } catch {}
  Array.isArray(r) && (r = r.join("&url="));
  r = r.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, "http://");

  // إعدادات الضغط
  let d = !s,
    n = o !== "0",
    i = Number.isInteger(parseInt(a, 10)) && parseInt(a, 10) >= 1 && parseInt(a, 10) <= 100 ? parseInt(a, 10) : DEFAULT_QUALITY;

  try {
    let h = {},
      fetchResponse = await fetch(r, {
        headers: {
          ...pick(e.headers, ["cookie", "dnt", "referer"]),
          "user-agent": "Bandwidth-Hero Compressor",
          "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
          via: "1.1 bandwidth-hero",
        },
        timeout: 10000,
      });

    if (!fetchResponse.ok) {
      console.log("Fetch failed with status:", fetchResponse.status);
      return {
        statusCode: fetchResponse.status || 302,
        body: "",
      };
    }

    let { data: c, type: l } = {
      data: await fetchResponse.buffer(),
      type: fetchResponse.headers.get("content-type") || "",
    };
    h = fetchResponse.headers;

    let p = c ? c.length : 0; // التحقق من c قبل الوصول إلى length
    if (p === 0) {
      console.log("No data received from URL:", r);
      return {
        statusCode: 400,
        body: "No data received",
      };
    }

    // إعداد الرؤوس مع دعم CORS وCSP
    let headers = {
      "content-encoding": "identity",
      "Access-Control-Allow-Origin": "*",
      "Content-Security-Policy": "img-src 'self' https://luxury-salmiakki-597e62.netlify.app;",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      ...h,
    };

    // التحقق مما إذا كان الضغط مطلوبًا
    if (!shouldCompress(l, p, d)) {
      console.log("Bypassing... Size:", p);
      return {
        statusCode: 200,
        body: c.toString("base64"),
        isBase64Encoded: true,
        headers,
      };
    }

    // ضغط البيانات
    let { err: u, output: y, headers: g } = await compress(c, n, i, p);
    if (u) {
      console.log("Conversion failed:", r);
      throw u;
    }

    console.log(`From ${p}, Saved: ${(p - y.length) / p}%`);
    let $ = y.toString("base64");

    // دمج الرؤوس الإضافية من الضغط
    headers = { ...headers, ...g };

    return {
      statusCode: 200,
      body: $,
      isBase64Encoded: true,
      headers,
    };
  } catch (f) {
    console.error("Error:", f.message);
    return {
      statusCode: 500,
      body: f.message || "",
    };
  }
};
