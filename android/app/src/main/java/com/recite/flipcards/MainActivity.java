package com.recite.flipcards;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // WebView 远程调试：手机连电脑 USB 后，在电脑 Chrome 访问
    // chrome://inspect/#devices 即可看到控制台日志，便于排查白屏等问题。
    WebView.setWebContentsDebuggingEnabled(true);
  }
}
