package com.pressreader.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/**
 * 外刊精读 · Android 外壳。
 *
 * 设计要点：整个应用是一个装满在本地的 index.html，但不用 file:// 加载——
 * 那会让 fetch('/__fetch') 失效、localStorage 也容易被清。这里用一个虚拟域名
 * https://appassets.androidplatform.net/ ，所有请求都由 shouldInterceptRequest 接管：
 *   /index.html  → 从 assets 读
 *   /__fetch    → 在原生侧做 HTTP 抓取（等价于桌面版 serve.mjs 的代理）
 * 于是页面是 https 源，fetch('/__fetch?url=…') 是同源请求，不走 CORS，JS 一行都不用改。
 */
public class MainActivity extends Activity {

  private static final String HOST = "appassets.androidplatform.net";
  private static final String UA =
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
  private static final int MAX_BYTES = 8 * 1024 * 1024;
  private static final int TIMEOUT_CONNECT = 20000;
  private static final int TIMEOUT_READ = 25000;

  private WebView web;
  private TtsBridge tts;
  /* WebView 里 <input type="file"> 必须由宿主实现 onShowFileChooser，
     否则「导入数据」在 APK 里点了没反应（没有任何报错，用户只会以为文件坏了）。 */
  private static final int REQ_PICK_FILE = 1001;
  private ValueCallback<Uri[]> filePathCallback;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);

    boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
    int paper = Color.parseColor(dark ? "#191713" : "#F6F2EA");
    getWindow().setStatusBarColor(paper);
    getWindow().setNavigationBarColor(paper);
    if (!dark && android.os.Build.VERSION.SDK_INT >= 23) {
      getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
    }

    web = new WebView(this);
    setContentView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT));

    // 调试开关只跟随「这个包是不是 debuggable」：release 包恒开调试等于把
    // localStorage（含 API Key）直接交给任何能接 adb 的人。
    boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    WebView.setWebContentsDebuggingEnabled(debuggable);

    web.setBackgroundColor(paper);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setUseWideViewPort(true);          // 尊重页面里的 viewport meta
    s.setLoadWithOverviewMode(false);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);

    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        if (!HOST.equals(req.getUrl().getHost())) return null;
        if (!"https".equals(req.getUrl().getScheme())) return jsonError(403, "只支持 HTTPS 应用页面");
        String path = req.getUrl().getPath();
        if ("/__fetch".equals(path)) {
          if (!"GET".equals(req.getMethod()) || req.isForMainFrame()) return jsonError(403, "只接受由本应用页面发起的抓取请求");
          return proxyFetch(req.getUrl().getQueryParameter("url"));
        }
        return serveAsset(path);
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        if (HOST.equals(req.getUrl().getHost()) && "https".equals(req.getUrl().getScheme())) return false;
        if (!req.isForMainFrame()) return true;
        try {                       // 站外链接（比如「打开原文」）交给系统浏览器
          startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
        } catch (Exception ignored) {}
        return true;
      }
    });

    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                       FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = cb;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("*/*");
        try {
          startActivityForResult(Intent.createChooser(pick, "选择备份文件"), REQ_PICK_FILE);
        } catch (Exception e) {
          filePathCallback = null;
          return false;
        }
        return true;
      }

      @Override
      public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
        android.util.Log.d("press-reader", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
        return true;
      }
    });

    TtsBridge bridge = new TtsBridge(this, web);
    web.addJavascriptInterface(bridge, "AndroidTTS");
    this.tts = bridge;

    web.loadUrl("https://" + HOST + "/index.html");
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == REQ_PICK_FILE) {
      Uri[] picked = null;
      if (resultCode == RESULT_OK && data != null && data.getData() != null) {
        picked = new Uri[] { data.getData() };
      }
      if (filePathCallback != null) {
        filePathCallback.onReceiveValue(picked);
        filePathCallback = null;
      }
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  @Override
  protected void onPause() {
    // 切到后台就停下朗读，别让声音跟着用户走到别的 App 里
    if (tts != null) tts.stop();
    super.onPause();
  }

  @Override
  protected void onDestroy() {
    if (tts != null) { tts.release(); tts = null; }
    if (web != null) {
      web.destroy();
      web = null;
    }
    super.onDestroy();
  }

  /* ---------------- 本地资源 ---------------- */

  private WebResourceResponse serveAsset(String path) {
    String name = path == null ? "" : path;
    if (name.startsWith("/")) name = name.substring(1);
    if (name.isEmpty()) name = "index.html";
    try {
      InputStream in = getAssets().open(name, AssetManager.ACCESS_STREAMING);
      return new WebResourceResponse(mimeOf(name), "utf-8", in);
    } catch (IOException e) {
      return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(),
          new ByteArrayInputStream(("asset not found: " + name).getBytes(StandardCharsets.UTF_8)));
    }
  }

  private static String mimeOf(String name) {
    String n = name.toLowerCase(Locale.ROOT);
    if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
    if (n.endsWith(".js")) return "text/javascript";
    if (n.endsWith(".css")) return "text/css";
    if (n.endsWith(".json")) return "application/json";
    if (n.endsWith(".svg")) return "image/svg+xml";
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  }

  /* ---------------- 抓取代理 ---------------- */

  private WebResourceResponse proxyFetch(String target) {
    if (target == null || target.trim().isEmpty()) return jsonError(400, "缺少 url 参数");

    URL u;
    try {
      u = new URL(target.trim());
    } catch (Exception e) {
      return jsonError(400, "链接格式不正确");
    }
    String proto = u.getProtocol() == null ? "" : u.getProtocol().toLowerCase(Locale.ROOT);
    if (!proto.equals("http") && !proto.equals("https")) return jsonError(400, "只支持 http / https 链接");
    if (blockedHost(u.getHost())) return jsonError(403, "不允许抓取内网或本机地址");

    try {
      Res r = httpGet(u.toString());
      String text = decode(r.body, r.ct);

      /* 反爬拦截页必须先识别：Cloudflare 的人机验证页既可能 200 也可能 403，
         之前直接把它当正文交回前端，最后报成「只抓到 0 个词，站点可能靠 JS 渲染」，
         把用户往错误的排查方向上引。与 serve.mjs（桌面端）保持一致。 */
      String[] blk = detectBlock(text);
      if (blk != null) {
        String why = "1".equals(blk[1])
            ? "被 Cloudflare 的人机验证挡住了（需要真人在浏览器里点一下验证才放行）"
            : "被站点防火墙判定为机器人访问，已拒绝";
        String msg = why + (blk[0].isEmpty() ? "" : "（Ray ID " + blk[0] + "）")
            + "。这不是网络问题：手机浏览器能打开原文，只是应用内的抓取被拦。"
            + "请在浏览器里打开原文，手动复制正文粘贴进来。";
        return jsonBlocked("cloudflare", blk[0], msg);
      }

      if (r.status < 200 || r.status >= 300) {
        String tip = (r.status == 401 || r.status == 403) ? "（站点有反爬或需要登录，建议手动复制正文）" : "";
        return jsonError(502, "目标站点返回 " + r.status + tip);
      }
      if (!looksLikeText(r.ct)) {
        return jsonError(415, "该链接不是网页或订阅源（" + (r.ct.isEmpty() ? "未知类型" : r.ct) + "）");
      }
      /* 按纯文本回吐：这份内容是第三方站点的原始 HTML，用 text/html 交付的话，
         一旦有人把它直接开在标签页里，对方脚本就会跑在本应用的源下读走 localStorage。 */
      InputStream in = new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
      return new WebResourceResponse("text/plain", "utf-8", 200, "OK", responseHeaders(), in);
    } catch (IOException e) {
      String msg = e.getMessage() == null ? "网络错误" : e.getMessage();
      if (msg.contains("页面体积过大")) return jsonError(413, "页面体积过大（> 8MB），请手动复制正文");
      return jsonError(502, "抓取失败：" + msg + "。若境外站点连不上，检查手机网络是否能访问该站。");
    } catch (Exception e) {
      return jsonError(502, "抓取失败：" + e.getClass().getSimpleName());
    }
  }

  private static final class Res {
    int status;
    String ct = "";
    byte[] body = new byte[0];
  }

  private Res httpGet(String urlStr) throws IOException {
    String cur = urlStr;
    for (int hop = 0; hop < 5; hop++) {
      HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
      c.setInstanceFollowRedirects(false);
      c.setConnectTimeout(TIMEOUT_CONNECT);
      c.setReadTimeout(TIMEOUT_READ);
      c.setRequestProperty("User-Agent", UA);
      c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
      c.setRequestProperty("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8");
      c.setRequestProperty("Accept-Encoding", "identity");

      int code = c.getResponseCode();
      if (code >= 300 && code < 400) {
        String loc = c.getHeaderField("Location");
        c.disconnect();
        if (loc == null) break;
        URL next = new URL(new URL(cur), loc);
        String protocol = next.getProtocol();
        if (!"http".equals(protocol) && !"https".equals(protocol)) {
          throw new IOException("重定向到不支持的协议");
        }
        if (blockedHost(next.getHost())) throw new IOException("重定向到内网或本机地址，已拒绝");
        cur = next.toString();
        continue;
      }

      Res r = new Res();
      r.status = code;
      String ct = c.getContentType();
      r.ct = ct == null ? "" : ct;
      InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
      if (is != null) {
        if ("gzip".equalsIgnoreCase(c.getContentEncoding())) is = new GZIPInputStream(is);
        r.body = readAll(is, MAX_BYTES);
        is.close();
      }
      c.disconnect();
      return r;
    }
    Res r = new Res();
    r.status = 508;
    r.body = "重定向次数过多".getBytes(StandardCharsets.UTF_8);
    return r;
  }

  private static byte[] readAll(InputStream in, int cap) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[16 * 1024];
    int n, total = 0;
    while ((n = in.read(buf)) > 0) {
      total += n;
      if (total > cap) throw new IOException("页面体积过大");
      out.write(buf, 0, n);
    }
    return out.toByteArray();
  }

  private static String decode(byte[] buf, String ct) {
    String cs = null;
    Matcher m = Pattern.compile("charset=[\"']?([\\w-]+)", Pattern.CASE_INSENSITIVE).matcher(ct);
    if (m.find()) cs = m.group(1);
    if (cs == null || cs.toLowerCase(Locale.ROOT).matches("iso-8859-1|latin1|us-ascii")) {
      String head = new String(buf, 0, Math.min(buf.length, 4096), StandardCharsets.ISO_8859_1);
      Matcher m2 = Pattern.compile("<meta[^>]+charset=[\"']?([\\w-]+)", Pattern.CASE_INSENSITIVE).matcher(head);
      if (m2.find()) cs = m2.group(1);
    }
    Charset charset;
    try {
      charset = cs == null ? StandardCharsets.UTF_8 : Charset.forName(cs);
    } catch (Exception e) {
      charset = StandardCharsets.UTF_8;
    }
    return new String(buf, charset);
  }

  private static boolean looksLikeText(String ct) {
    String c = ct.toLowerCase(Locale.ROOT);
    return c.contains("text/html") || c.contains("application/xhtml") || c.contains("text/plain")
        || c.contains("text/xml") || c.contains("application/xml") || c.contains("application/rss")
        || c.contains("application/atom") || c.contains("application/feed");
  }

  private static boolean blockedHost(String host) {
    if (host == null) return true;
    String h = host.toLowerCase(Locale.ROOT).replaceAll("^\\[|\\]$", "");
    if (h.isEmpty()) return true;
    if (h.equals("localhost") || h.endsWith(".localhost") || h.equals("::1") || h.equals("0.0.0.0")) return true;
    if (h.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) {
      String[] p = h.split("\\.");
      int a = Integer.parseInt(p[0]);
      int b = Integer.parseInt(p[1]);
      if (a == 0 || a == 10 || a == 127) return true;
      if (a == 192 && b == 168) return true;
      if (a == 172 && b >= 16 && b <= 31) return true;
      if (a == 169 && b == 254) return true;
      if (a == 100 && b >= 64 && b <= 127) return true;
    }
    /* 字面检查只能挡住写死的 IP。公网域名解析到 127.0.0.1（如 127.0.0.1.nip.io）
       一样能摸到本机服务，所以必须真解析一次，对每个返回地址再判。 */
    try {
      for (java.net.InetAddress ia : java.net.InetAddress.getAllByName(h)) {
        String ip = ia.getHostAddress();
        if (ip == null) continue;
        if (ia.isAnyLocalAddress() || ia.isLoopbackAddress() || ia.isLinkLocalAddress()
            || ia.isSiteLocalAddress() || ia.isMulticastAddress()) return true;
        if (ip.equals("::1") || ip.equals("::") || ip.equals("0.0.0.0")) return true;
        String[] q = ip.split("\\.");
        if (q.length == 4) {
          try {
            int a = Integer.parseInt(q[0]);
            int b = Integer.parseInt(q[1]);
            if (a == 0 || a == 10 || a == 127) return true;
            if (a == 192 && b == 168) return true;
            if (a == 172 && b >= 16 && b <= 31) return true;
            if (a == 169 && b == 254) return true;
            if (a == 100 && b >= 64 && b <= 127) return true;
          } catch (NumberFormatException ignored) { }
        } else if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
          return true;   // IPv6 唯一本地 / 链路本地
        }
      }
    } catch (Exception ignored) { }
    return false;
  }

  /* ---------------- 反爬 / 人机验证识别 ---------------- */

  private static final Pattern[] BLOCK_SIGNS = {
      Pattern.compile("cloudflare ray id:\\s*([a-z0-9]{8,})", Pattern.CASE_INSENSITIVE),
      Pattern.compile("attention required!?\\s*\\|\\s*cloudflare", Pattern.CASE_INSENSITIVE),
      Pattern.compile("checking your browser before accessing", Pattern.CASE_INSENSITIVE),
      Pattern.compile("cf-browser-verification|cf-challenge|cf_chl_|cf-error-details", Pattern.CASE_INSENSITIVE),
      Pattern.compile("<title>\\s*just a moment\\.\\.\\.\\s*</title>", Pattern.CASE_INSENSITIVE),
      Pattern.compile("enable javascript and cookies to continue", Pattern.CASE_INSENSITIVE),
      Pattern.compile("sorry, you have been blocked", Pattern.CASE_INSENSITIVE),
      Pattern.compile("your access has been blocked", Pattern.CASE_INSENSITIVE),
      Pattern.compile("security protections triggered a block", Pattern.CASE_INSENSITIVE),
  };

  /** 命中返回 {ray, "1"=人机验证 / "0"=直接拒绝}，否则 null。只看前 24KB，够用且快。 */
  private static String[] detectBlock(String text) {
    if (text == null || text.isEmpty()) return null;
    String head = text.length() > 24000 ? text.substring(0, 24000) : text;
    boolean hit = false;
    for (Pattern p : BLOCK_SIGNS) {
      if (p.matcher(head).find()) { hit = true; break; }
    }
    if (!hit) return null;
    String ray = "";
    Matcher m = BLOCK_SIGNS[0].matcher(head);
    if (m.find()) ray = m.group(1);
    String lower = head.toLowerCase(Locale.ROOT);
    boolean challenge = lower.contains("checking your browser")
        || lower.contains("enable javascript and cookies")
        || lower.contains("just a moment");
    return new String[] { ray, challenge ? "1" : "0" };
  }

  private static Map<String, String> responseHeaders() {
    Map<String, String> h = new HashMap<>();
    h.put("X-Content-Type-Options", "nosniff");
    h.put("Cache-Control", "no-store");
    return h;
  }

  /** 转义成合法的 JSON 字符串字面量内容。异常信息里带换行是常事，
   *  以前只转义了 \ 和 "，生成的就是非法 JSON，前端 JSON.parse 失败后只能显示
   *  「抓取失败（HTTP 502）」，真正的原因全丢了。 */
  private static String jsonStr(String s) {
    StringBuilder b = new StringBuilder(s.length() + 16);
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '\\': b.append("\\\\"); break;
        case '"': b.append("\\\""); break;
        case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break;
        case '\t': b.append("\\t"); break;
        default:
          if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
          else b.append(c);
      }
    }
    return b.toString();
  }

  private WebResourceResponse jsonError(int code, String msg) {
    String body = "{\"error\":\"" + jsonStr(msg) + "\"}";
    return new WebResourceResponse("application/json", "utf-8", code, "ERR", responseHeaders(),
        new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
  }

  /** 反爬拦截：多带 blocked / ray 两个字段，前端据此给出「用浏览器打开复制正文」的指引。 */
  private WebResourceResponse jsonBlocked(String vendor, String ray, String msg) {
    String body = "{\"blocked\":\"" + jsonStr(vendor) + "\",\"ray\":\"" + jsonStr(ray)
        + "\",\"error\":\"" + jsonStr(msg) + "\"}";
    return new WebResourceResponse("application/json", "utf-8", 403, "Blocked", responseHeaders(),
        new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
  }
}
