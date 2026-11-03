package com.example.weblauncher;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

/**
 * MainActivity.java
 * Configuração de alto desempenho para hospedar PWA dentro de WebView nativa no Android.
 * Resolve erros comuns de:
 * 1. ERR_CONNECTION_REFUSED (orienta sobre 10.0.2.2 vs localhost)
 * 2. Service Worker bloqueado (habilita cache e storage)
 * 3. Conteúdo misto HTTP/HTTPS
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;

    // Emulador Android Studio acessa a máquina host em: http://10.0.2.2:3000
    // Em produção use: https://seu-app.com
    private static final String APP_URL = "http://10.0.2.2:3000";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();

        // 1. Essencial para PWAs modernas: Execução de scripts e armazenamento local
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // 2. Cache e Service Worker
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // 3. Suporte a viewport responsivo de PWA
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        // 4. Conteúdo Misto (HTTP e HTTPS simultâneo)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // 5. Configuração do WebViewClient com captura de ERR_CONNECTION_REFUSED
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Mantém todas as navegações dentro da WebView
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                
                // Trata erro de conexão recusada no carregamento principal
                if (request.isForMainFrame()) {
                    String url = request.getUrl().toString();
                    if (url.contains("localhost") || url.contains("127.0.0.1")) {
                        Toast.makeText(
                            MainActivity.this,
                            "Erro: 'localhost' no emulador se refere ao próprio emulador. Use '10.0.2.2' para acessar seu PC!",
                            Toast.LENGTH_LONG
                        ).show();
                    } else {
                        Toast.makeText(
                            MainActivity.this,
                            "Erro de conexão (" + error.getDescription() + "). Verifique se o servidor está rodando em 0.0.0.0!",
                            Toast.LENGTH_LONG
                        ).show();
                    }
                }
            }
        });

        // Inicia o carregamento da PWA
        webView.loadUrl(APP_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
