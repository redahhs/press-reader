package com.pressreader.app;

import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Android WebView 里没有 speechSynthesis（Web Speech API 不可用），
 * 而「听力精听」整个模块都靠 TTS 驱动。这里把系统的 TextToSpeech 桥给 JS：
 *   JS 侧 TTS.speak() 检测到 window.AndroidTTS 就走这条路径，
 *   朗读结束时原生回调 window.__ttsDone(id, status) 来 resolve 掉那个 Promise。
 */
public class TtsBridge implements TextToSpeech.OnInitListener {

  private final WebView web;
  private TextToSpeech tts;
  private volatile boolean ready = false;

  public TtsBridge(Activity act, WebView web) {
    this.web = web;
    this.tts = new TextToSpeech(act.getApplicationContext(), this);
  }

  @Override
  public void onInit(int status) {
    if (status != TextToSpeech.SUCCESS || tts == null) return;
    int r = tts.setLanguage(Locale.US);
    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
      r = tts.setLanguage(Locale.ENGLISH);
    }
    ready = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;

    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
      @Override public void onStart(String id) {}

      @Override public void onDone(String id) { fire(id, "end"); }

      @Override public void onStop(String id, boolean interrupted) { fire(id, "stopped"); }

      @Override public void onError(String id) { fire(id, "error"); }

      @Override public void onError(String id, int code) { fire(id, "error"); }
    });
  }

  @JavascriptInterface
  public boolean isReady() { return ready; }

  @JavascriptInterface
  public void speak(String text, float rate, String id) {
    if (!ready || tts == null || text == null || text.trim().isEmpty()) {
      fire(id, "error");
      return;
    }
    float r = rate <= 0 ? 1f : Math.max(0.3f, Math.min(2.0f, rate));
    tts.setSpeechRate(r);
    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
  }

  @JavascriptInterface
  public void stop() {
    if (tts != null) tts.stop();
  }

  /** 页面销毁时释放引擎 */
  public void release() {
    ready = false;
    if (tts != null) {
      try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {}
      tts = null;
    }
  }

  private void fire(final String id, final String status) {
    if (id == null || web == null) return;
    final String js = "window.__ttsDone(" + JSONObject.quote(id) + "," + JSONObject.quote(status) + ")";
    web.post(new Runnable() {
      @Override public void run() {
        if (web != null) web.evaluateJavascript(js, null);
      }
    });
  }
}
