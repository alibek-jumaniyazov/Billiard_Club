package uz.billiardclub.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    /** Splash shundan uzoq turmaydi — sekin tarmoqda ham ilova "qotib" qolmasin */
    private static final long SPLASH_MAX_MS = 8000;

    /** Birinchi sahifa (kirish yoki ish ekrani) tayyor bo'ldimi */
    private volatile boolean firstPageReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Dastur kabi ochilish: brend splash ekrani birinchi sahifa yuklanguncha
        // turadi — "sayt yuklanyapti" degan bo'sh qora oyna ko'rinmaydi
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        final long started = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(
            () -> !firstPageReady && SystemClock.uptimeMillis() - started < SPLASH_MAX_MS
        );

        if (getBridge() == null) {
            firstPageReady = true;
            return;
        }
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    firstPageReady = true;
                }

                @Override
                public void onReceivedError(WebView webView) {
                    // Oflayn sahifa ham darhol ko'rinsin
                    firstPageReady = true;
                }
            }
        );

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            firstPageReady = true;
            return;
        }

        // Sayt odatlari yo'q: ikki barmoq bilan kattalashtirish va chetga
        // tortilganda "rezina" yorug'lik — nativ ilovalarda bo'lmaydi
        WebSettings settings = webView.getSettings();
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Fayl orqali kirib bo'lmasin: WebView qurilmadagi file:// sahifalarni
        // ochmaydi (ilova sahifalari https orqali beriladi, fayl kerak emas)
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);

        /*
         * WebView o'zi fayl yuklamaydi (Android'da DownloadListener bo'lmasa havola
         * jimgina hech narsa qilmaydi). Ilova yangilanishi (APK) va boshqa fayllar
         * tizim brauzeriga beriladi — u yuklab oladi va o'rnatishni taklif qiladi.
         */
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
