package uz.billiardclub.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * WebView o'zi fayl yuklamaydi (Android'da DownloadListener bo'lmasa havola
     * jimgina hech narsa qilmaydi). Ilova yangilanishi (APK) va boshqa fayllar
     * tizim brauzeriga beriladi — u yuklab oladi va o'rnatishni taklif qiladi.
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) {
                // Brauzer yo'q (juda kam uchraydi) — foydalanuvchi /download sahifasidan yuklaydi
            }
        });
    }
}
